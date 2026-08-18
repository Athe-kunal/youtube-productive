// bge-small ranks topically-relevant-but-lexically-different titles (e.g.
// "GPT-5 explained" for an "LLM" intent) above irrelevant ones more
// reliably than MiniLM in practice — MiniLM leans heavily on literal word
// overlap, which produces bad rankings for short keyword-style intents.
export const MODEL_ID = "Xenova/bge-small-en-v1.5";
// BGE was trained with an instruction prefix on the query side for
// retrieval-style tasks; passages are embedded as-is.
export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

// Embedding models have no representation of negation ("no football" sits
// right next to "football" in embedding space), so avoidance is a second,
// separately embedded vector rather than text appended to the intent.
// Weight for subtracting the avoid-intent similarity from the intent
// similarity: score = cos(title, intent) - AVOID_LAMBDA * cos(title, avoid).
export const AVOID_LAMBDA = 0.75;

export const STORAGE_KEYS = {
  INTENT_TEXT: "yif_intent_text",
  INTENT_VECTOR: "yif_intent_vector",
  AVOID_TEXT: "yif_avoid_text",
  AVOID_VECTOR: "yif_avoid_vector",
  INTENT_VERSION: "yif_intent_version",
  // Calibration turns raw margin scores (which don't transfer across
  // intents) into an absolute cutoff: { mean, std, version }, fit once on
  // save against a fixed probe title set. See shared/probe-titles.js.
  CALIBRATION: "yif_calibration",
  // Cutoff is mean + SENSITIVITY_K * std. Renamed from the old "keep
  // fraction" THRESHOLD key (percentile-based) so upgrading users fall
  // back to the default rather than having an old fraction silently
  // reinterpreted as a std-dev multiplier.
  SENSITIVITY_K: "yif_sensitivity_k",
  INCLUDE_KEYWORDS: "yif_include_keywords",
  EXCLUDE_KEYWORDS: "yif_exclude_keywords",
  SCORE_CACHE: "yif_score_cache",
  // { weekday: {start, end}, weekend: {start, end} }, "HH:MM" 24h strings.
  // Outside the active window the extension shows everything untouched —
  // see shared/schedule.js.
  SCHEDULE: "yif_schedule",
};

export const DEFAULT_SENSITIVITY_K = 0.25;
// Whole day by default — the schedule only narrows this if the user sets
// it explicitly.
export const DEFAULT_SCHEDULE = {
  weekday: { start: "00:00", end: "23:59" },
  weekend: { start: "00:00", end: "23:59" },
};
export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.INTENT_TEXT]: "",
  [STORAGE_KEYS.INTENT_VECTOR]: null,
  [STORAGE_KEYS.AVOID_TEXT]: "",
  [STORAGE_KEYS.AVOID_VECTOR]: null,
  [STORAGE_KEYS.INTENT_VERSION]: 0,
  [STORAGE_KEYS.CALIBRATION]: null,
  [STORAGE_KEYS.SENSITIVITY_K]: DEFAULT_SENSITIVITY_K,
  [STORAGE_KEYS.INCLUDE_KEYWORDS]: [],
  [STORAGE_KEYS.EXCLUDE_KEYWORDS]: [],
  [STORAGE_KEYS.SCHEDULE]: DEFAULT_SCHEDULE,
};

// How often an already-open tab re-checks whether it just entered/left the
// active schedule window, so a long-lived tab doesn't need a page reload
// to pick up a boundary crossing (e.g. work hours ending at 17:00).
export const SCHEDULE_RECHECK_MS = 60000;

export const DEBOUNCE_MS = 150;
export const SCORE_CACHE_LIMIT = 2000;
// Cards are marked processed and skipped on later passes; each mutation
// batch only needs to embed/decide the cards that are actually new.
export const SCORE_CHUNK_SIZE = 32;
export const CACHE_FLUSH_DEBOUNCE_MS = 5000;
// A title that fails to embed twice is given up on (cached as permanently
// dimmed) instead of being resent on every subsequent pass forever.
export const MAX_SCORE_ATTEMPTS = 2;
