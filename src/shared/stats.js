// Daily usage counters: { "YYYY-MM-DD": { unhides, filtered } }, keyed by
// the user's local date. Pure functions only — persistence lives in the
// background service worker (RECORD_STAT), which is the single writer.
export const STATS_RETENTION_DAYS = 90;

const KINDS = ["unhides", "filtered"];

function pad(n) {
  return String(n).padStart(2, "0");
}

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function pruneStats(stats, keepDays = STATS_RETENTION_DAYS, date = new Date()) {
  const oldest = dayKey(shiftDays(date, -(keepDays - 1)));
  const pruned = {};
  for (const [key, value] of Object.entries(stats || {})) {
    if (key >= oldest) pruned[key] = value;
  }
  return pruned;
}

export function recordStat(stats, kind, date = new Date(), count = 1) {
  if (!KINDS.includes(kind) || !(count > 0)) return stats || {};
  const key = dayKey(date);
  const base = pruneStats(stats, STATS_RETENTION_DAYS, date);
  const day = base[key] || { unhides: 0, filtered: 0 };
  return { ...base, [key]: { ...day, [kind]: day[kind] + count } };
}

// Oldest → newest, always `n` entries ending today, zero-filled so the
// chart has a bar slot for days with no activity.
export function lastNDays(stats, n, date = new Date()) {
  const series = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(shiftDays(date, -i));
    const day = (stats && stats[key]) || {};
    series.push({ date: key, unhides: day.unhides || 0, filtered: day.filtered || 0 });
  }
  return series;
}

export function sumSeries(series) {
  return series.reduce(
    (acc, d) => ({ unhides: acc.unhides + d.unhides, filtered: acc.filtered + d.filtered }),
    { unhides: 0, filtered: 0 }
  );
}
