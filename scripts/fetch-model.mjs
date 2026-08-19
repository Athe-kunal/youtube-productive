// One-time setup script: downloads the bundled small-model files plus the
// onnxruntime-web WASM binaries into models/, so the extension can run
// fully offline for its default tier. Run manually with `npm run
// fetch-model`. Keep MODEL_ID in sync with MODEL_TIERS.small.id in
// src/shared/constants.js.
//
// The large tier (bge-m3, ~570MB) is deliberately NOT fetched here — it's
// opt-in and downloaded remotely at runtime on first use (see
// src/lib/model-loader.js), never bundled into the package.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_ID = "Xenova/bge-small-en-v1.5";
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
];

// Non-threaded builds back the bundled small model (always single-
// threaded — see src/lib/model-loader.js). Threaded builds back the
// opt-in large model's multi-thread attempt; they ship already in
// @xenova/transformers' own dist/, so they're copied locally instead of
// re-fetched from a CDN.
const WASM_FILES = ["ort-wasm.wasm", "ort-wasm-simd.wasm"];
const THREADED_WASM_FILES = ["ort-wasm-threaded.wasm", "ort-wasm-simd-threaded.wasm"];

// Matches the onnxruntime-web version pinned by @xenova/transformers.
const ORT_VERSION = "1.14.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;

const ORT_DIST_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "@xenova",
  "transformers",
  "dist"
);

async function download(url, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

async function copyLocal(file, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  console.log(`Copying ${file} from node_modules`);
  await fs.copyFile(path.join(ORT_DIST_DIR, file), destPath);
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
  for (const file of THREADED_WASM_FILES) {
    try {
      await copyLocal(file, path.join(wasmDir, file));
    } catch (err) {
      console.warn(`Skipping ${file}: ${err.message} (run \`npm install\` first)`);
    }
  }

  console.log("Model + WASM assets ready in models/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
