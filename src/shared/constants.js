// bge-small ranks topically-relevant-but-lexically-different titles (e.g.
// "GPT-5 explained" for an "LLM" intent) above irrelevant ones more
// reliably than MiniLM in practice — MiniLM leans heavily on literal word
// overlap, which produces bad rankings for short keyword-style intents.
export const MODEL_ID = "Xenova/bge-small-en-v1.5";
// BGE was trained with an instruction prefix on the query side for
// retrieval-style tasks; passages are embedded as-is.
export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

export const STORAGE_KEYS = {
  INTENT_TEXT: "yif_intent_text",
  INTENT_VECTOR: "yif_intent_vector",
  INTENT_VERSION: "yif_intent_version",
  THRESHOLD: "yif_threshold",
  INCLUDE_KEYWORDS: "yif_include_keywords",
  EXCLUDE_KEYWORDS: "yif_exclude_keywords",
  SCORE_CACHE: "yif_score_cache",
};

// THRESHOLD stores a "keep fraction" (0-1): the fraction of currently
// visible cards to keep shown, ranked by score descending, recomputed
// per batch. Absolute cosine-similarity cutoffs don't transfer cleanly
// across intents/models — relative ranking within what's on screen does.
export const DEFAULT_THRESHOLD = 0.5;
export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.INTENT_TEXT]: "",
  [STORAGE_KEYS.INTENT_VECTOR]: null,
  [STORAGE_KEYS.INTENT_VERSION]: 0,
  [STORAGE_KEYS.THRESHOLD]: DEFAULT_THRESHOLD,
  [STORAGE_KEYS.INCLUDE_KEYWORDS]: [],
  [STORAGE_KEYS.EXCLUDE_KEYWORDS]: [],
};

export const DEBOUNCE_MS = 150;
export const SCORE_CACHE_LIMIT = 2000;
