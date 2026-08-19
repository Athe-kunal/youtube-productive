import { MSG, onMessage } from "../shared/messaging.js";
import { cosineSimilarity } from "../shared/scoring.js";
import { loadExtractor, embed, embedResilient } from "../lib/model-loader.js";
import {
  BGE_QUERY_PREFIX,
  AVOID_LAMBDA,
  DEFAULT_MODEL_TIER,
  LARGE_MODEL_SCORE_CHUNK_SIZE,
} from "../shared/constants.js";

// Keyed by tier so switching back and forth doesn't re-download/re-init a
// model that's already loaded — each tier gets its own memoized extractor.
const extractors = new Map();
const loadingPromises = new Map();

function tierOf(payload) {
  return (payload && payload.tier) || DEFAULT_MODEL_TIER;
}

// transformers.js reports progress per file (config.json, tokenizer.json,
// onnx weights, ...), each restarting its own 0-100% run. Forwarding that
// raw makes the displayed percentage jump backward every time a new file
// starts downloading. Instead, track loaded/total bytes per file and report
// one combined, monotonically non-decreasing percentage across the whole
// load.
function makeAggregateProgress(onProgress) {
  const files = new Map();
  let lastPercent = 0;
  return (progress) => {
    if (progress && progress.status === "progress" && progress.file) {
      files.set(progress.file, {
        loaded: progress.loaded || 0,
        total: progress.total || progress.loaded || 0,
      });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      const percent = total > 0 ? (loaded / total) * 100 : 0;
      lastPercent = Math.max(lastPercent, percent);
      onProgress({ ...progress, progress: lastPercent });
    } else {
      onProgress(progress);
    }
  };
}

async function ensureModel(tier) {
  if (extractors.has(tier)) return extractors.get(tier);
  if (!loadingPromises.has(tier)) {
    const promise = loadExtractor(
      tier,
      makeAggregateProgress((progress) => {
        chrome.runtime.sendMessage({
          type: MSG.MODEL_DOWNLOAD_PROGRESS,
          payload: { tier, ...progress },
        });
      })
    )
      .then((e) => {
        extractors.set(tier, e);
        chrome.runtime.sendMessage({ type: MSG.MODEL_READY, payload: { tier } });
        return e;
      })
      .catch((err) => {
        loadingPromises.delete(tier);
        chrome.runtime.sendMessage({
          type: MSG.MODEL_ERROR,
          payload: { tier, message: String(err && err.message ? err.message : err) },
        });
        throw err;
      });
    loadingPromises.set(tier, promise);
  }
  return loadingPromises.get(tier);
}

async function scoreChunk(extractor, intentVector, avoidVector, videos) {
  const vectors = await embedResilient(extractor, videos.map((v) => v.title));
  return videos
    .map((v, i) => {
      if (!vectors[i]) return null;
      let score = cosineSimilarity(intentVector, vectors[i]);
      if (avoidVector) score -= AVOID_LAMBDA * cosineSimilarity(avoidVector, vectors[i]);
      return { videoId: v.videoId, score };
    })
    .filter(Boolean);
}

onMessage((type, payload, _sender, sendResponse) => {
  if (type === MSG.ENSURE_MODEL_LOADED) {
    ensureModel(tierOf(payload))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (type === MSG.EMBED_INTENT) {
    ensureModel(tierOf(payload))
      .then((e) => embed(e, [BGE_QUERY_PREFIX + payload.text]))
      .then(([vector]) => sendResponse({ ok: true, vector }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (type === MSG.SCORE_BATCH) {
    // Only the title is embedded here — appending the channel name dilutes
    // a short title's signal with tokens the intent never mentions.
    // Channel-based filtering is handled explicitly via include/exclude
    // keywords instead (shared/keyword-filter.js).
    const { intentVector, avoidVector, videos } = payload;
    const tier = tierOf(payload);
    ensureModel(tier)
      .then(async (e) => {
        const chunkSize = tier === "large" ? LARGE_MODEL_SCORE_CHUNK_SIZE : videos.length || 1;
        const results = [];
        for (let i = 0; i < videos.length; i += chunkSize) {
          const chunk = videos.slice(i, i + chunkSize);
          results.push(...(await scoreChunk(e, intentVector, avoidVector, chunk)));
        }
        const failedCount = videos.length - results.length;
        sendResponse({ ok: true, results, failedCount });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return undefined;
}, { target: "offscreen" });

ensureModel(DEFAULT_MODEL_TIER).catch(() => {
  // Errors are already reported via MODEL_ERROR; nothing further to do here.
});
