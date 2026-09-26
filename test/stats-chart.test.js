import { test } from "node:test";
import assert from "node:assert/strict";
import { niceMax } from "../src/options/stats-chart.js";

test("niceMax: axis top is 4 whole-number gridline steps", () => {
  assert.equal(niceMax(0), 4);
  assert.equal(niceMax(3), 4);
  assert.equal(niceMax(5), 8);
  assert.equal(niceMax(44), 48);
  assert.equal(niceMax(60), 60);
  for (const v of [1, 7, 13, 44, 60, 99, 101, 480, 2500]) {
    const max = niceMax(v);
    assert.ok(max >= v, `${max} should cover ${v}`);
    assert.equal(max % 4, 0);
    assert.ok(Number.isInteger(max / 4));
  }
});
