import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, recordStat, pruneStats, lastNDays, sumSeries, STATS_RETENTION_DAYS } from "../src/shared/stats.js";

const D = (s) => new Date(`${s}T12:00:00`);

test("dayKey: local YYYY-MM-DD, zero-padded", () => {
  assert.equal(dayKey(D("2026-01-05")), "2026-01-05");
  assert.equal(dayKey(new Date(2026, 8, 26, 23, 59)), "2026-09-26");
});

test("recordStat: creates the day and increments the right counter without mutating input", () => {
  const before = {};
  const a = recordStat(before, "unhides", D("2026-09-26"));
  assert.deepEqual(before, {});
  assert.deepEqual(a, { "2026-09-26": { unhides: 1, filtered: 0 } });
  const b = recordStat(a, "filtered", D("2026-09-26"), 3);
  assert.deepEqual(b["2026-09-26"], { unhides: 1, filtered: 3 });
});

test("recordStat: ignores unknown kinds and non-positive counts", () => {
  assert.deepEqual(recordStat({}, "bogus", D("2026-09-26")), {});
  assert.deepEqual(recordStat({}, "unhides", D("2026-09-26"), 0), {});
});

test("pruneStats: drops days older than the retention window", () => {
  const stats = {
    "2026-06-01": { unhides: 1, filtered: 1 },
    "2026-09-25": { unhides: 2, filtered: 2 },
  };
  const pruned = pruneStats(stats, 90, D("2026-09-26"));
  assert.deepEqual(Object.keys(pruned), ["2026-09-25"]);
});

test("recordStat: prunes old days on write", () => {
  const stats = { "2025-01-01": { unhides: 5, filtered: 5 } };
  const next = recordStat(stats, "filtered", D("2026-09-26"));
  assert.equal("2025-01-01" in next, false);
  assert.equal(STATS_RETENTION_DAYS, 90);
});

test("lastNDays: oldest to newest, zero-filled, ending today", () => {
  const stats = { "2026-09-25": { unhides: 2, filtered: 7 } };
  const series = lastNDays(stats, 3, D("2026-09-26"));
  assert.deepEqual(series, [
    { date: "2026-09-24", unhides: 0, filtered: 0 },
    { date: "2026-09-25", unhides: 2, filtered: 7 },
    { date: "2026-09-26", unhides: 0, filtered: 0 },
  ]);
});

test("lastNDays: handles month boundaries", () => {
  const series = lastNDays({}, 3, D("2026-03-01"));
  assert.deepEqual(series.map((d) => d.date), ["2026-02-27", "2026-02-28", "2026-03-01"]);
});

test("lastNDays: tolerates null stats", () => {
  assert.equal(lastNDays(null, 2, D("2026-09-26")).length, 2);
});

test("sumSeries: totals both counters", () => {
  assert.deepEqual(
    sumSeries([{ date: "a", unhides: 1, filtered: 2 }, { date: "b", unhides: 3, filtered: 4 }]),
    { unhides: 4, filtered: 6 }
  );
});

test("recordStat tracks hardcore pauses and refunds unused minutes", () => {
  const d = new Date("2026-09-26T12:00:00");
  let s = recordStat({}, "hardcoreOffs", d);
  s = recordStat(s, "hardcoreOffMinutes", d, 30);
  s = recordStat(s, "hardcoreOffMinutes", d, -10);
  assert.deepEqual(s["2026-09-26"], { unhides: 0, filtered: 0, hardcoreOffs: 1, hardcoreOffMinutes: 20 });
  assert.deepEqual(recordStat({}, "unhides", d, -1), {});
});
