import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, computeCalibration, calibratedCutoff } from "../src/shared/scoring.js";
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

test("computeCalibration: fits mean and std over a set of scores", () => {
  const cal = computeCalibration([0.2, 0.4, 0.6]);
  assert.ok(Math.abs(cal.mean - 0.4) < 1e-9);
  assert.ok(cal.std > 0);
});

test("computeCalibration: empty scores -> null", () => {
  assert.equal(computeCalibration([]), null);
  assert.equal(computeCalibration(undefined), null);
});

test("computeCalibration: constant scores -> std is 0", () => {
  const cal = computeCalibration([0.5, 0.5, 0.5]);
  assert.equal(cal.mean, 0.5);
  assert.equal(cal.std, 0);
});

test("calibratedCutoff: no calibration -> -Infinity (shows everything)", () => {
  assert.equal(calibratedCutoff(null, 0.5), -Infinity);
});

test("calibratedCutoff: cutoff is mean + k*std", () => {
  const cal = { mean: 0.5, std: 0.1 };
  assert.ok(Math.abs(calibratedCutoff(cal, 1) - 0.6) < 1e-9);
  assert.ok(Math.abs(calibratedCutoff(cal, -1) - 0.4) < 1e-9);
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
