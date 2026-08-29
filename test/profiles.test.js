import { test } from "node:test";
import assert from "node:assert/strict";
import { createProfile, pickActiveProfile } from "../src/shared/profiles.js";

function profile(overrides) {
  return { ...createProfile("P"), ...overrides };
}

test("createProfile: blank profile has the expected shape and a unique id", () => {
  const a = createProfile("Work");
  const b = createProfile("Evening");
  assert.equal(a.name, "Work");
  assert.equal(a.intentText, "");
  assert.equal(a.intentVector, null);
  assert.equal(a.scheduleEnabled, false);
  assert.deepEqual(a.includeKeywords, []);
  assert.notEqual(a.id, b.id);
});

test("pickActiveProfile: no profiles -> null", () => {
  assert.equal(pickActiveProfile([]), null);
  assert.equal(pickActiveProfile(null), null);
});

test("pickActiveProfile: single always-on profile is always active", () => {
  const p = profile({ scheduleEnabled: false });
  assert.equal(pickActiveProfile([p]), p);
});

test("pickActiveProfile: a scheduled profile is active only within its window", () => {
  const work = profile({
    name: "Work",
    scheduleEnabled: true,
    schedule: { weekday: { start: "09:00", end: "17:00" }, weekend: { start: "00:00", end: "00:00" } },
  });
  const noon = new Date("2026-08-17T12:00:00"); // Monday
  const night = new Date("2026-08-17T22:00:00");
  assert.equal(pickActiveProfile([work], noon), work);
  assert.equal(pickActiveProfile([work], night), null);
});

test("pickActiveProfile: scheduled profile takes priority over an always-on fallback when both match", () => {
  const fallback = profile({ name: "Default", scheduleEnabled: false });
  const work = profile({
    name: "Work",
    scheduleEnabled: true,
    schedule: { weekday: { start: "09:00", end: "17:00" }, weekend: { start: "00:00", end: "00:00" } },
  });
  const noon = new Date("2026-08-17T12:00:00"); // Monday, within work hours
  assert.equal(pickActiveProfile([fallback, work], noon), work);
  assert.equal(pickActiveProfile([work, fallback], noon), work);
});

test("pickActiveProfile: falls back to the first always-on profile outside every scheduled window", () => {
  const fallback = profile({ name: "Default", scheduleEnabled: false });
  const work = profile({
    name: "Work",
    scheduleEnabled: true,
    schedule: { weekday: { start: "09:00", end: "17:00" }, weekend: { start: "00:00", end: "00:00" } },
  });
  const night = new Date("2026-08-17T22:00:00");
  assert.equal(pickActiveProfile([work, fallback], night), fallback);
});

test("pickActiveProfile: no match and no fallback -> null", () => {
  const work = profile({
    name: "Work",
    scheduleEnabled: true,
    schedule: { weekday: { start: "09:00", end: "17:00" }, weekend: { start: "00:00", end: "00:00" } },
  });
  const evening = profile({
    name: "Evening",
    scheduleEnabled: true,
    schedule: { weekday: { start: "18:00", end: "22:00" }, weekend: { start: "00:00", end: "00:00" } },
  });
  const midMorningGap = new Date("2026-08-17T08:00:00"); // Monday, before either window
  assert.equal(pickActiveProfile([work, evening], midMorningGap), null);
});

test("pickActiveProfile: two scheduled profiles both matching -> first in list order wins", () => {
  const first = profile({
    name: "First",
    scheduleEnabled: true,
    schedule: { weekday: { start: "00:00", end: "23:59" }, weekend: { start: "00:00", end: "23:59" } },
  });
  const second = profile({
    name: "Second",
    scheduleEnabled: true,
    schedule: { weekday: { start: "00:00", end: "23:59" }, weekend: { start: "00:00", end: "23:59" } },
  });
  const noon = new Date("2026-08-17T12:00:00");
  assert.equal(pickActiveProfile([first, second], noon), first);
  assert.equal(pickActiveProfile([second, first], noon), second);
});
