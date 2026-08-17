// The stored number is a std-dev multiplier k, used as an absolute cutoff:
// mean + k * std (see shared/scoring.js#calibratedCutoff). Higher k raises
// the bar (shows less); lower/negative k lowers it (shows more). Not a
// percentile — see scoring.js for why a percentile-of-current-screen
// cutoff doesn't work.
export const SENSITIVITY_LEVELS = [
  { key: "loose", label: "Show more", k: -0.5 },
  { key: "balanced", label: "Balanced", k: 0.25 },
  { key: "strict", label: "Show less", k: 1.0 },
];

export const DEFAULT_SENSITIVITY_KEY = "balanced";

export function kToLevelKey(k) {
  let closest = SENSITIVITY_LEVELS[0];
  let closestDiff = Math.abs(k - closest.k);
  for (const level of SENSITIVITY_LEVELS) {
    const diff = Math.abs(k - level.k);
    if (diff < closestDiff) {
      closest = level;
      closestDiff = diff;
    }
  }
  return closest.key;
}

export function levelKeyToK(key) {
  const level = SENSITIVITY_LEVELS.find((l) => l.key === key);
  return level ? level.k : SENSITIVITY_LEVELS[1].k;
}
