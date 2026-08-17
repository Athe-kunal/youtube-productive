import { test } from "node:test";
import assert from "node:assert/strict";
import { getPageConfig } from "../src/content/selectors.js";

test("getPageConfig: home feed path", () => {
  const config = getPageConfig("/");
  assert.equal(config.cardSelector, "ytd-rich-item-renderer");
});

test("getPageConfig: watch page path", () => {
  const config = getPageConfig("/watch");
  assert.equal(config.cardSelector, "yt-lockup-view-model");
});

test("getPageConfig: unsupported path returns null", () => {
  assert.equal(getPageConfig("/results"), null);
  assert.equal(getPageConfig("/feed/subscriptions"), null);
});
