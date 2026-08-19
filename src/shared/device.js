import { SCORE_CHUNK_SIZE } from "./constants.js";

// Cheap capability signal for hardware-adaptive tuning. hardwareConcurrency
// and deviceMemory are both available in Chrome (fine — this only ever runs
// inside a Chrome extension) and, while neither is a precise benchmark,
// together they distinguish a low-RAM/low-core Chromebook or old laptop
// from a capable desktop well enough to pick smaller work units instead of
// handing every device the same fixed batch size.
function getHardwareTier() {
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  // deviceMemory is a Chrome-only, rounded-down approximation (in GB) and is
  // undefined on some platforms — treat "unknown" as mid-range rather than
  // penalizing devices that just don't report it.
  const memoryGB = (typeof navigator !== "undefined" && navigator.deviceMemory) || 4;
  if (cores <= 2 || memoryGB <= 2) return "low";
  if (cores <= 4 || memoryGB <= 4) return "medium";
  return "high";
}

// Smaller embedding batches on weak hardware keep each round trip to the
// offscreen document short (less peak tensor memory, faster time-to-first
// dim) at the cost of slightly more message-passing overhead — a good trade
// when the alternative is a multi-second single-threaded WASM batch. Capable
// hardware keeps the original default.
const CHUNK_SIZE_BY_TIER = { low: 10, medium: 20, high: SCORE_CHUNK_SIZE };

// How many cards the content script extracts synchronously before yielding
// back to the main thread. A long first-load or an hour-long scroll session
// can accumulate hundreds of cards; without a yield point, extracting them
// all in one synchronous pass is a long task that visibly janks scrolling
// on a slow CPU even though the actual model inference is already
// off-thread. Capable hardware can afford bigger uninterrupted slices.
const EXTRACT_YIELD_EVERY_BY_TIER = { low: 15, medium: 25, high: 50 };

export const HARDWARE_TIER = getHardwareTier();
export const ADAPTIVE_SCORE_CHUNK_SIZE = CHUNK_SIZE_BY_TIER[HARDWARE_TIER];
export const EXTRACT_YIELD_EVERY = EXTRACT_YIELD_EVERY_BY_TIER[HARDWARE_TIER];

// Prefer the scheduler API (cooperative, prioritized) when available;
// setTimeout(0) is the universal fallback macrotask break.
export function yieldToMain() {
  if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
    return scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
