import { isWithinSchedule } from "./schedule.js";
import { DEFAULT_SCHEDULE } from "./constants.js";

/**
 * Blank profile with the same shape SAVE_PROFILE later fills in. `id` is
 * stable for the profile's lifetime and is what scoreCache entries and the
 * "already decided" per-card dataset stamp are namespaced by (see
 * content-script.js) — never reuse an id across profiles.
 */
export function createProfile(name) {
  return {
    id: crypto.randomUUID(),
    name,
    intentText: "",
    avoidText: "",
    intentVector: null,
    avoidVector: null,
    intentVersion: 0,
    calibration: null,
    includeKeywords: [],
    excludeKeywords: [],
    scheduleEnabled: false,
    schedule: DEFAULT_SCHEDULE,
  };
}

/**
 * Picks which profile is active right now. Time-boxed profiles
 * (scheduleEnabled) take priority over always-on ones, in list order, so a
 * profile with a set window reliably overrides a catch-all fallback rather
 * than losing to whichever happens to sit earlier in the list; the first
 * always-on profile (if any) is that fallback. Returns null when nothing
 * matches (no profiles at all, or every scheduled profile's window is
 * currently closed and there's no always-on fallback) — callers should
 * show everything unfiltered in that case, same as the old single-schedule
 * "outside active hours" behavior.
 */
export function pickActiveProfile(profiles, date = new Date()) {
  if (!profiles || profiles.length === 0) return null;
  let fallback = null;
  for (const profile of profiles) {
    if (!profile.scheduleEnabled) {
      if (!fallback) fallback = profile;
      continue;
    }
    if (isWithinSchedule(profile.schedule, date)) return profile;
  }
  return fallback;
}
