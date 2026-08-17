function matchesAny(haystack, keywords) {
  if (!keywords || keywords.length === 0) return false;
  const lower = haystack.toLowerCase();
  return keywords.some((kw) => kw && lower.includes(kw.toLowerCase()));
}

/**
 * Exclude keywords always win over include keywords, which always win over
 * the semantic score. This must stay stable — the options page's live
 * preview depends on this exact precedence being reproducible without a
 * model round trip.
 */
export function resolveDecision({
  score,
  threshold,
  title,
  channel,
  includeKeywords,
  excludeKeywords,
}) {
  const haystack = `${title || ""} ${channel || ""}`;

  if (matchesAny(haystack, excludeKeywords)) return "dim";
  if (matchesAny(haystack, includeKeywords)) return "show";
  return score >= threshold ? "show" : "dim";
}

export function parseKeywordList(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
