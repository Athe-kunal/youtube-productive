import { pipeline, env } from "@xenova/transformers";
import { MODEL_TIERS } from "../shared/constants.js";
import { createLogger } from "../shared/log.js";

const log = createLogger("model-loader");

// Safe default until loadModel() sets it per-tier below — never fetch
// remotely before a tier has explicitly opted in.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL("models/");
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("models/wasm/");

// The multi-threaded onnxruntime-web backend spins up a Worker that calls
// importScripts() on a blob: URL — the manifest's CSP now allows blob:
// workers specifically so this can work, but it's still an environment
// with a documented history of breaking here, so loadExtractor() tries it
// only for tiers that opt in (MODEL_TIERS[tier].threaded) and falls back
// to the always-safe single-threaded path below on any failure.
env.backends.onnx.wasm.proxy = false;

const extractorPromises = new Map();

async function loadThreaded(tierConfig, onProgress) {
  env.backends.onnx.wasm.numThreads = Math.min(4, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4);
  try {
    const extractor = await pipeline("feature-extraction", tierConfig.id, {
      quantized: true,
      progress_callback: onProgress,
    });
    log.log(`${tierConfig.id}: loaded with ${env.backends.onnx.wasm.numThreads} threads`);
    return extractor;
  } catch (err) {
    log.warn(`${tierConfig.id}: threaded WASM load failed, falling back to single-threaded`, err);
    return null;
  }
}

async function loadModel(tier, onProgress) {
  const tierConfig = MODEL_TIERS[tier];
  if (!tierConfig) throw new Error(`Unknown model tier: ${tier}`);

  // Global on the shared `env` singleton — safe because only one
  // loadExtractor() call is ever in flight at a time in this codebase's
  // message-passing flow (offscreen.js memoizes per tier before calling
  // this again).
  env.allowRemoteModels = tierConfig.remote;

  if (tierConfig.threaded) {
    const extractor = await loadThreaded(tierConfig, onProgress);
    if (extractor) return extractor;
  }

  env.backends.onnx.wasm.numThreads = 1;
  return pipeline("feature-extraction", tierConfig.id, {
    quantized: true,
    progress_callback: onProgress,
  });
}

export function loadExtractor(tier, onProgress) {
  if (!extractorPromises.has(tier)) {
    extractorPromises.set(
      tier,
      loadModel(tier, onProgress).catch((err) => {
        extractorPromises.delete(tier);
        throw err;
      })
    );
  }
  return extractorPromises.get(tier);
}

export async function embed(extractor, texts) {
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const dim = output.dims[output.dims.length - 1];
  const vectors = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}

/**
 * Batch tokenization means one unusual title (odd unicode, unexpected
 * length) can throw and take the whole batch down with it. Falls back to
 * embedding items one at a time so a single bad title only costs that one
 * item — the caller gets `null` in that item's slot and should skip it.
 */
export async function embedResilient(extractor, texts) {
  try {
    return await embed(extractor, texts);
  } catch {
    const vectors = [];
    for (const text of texts) {
      try {
        vectors.push((await embed(extractor, [text]))[0]);
      } catch {
        vectors.push(null);
      }
    }
    return vectors;
  }
}
