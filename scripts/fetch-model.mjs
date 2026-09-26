// Dev-time setup script (never shipped in the extension): downloads the
// bundled embedding model files plus the onnxruntime-web WASM binaries into
// models/, so the packaged extension runs fully offline. Run manually with
// `npm run fetch-model`. Keep MODEL_ID in sync with MODEL_TIERS.small.id in
// src/shared/constants.js.
import fs from "node:fs/promises";
import path from "node:path";

const MODEL_ID = "Xenova/bge-small-en-v1.5";
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
];

// Single-threaded builds only — the model always runs single-threaded (see
// src/lib/model-loader.js).
const WASM_FILES = ["ort-wasm.wasm", "ort-wasm-simd.wasm"];

// Matches the onnxruntime-web version pinned by @xenova/transformers.
const ORT_VERSION = "1.14.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;

async function download(url, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

async function main() {
  const modelDir = path.join("models", MODEL_ID);
  for (const file of MODEL_FILES) {
    await download(`${HF_BASE}/${file}`, path.join(modelDir, file));
  }

  const wasmDir = path.join("models", "wasm");
  for (const file of WASM_FILES) {
    try {
      await download(`${ORT_BASE}/${file}`, path.join(wasmDir, file));
    } catch (err) {
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }

  console.log("Model + WASM assets ready in models/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
