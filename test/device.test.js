import { test } from "node:test";
import assert from "node:assert/strict";

// device.js reads navigator at module-init time, so each case needs a fresh
// module instance with its own global.navigator stub — cache-bust via a
// unique query string per import.
async function loadWithNavigator(nav) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
  try {
    return await import(`../src/shared/device.js?case=${Math.random()}`);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalDescriptor);
    } else {
      delete globalThis.navigator;
    }
  }
}

test("device: low cores -> low tier, small chunk size", async () => {
  const mod = await loadWithNavigator({ hardwareConcurrency: 2, deviceMemory: 8 });
  assert.equal(mod.HARDWARE_TIER, "low");
  assert.equal(mod.ADAPTIVE_SCORE_CHUNK_SIZE, 10);
});

test("device: low memory -> low tier even with many cores", async () => {
  const mod = await loadWithNavigator({ hardwareConcurrency: 16, deviceMemory: 2 });
  assert.equal(mod.HARDWARE_TIER, "low");
});

test("device: mid-range cores and memory -> medium tier", async () => {
  const mod = await loadWithNavigator({ hardwareConcurrency: 4, deviceMemory: 4 });
  assert.equal(mod.HARDWARE_TIER, "medium");
  assert.equal(mod.ADAPTIVE_SCORE_CHUNK_SIZE, 20);
});

test("device: capable hardware -> high tier, default chunk size", async () => {
  const mod = await loadWithNavigator({ hardwareConcurrency: 8, deviceMemory: 8 });
  assert.equal(mod.HARDWARE_TIER, "high");
  assert.equal(mod.ADAPTIVE_SCORE_CHUNK_SIZE, 32);
});

test("device: missing hardwareConcurrency/deviceMemory falls back to a mid-range default, not low", async () => {
  const mod = await loadWithNavigator({});
  assert.equal(mod.HARDWARE_TIER, "medium");
});

test("device: yieldToMain resolves without a scheduler API present", async () => {
  const mod = await loadWithNavigator({ hardwareConcurrency: 4, deviceMemory: 4 });
  await assert.doesNotReject(mod.yieldToMain());
});
