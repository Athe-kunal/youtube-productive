import { pipeline, env } from "@xenova/transformers";
import { MODEL_TIERS } from "../shared/constants.js";

// The model ships inside the extension package (see scripts/fetch-model.mjs
// and build.mjs) — remote loading stays permanently off, so nothing is ever
// fetched at runtime.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL("models/");
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("models/wasm/");

// Single-threaded WASM only: the multi-threaded backend spins up a Worker
// that calls importScripts() on a blob: URL, which has a documented history
// of breaking inside extension pages.
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;

const extractorPromises = new Map();

async function loadModel(tier, onProgress) {
  const tierConfig = MODEL_TIERS[tier];
  if (!tierConfig) throw new Error(`Unknown model tier: ${tier}`);
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
