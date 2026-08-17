export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fits a { mean, std } distribution over a set of scores (the fixed probe
 * titles scored against a freshly saved intent). This is what turns a raw
 * margin score — which doesn't transfer across intents/models — into
 * something an absolute cutoff can be derived from for *this* intent.
 */
export function computeCalibration(scores) {
  if (!scores || scores.length === 0) return null;
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Absolute score cutoff: mean + k * std. Unlike a percentile-of-current-
 * screen cutoff, this doesn't change shape as more cards scroll in, and it
 * doesn't dim/show a fixed fraction of the feed regardless of how relevant
 * that feed actually is — a fully on-topic feed can pass entirely, a fully
 * off-topic one can be dimmed entirely.
 *
 * Returns -Infinity (show everything) when calibration isn't available yet
 * — e.g. right after saving a new intent, before the calibration round
 * trip has completed.
 */
export function calibratedCutoff(calibration, k) {
  if (!calibration) return -Infinity;
  return calibration.mean + k * calibration.std;
}
