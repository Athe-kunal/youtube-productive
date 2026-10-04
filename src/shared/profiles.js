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
    // While on, filtered videos can't be listed or unhidden from the popup
    // (enforced in the content script). Off by default; profiles saved
    // before this field existed read as undefined, i.e. off.
    hardcoreMode: false,
    // Epoch ms until which hardcore is temporarily paused from the popup
    // (max HARDCORE_PAUSE_MAX_MINUTES); 0/undefined means not paused.
    hardcoreOffUntil: 0,
  };
}

export const HARDCORE_PAUSE_MAX_MINUTES = 60;

export function isHardcoreActive(profile, now = Date.now()) {
  return !!(profile && profile.hardcoreMode && !(profile.hardcoreOffUntil > now));
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
