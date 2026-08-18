import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createChipInput } from "../src/shared/chip-input.js";

function setup(opts) {
  const window = new Window();
  global.document = window.document;
  const container = window.document.createElement("div");
  const chipInput = createChipInput(container, opts);
  return { window, container, chipInput };
}

function typeAndPressEnter(container, text) {
  const input = container.querySelector(".chip-input-field");
  const win = container.ownerDocument.defaultView;
  input.value = text;
  input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

test("createChipInput: starts with initial chips, lowercased", () => {
  const { chipInput } = setup({ initial: ["Kubernetes", "RUST"] });
  assert.deepEqual(chipInput.getChips(), ["kubernetes", "rust"]);
});

test("createChipInput: typing + Enter adds a lowercased chip", () => {
  const { container, chipInput } = setup({ initial: [] });
  typeAndPressEnter(container, "Football");
  assert.deepEqual(chipInput.getChips(), ["football"]);
});

test("createChipInput: comma-separated input adds multiple chips at once", () => {
  const { container, chipInput } = setup({ initial: [] });
  typeAndPressEnter(container, "Football, Drama, Football");
  assert.deepEqual(chipInput.getChips(), ["football", "drama"]);
});

test("createChipInput: duplicate chip is not added twice", () => {
  const { container, chipInput } = setup({ initial: ["rust"] });
  typeAndPressEnter(container, "RUST");
  assert.deepEqual(chipInput.getChips(), ["rust"]);
});

test("createChipInput: clicking a chip's remove button removes it", () => {
  const { container, chipInput } = setup({ initial: ["rust", "kubernetes"] });
  const win = container.ownerDocument.defaultView;
  const removeButtons = container.querySelectorAll(".chip-remove");
  removeButtons[0].dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(chipInput.getChips(), ["kubernetes"]);
});

test("createChipInput: setChips replaces the whole set", () => {
  const { chipInput } = setup({ initial: ["rust"] });
  chipInput.setChips(["Go", "Zig"]);
  assert.deepEqual(chipInput.getChips(), ["go", "zig"]);
});

test("createChipInput: onChange fires with the updated chip list", () => {
  let lastChips = null;
  const { container } = setup({ initial: [], onChange: (chips) => (lastChips = chips) });
  typeAndPressEnter(container, "rust");
  assert.deepEqual(lastChips, ["rust"]);
});
