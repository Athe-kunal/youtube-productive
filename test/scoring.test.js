import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, percentileCutoff } from "../src/shared/scoring.js";
import { resolveDecision, parseKeywordList } from "../src/shared/keyword-filter.js";

test("cosineSimilarity: identical vectors -> 1", () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
});

test("cosineSimilarity: orthogonal vectors -> 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity: opposite vectors -> -1", () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("cosineSimilarity: zero vector -> 0, no NaN", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("percentileCutoff: keepFraction 0.5 keeps the top half visible", () => {
  const scores = [0.1, 0.2, 0.3, 0.4]; // 2 should be dimmed, 2 shown
  const cutoff = percentileCutoff(scores, 0.5);
  const shown = scores.filter((s) => s >= cutoff);
  assert.equal(shown.length, 2);
  assert.deepEqual(shown.sort(), [0.3, 0.4]);
});

test("percentileCutoff: keepFraction 1 keeps everything visible", () => {
  const scores = [0.1, 0.9, 0.5];
  const cutoff = percentileCutoff(scores, 1);
  assert.ok(scores.every((s) => s >= cutoff));
});

test("percentileCutoff: keepFraction 0 dims everything", () => {
  const scores = [0.1, 0.9, 0.5];
  const cutoff = percentileCutoff(scores, 0);
  assert.ok(scores.every((s) => s < cutoff));
});

test("percentileCutoff: empty scores never dims (cutoff is -Infinity)", () => {
  assert.equal(percentileCutoff([], 0.5), -Infinity);
});

test("resolveDecision: above threshold, no keywords -> show", () => {
  const d = resolveDecision({
    score: 0.8,
    threshold: 0.5,
    title: "Distributed training at scale",
    channel: "Some Channel",
    includeKeywords: [],
    excludeKeywords: [],
  });
  assert.equal(d, "show");
});

test("resolveDecision: below threshold, no keywords -> dim", () => {
  const d = resolveDecision({
    score: 0.2,
    threshold: 0.5,
    title: "Cat compilation",
    channel: "Cats",
    includeKeywords: [],
    excludeKeywords: [],
  });
  assert.equal(d, "dim");
});

test("resolveDecision: exclude keyword forces dim even with high score", () => {
  const d = resolveDecision({
    score: 0.99,
    threshold: 0.5,
    title: "Football highlights",
    channel: "Sports",
    includeKeywords: [],
    excludeKeywords: ["football"],
  });
  assert.equal(d, "dim");
});

test("resolveDecision: include keyword forces show even with low score", () => {
  const d = resolveDecision({
    score: 0.01,
    threshold: 0.5,
    title: "My Rust project update",
    channel: "Dev Log",
    includeKeywords: ["rust"],
    excludeKeywords: [],
  });
  assert.equal(d, "show");
});

test("resolveDecision: exclude wins over include when both match", () => {
  const d = resolveDecision({
    score: 0.9,
    threshold: 0.5,
    title: "Rust football drama",
    channel: "Dev Log",
    includeKeywords: ["rust"],
    excludeKeywords: ["football"],
  });
  assert.equal(d, "dim");
});

test("resolveDecision: keyword match is case-insensitive", () => {
  const d = resolveDecision({
    score: 0.9,
    threshold: 0.5,
    title: "FOOTBALL recap",
    channel: "Sports",
    includeKeywords: [],
    excludeKeywords: ["football"],
  });
  assert.equal(d, "dim");
});

test("parseKeywordList: splits on comma and newline, trims, drops empties", () => {
  assert.deepEqual(parseKeywordList("rust, kubernetes\n\ngo ,  "), ["rust", "kubernetes", "go"]);
});

test("parseKeywordList: empty input -> empty array", () => {
  assert.deepEqual(parseKeywordList(""), []);
  assert.deepEqual(parseKeywordList(null), []);
});
