/**
 * Returns a score cutoff such that `score >= cutoff` keeps roughly the top
 * `keepFraction` of `scores` visible. Absolute cosine-similarity values
 * don't transfer cleanly across intents/models — relative ranking within
 * the current batch does, so dimming is threshold-by-percentile rather
 * than threshold-by-constant.
 */
export function percentileCutoff(scores, keepFraction) {
  if (scores.length === 0) return -Infinity;
  const sorted = [...scores].sort((a, b) => a - b);
  const dimCount = Math.round(sorted.length * (1 - keepFraction));
  if (dimCount <= 0) return -Infinity;
  if (dimCount >= sorted.length) return Infinity;
  return sorted[dimCount];
}

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
