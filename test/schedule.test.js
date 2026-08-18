import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinSchedule } from "../src/shared/schedule.js";

const ALL_DAY = {
  weekday: { start: "00:00", end: "23:59" },
  weekend: { start: "00:00", end: "23:59" },
};

const WORK_HOURS_WEEKDAYS_ONLY = {
  weekday: { start: "09:00", end: "17:00" },
  weekend: { start: "00:00", end: "00:00" }, // zero-width == whole day, not zero
};

test("isWithinSchedule: no schedule -> always active", () => {
  assert.equal(isWithinSchedule(null, new Date("2026-08-17T12:00:00")), true);
});

test("isWithinSchedule: all-day default is always active", () => {
  const monday9am = new Date("2026-08-17T09:00:00"); // a Monday
  const saturday3am = new Date("2026-08-15T03:00:00"); // a Saturday
  assert.equal(isWithinSchedule(ALL_DAY, monday9am), true);
  assert.equal(isWithinSchedule(ALL_DAY, saturday3am), true);
});

test("isWithinSchedule: weekday window excludes times outside it", () => {
  const mondayNoon = new Date("2026-08-17T12:00:00"); // within 09:00-17:00
  const mondayLateNight = new Date("2026-08-17T22:00:00"); // outside
  assert.equal(isWithinSchedule(WORK_HOURS_WEEKDAYS_ONLY, mondayNoon), true);
  assert.equal(isWithinSchedule(WORK_HOURS_WEEKDAYS_ONLY, mondayLateNight), false);
});

test("isWithinSchedule: zero-width window means whole day (not zero)", () => {
  const saturdayMidnight = new Date("2026-08-15T00:00:00");
  const saturdayNoon = new Date("2026-08-15T12:00:00");
  assert.equal(isWithinSchedule(WORK_HOURS_WEEKDAYS_ONLY, saturdayMidnight), true);
  assert.equal(isWithinSchedule(WORK_HOURS_WEEKDAYS_ONLY, saturdayNoon), true);
});

test("isWithinSchedule: overnight window wraps across midnight", () => {
  const overnight = { weekday: { start: "22:00", end: "06:00" }, weekend: { start: "00:00", end: "23:59" } };
  const monday11pm = new Date("2026-08-17T23:00:00");
  const tuesday3am = new Date("2026-08-18T03:00:00");
  const mondayNoon = new Date("2026-08-17T12:00:00");
  assert.equal(isWithinSchedule(overnight, monday11pm), true);
  assert.equal(isWithinSchedule(overnight, tuesday3am), true);
  assert.equal(isWithinSchedule(overnight, mondayNoon), false);
});

test("isWithinSchedule: weekend uses the weekend window, not weekday", () => {
  const saturdayNoon = new Date("2026-08-15T12:00:00"); // outside weekday-only 09-17 semantics irrelevant here
  const schedule = { weekday: { start: "00:00", end: "23:59" }, weekend: { start: "10:00", end: "14:00" } };
  assert.equal(isWithinSchedule(schedule, saturdayNoon), true);
  const saturdayEvening = new Date("2026-08-15T20:00:00");
  assert.equal(isWithinSchedule(schedule, saturdayEvening), false);
});
