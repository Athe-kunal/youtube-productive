// The stored number is a "keep fraction": the share of currently visible
// cards to keep shown, ranked by score descending. Not a raw cosine
// threshold — see shared/scoring.js#percentileCutoff for why.
export const SENSITIVITY_LEVELS = [
  { key: "loose", label: "Show more", threshold: 0.8 },
  { key: "balanced", label: "Balanced", threshold: 0.5 },
  { key: "strict", label: "Show less", threshold: 0.25 },
];

export const DEFAULT_SENSITIVITY_KEY = "balanced";

export function thresholdToLevelKey(threshold) {
  let closest = SENSITIVITY_LEVELS[0];
  let closestDiff = Math.abs(threshold - closest.threshold);
  for (const level of SENSITIVITY_LEVELS) {
    const diff = Math.abs(threshold - level.threshold);
    if (diff < closestDiff) {
      closest = level;
      closestDiff = diff;
    }
  }
  return closest.key;
}

export function levelKeyToThreshold(key) {
  const level = SENSITIVITY_LEVELS.find((l) => l.key === key);
  return level ? level.threshold : SENSITIVITY_LEVELS[1].threshold;
}
