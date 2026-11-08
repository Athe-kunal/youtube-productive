// Embedding models the extension can be built with. `make release MODEL=<key>`
// (or MODEL=<key> npm run build / fetch-model) picks one; it is baked into the
// bundle at build time and only that model ships in dist/ and release.zip.
// Everything is bundled, so nothing is ever downloaded at runtime.
export const MODELS = {
  // English only, ~34 MB.
  "bge-small": {
    id: "Xenova/bge-small-en-v1.5",
    label: "English",
    dim: 384,
    // BGE was trained with an instruction prefix on the query side for
    // retrieval-style tasks; passages are embedded as-is.
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    sizeLabel: "34 MB, bundled",
  },
  // ~100 languages, ~135 MB. e5 models are trained with "query: " /
  // "passage: " prefixes: the intent text is the query, titles are passages.
  "e5-small": {
    id: "Xenova/multilingual-e5-small",
    label: "Multilingual",
    dim: 384,
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
    sizeLabel: "135 MB, bundled",
  },
};

export const DEFAULT_MODEL_KEY = "bge-small";

/** Empty/undefined -> the default; unknown keys throw with the valid list. */
export function resolveModelKey(raw) {
  const key = (raw || "").trim() || DEFAULT_MODEL_KEY;
  if (!Object.hasOwn(MODELS, key)) {
    throw new Error(`Unknown MODEL "${key}". Use one of: ${Object.keys(MODELS).join(", ")}.`);
  }
  return key;
}
