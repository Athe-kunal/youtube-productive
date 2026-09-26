import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_TIERS, DEFAULT_MODEL_TIER, DEFAULT_SETTINGS, STORAGE_KEYS } from "../src/shared/constants.js";

test("MODEL_TIERS: only the bundled small tier exists, and it is local", () => {
  assert.deepEqual(Object.keys(MODEL_TIERS), ["small"]);
  const config = MODEL_TIERS.small;
  assert.equal(typeof config.id, "string");
  assert.equal(typeof config.dim, "number");
  assert.equal(config.remote, false);
  assert.equal(config.threaded, false);
});

test("DEFAULT_MODEL_TIER points at a real tier", () => {
  assert.ok(MODEL_TIERS[DEFAULT_MODEL_TIER]);
});

test("DEFAULT_SETTINGS seeds MODEL_TIER with the default tier", () => {
  assert.equal(DEFAULT_SETTINGS[STORAGE_KEYS.MODEL_TIER], DEFAULT_MODEL_TIER);
});

test("STORAGE_KEYS has a STATS key", () => {
  assert.equal(typeof STORAGE_KEYS.STATS, "string");
});
