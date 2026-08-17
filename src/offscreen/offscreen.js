import { MSG, onMessage } from "../shared/messaging.js";
import { cosineSimilarity } from "../shared/scoring.js";
import { loadExtractor, embed, embedResilient } from "../lib/model-loader.js";
import { BGE_QUERY_PREFIX } from "../shared/constants.js";

let extractor = null;
let loadingPromise = null;

async function ensureModel() {
  if (extractor) return extractor;
  if (!loadingPromise) {
    loadingPromise = loadExtractor((progress) => {
      chrome.runtime.sendMessage({
        type: MSG.MODEL_DOWNLOAD_PROGRESS,
        payload: progress,
      });
    })
      .then((e) => {
        extractor = e;
        chrome.runtime.sendMessage({ type: MSG.MODEL_READY });
        return e;
      })
      .catch((err) => {
        loadingPromise = null;
        chrome.runtime.sendMessage({
          type: MSG.MODEL_ERROR,
          payload: { message: String(err && err.message ? err.message : err) },
        });
        throw err;
      });
  }
  return loadingPromise;
}

onMessage((type, payload, _sender, sendResponse) => {
  if (type === MSG.ENSURE_MODEL_LOADED) {
    ensureModel()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (type === MSG.EMBED_INTENT) {
    ensureModel()
      .then((e) => embed(e, [BGE_QUERY_PREFIX + payload.text]))
      .then(([vector]) => sendResponse({ ok: true, vector }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (type === MSG.SCORE_BATCH) {
    const { intentVector, videos } = payload;
    ensureModel()
      .then((e) => embedResilient(e, videos.map((v) => `${v.title} ${v.channel || ""}`.trim())))
      .then((vectors) => {
        const results = videos
          .map((v, i) => (vectors[i] ? { videoId: v.videoId, score: cosineSimilarity(intentVector, vectors[i]) } : null))
          .filter(Boolean);
        const failedCount = videos.length - results.length;
        sendResponse({ ok: true, results, failedCount });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return undefined;
});

ensureModel().catch(() => {
  // Errors are already reported via MODEL_ERROR; nothing further to do here.
});
