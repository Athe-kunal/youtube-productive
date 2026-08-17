import { pipeline, env } from "@xenova/transformers";
import { MODEL_ID } from "../shared/constants.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL("models/");
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("models/wasm/");

// The multi-threaded onnxruntime-web backend spins up a Worker that calls
// importScripts() on a blob: URL — this fails inside the offscreen
// document's sandbox (NetworkError). Forcing single-threaded WASM avoids
// spawning that worker entirely; a few dozen short titles per batch is
// fast enough single-threaded that this costs nothing in practice.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let extractorPromise = null;

export function loadExtractor(onProgress) {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      quantized: true,
      progress_callback: onProgress,
    });
  }
  return extractorPromise;
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
