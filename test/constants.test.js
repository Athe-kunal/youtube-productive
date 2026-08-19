import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_TIERS, DEFAULT_MODEL_TIER, DEFAULT_SETTINGS, STORAGE_KEYS } from "../src/shared/constants.js";

test("MODEL_TIERS: small and large tiers are both well-formed", () => {
  for (const tier of ["small", "large"]) {
    const config = MODEL_TIERS[tier];
    assert.ok(config, `MODEL_TIERS.${tier} should exist`);
    assert.equal(typeof config.id, "string");
    assert.equal(typeof config.label, "string");
    assert.equal(typeof config.dim, "number");
    assert.equal(typeof config.remote, "boolean");
    assert.equal(typeof config.threaded, "boolean");
  }
});

test("MODEL_TIERS: small is bundled/local, large is remote-fetched", () => {
  assert.equal(MODEL_TIERS.small.remote, false);
  assert.equal(MODEL_TIERS.large.remote, true);
});

test("MODEL_TIERS: dimensions differ, which is exactly why switching tiers must invalidate vectors", () => {
  assert.notEqual(MODEL_TIERS.small.dim, MODEL_TIERS.large.dim);
});

test("DEFAULT_MODEL_TIER points at a real tier", () => {
  assert.ok(MODEL_TIERS[DEFAULT_MODEL_TIER]);
});

test("DEFAULT_SETTINGS seeds MODEL_TIER with the default tier", () => {
  assert.equal(DEFAULT_SETTINGS[STORAGE_KEYS.MODEL_TIER], DEFAULT_MODEL_TIER);
});
