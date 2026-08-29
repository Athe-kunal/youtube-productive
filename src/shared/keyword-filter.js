function matchesAny(lowerHaystack, lowerKeywords) {
  if (!lowerKeywords || lowerKeywords.length === 0) return false;
  return lowerKeywords.some((kw) => kw && lowerHaystack.includes(kw));
}

/**
 * Exclude keywords always win over include keywords, which always win over
 * the semantic score. This must stay stable — the options page's live
 * preview depends on this exact precedence being reproducible without a
 * model round trip.
 *
 * includeKeywords/excludeKeywords must already be lowercased (chip-input.js
 * normalizes on add, and the background's SAVE_PROFILE handler normalizes
 * again defensively before persisting) — this runs once per card on every
 * pass, so re-lowercasing the same small keyword list per card here instead
 * of once at the source added up on a long scroll session.
 */
export function resolveDecision({
  score,
  threshold,
  title,
  channel,
  includeKeywords,
  excludeKeywords,
}) {
  const lowerHaystack = `${title || ""} ${channel || ""}`.toLowerCase();

  if (matchesAny(lowerHaystack, excludeKeywords)) return "dim";
  if (matchesAny(lowerHaystack, includeKeywords)) return "show";
  return score >= threshold ? "show" : "dim";
}

export function parseKeywordList(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
