import { test } from "node:test";
import assert from "node:assert/strict";
import { boundCache } from "../src/shared/storage.js";

test("boundCache: leaves cache untouched when under the limit", () => {
  const cache = { a: 1, b: 2 };
  assert.deepEqual(boundCache(cache, 5), cache);
});

test("boundCache: evicts oldest-inserted entries first when over the limit", () => {
  const cache = { a: 1, b: 2, c: 3, d: 4 };
  const result = boundCache(cache, 2);
  assert.deepEqual(Object.keys(result), ["c", "d"]);
});

test("boundCache: does not mutate the input object", () => {
  const cache = { a: 1, b: 2, c: 3 };
  boundCache(cache, 1);
  assert.deepEqual(Object.keys(cache), ["a", "b", "c"]);
});
