import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS, DEFAULT_MODEL_KEY, resolveModelKey } from "../src/shared/models.js";

test("resolveModelKey defaults to bge-small and accepts known keys", () => {
  assert.equal(DEFAULT_MODEL_KEY, "bge-small");
  assert.equal(resolveModelKey(undefined), "bge-small");
  assert.equal(resolveModelKey(""), "bge-small");
  assert.equal(resolveModelKey("e5-small"), "e5-small");
});

test("resolveModelKey rejects unknown models and lists the valid ones", () => {
  assert.throws(() => resolveModelKey("nope"), /bge-small, e5-small/);
});

test("every model has an id, a 384-dim vector size and prefixes", () => {
  for (const m of Object.values(MODELS)) {
    assert.equal(typeof m.id, "string");
    assert.equal(m.dim, 384);
    assert.equal(typeof m.queryPrefix, "string");
    assert.equal(typeof m.passagePrefix, "string");
  }
});
