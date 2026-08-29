// bge-small ranks topically-relevant-but-lexically-different titles (e.g.
// "GPT-5 explained" for an "LLM" intent) above irrelevant ones more
// reliably than MiniLM in practice — MiniLM leans heavily on literal word
// overlap, which produces bad rankings for short keyword-style intents.
//
// bge-m3 is the opt-in upgrade: multilingual, more accurate, but ~17x the
// download size — never loaded unless the user picks it, and fetched
// remotely from the Hub on first use rather than bundled (see
// scripts/fetch-model.mjs, which deliberately does NOT fetch this one).
export const MODEL_TIERS = {
  small: {
    id: "Xenova/bge-small-en-v1.5",
    label: "Fast",
    dim: 384,
    remote: false,
    threaded: false,
    sizeLabel: "34 MB, bundled",
  },
  large: {
    id: "Xenova/bge-m3",
    label: "Accurate (multilingual)",
    dim: 1024,
    remote: true,
    threaded: true,
    sizeLabel: "~570 MB, downloaded once",
  },
};
export const DEFAULT_MODEL_TIER = "small";

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
  // Legacy single-profile keys. No longer written — storage.js#getProfiles
  // reads these once, on a fresh install with no PROFILES key yet, to carry
  // an existing user's setup forward into "Profile 1" rather than losing it.
  // Do not add new uses of these.
  INTENT_TEXT: "yif_intent_text",
  INTENT_VECTOR: "yif_intent_vector",
  AVOID_TEXT: "yif_avoid_text",
  AVOID_VECTOR: "yif_avoid_vector",
  INTENT_VERSION: "yif_intent_version",
  CALIBRATION: "yif_calibration",
  INCLUDE_KEYWORDS: "yif_include_keywords",
  EXCLUDE_KEYWORDS: "yif_exclude_keywords",
  SCHEDULE: "yif_schedule",
  SCHEDULE_ENABLED: "yif_schedule_enabled",

  // Array of up to MAX_PROFILES profile objects — see shared/profiles.js
  // for the shape and shared/schedule.js for how each profile's own
  // schedule is evaluated. Replaces all the legacy keys above: each
  // profile now carries its own intent/avoid/keywords/schedule instead of
  // there being one global set.
  PROFILES: "yif_profiles",

  // Which entry in MODEL_TIERS is active. Global, not per-profile —
  // switching tiers re-embeds every profile's vectors (see
  // background/service-worker.js#SET_MODEL_TIER) since it changes the
  // embedding dimension.
  MODEL_TIER: "yif_model_tier",
  // videoId-or-`${profileId}:${videoId}` -> { score, version }. Namespaced
  // by profile so two profiles with different intents never collide on the
  // same cached score for the same video.
  SCORE_CACHE: "yif_score_cache",
  // Master kill switch — off means show everything, no scoring, no
  // observer work, regardless of which profile is active.
  EXTENSION_ENABLED: "yif_extension_enabled",
  // Whether the first-install settings tour has been shown/skipped.
  TOUR_SEEN: "yif_tour_seen",
};

export const MAX_PROFILES = 3;

// Cutoff is mean + SENSITIVITY_K * std over calibration (see
// shared/scoring.js#calibratedCutoff). Fixed rather than user-tunable — a
// three-way "Show more / Balanced / Show less" control turned out to be
// more confusing than useful, since its effect depends on calibration the
// user can't see — so this lives only as a constant, not a storage key.
export const DEFAULT_SENSITIVITY_K = 0.25;

export const DEFAULT_SCHEDULE = {
  weekday: { start: "09:00", end: "17:00" },
  weekend: { start: "09:00", end: "17:00" },
};

// Global settings only — everything that used to live here for intent/
// keywords/schedule is now per-profile (see STORAGE_KEYS.PROFILES).
export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.MODEL_TIER]: DEFAULT_MODEL_TIER,
  [STORAGE_KEYS.EXTENSION_ENABLED]: true,
  [STORAGE_KEYS.TOUR_SEEN]: false,
};

// How often an already-open tab re-checks whether the active profile just
// changed (a schedule boundary crossing), so a long-lived tab doesn't need
// a page reload to pick it up.
export const SCHEDULE_RECHECK_MS = 60000;

export const DEBOUNCE_MS = 150;
export const SCORE_CACHE_LIMIT = 2000;
// Cards are marked processed and skipped on later passes; each mutation
// batch only needs to embed/decide the cards that are actually new.
export const SCORE_CHUNK_SIZE = 32;
// bge-m3 costs far more per item than bge-small (1024-dim, ~17x the
// params); the offscreen document re-chunks SCORE_BATCH work down to this
// size when the large tier is active, independent of the hardware-tier
// chunking content-script.js already does on the way in — that keeps peak
// tensor memory and per-round-trip latency sane for the heavier model.
export const LARGE_MODEL_SCORE_CHUNK_SIZE = 8;
export const CACHE_FLUSH_DEBOUNCE_MS = 5000;
// A title that fails to embed twice is given up on (cached as permanently
// dimmed) instead of being resent on every subsequent pass forever.
export const MAX_SCORE_ATTEMPTS = 2;
