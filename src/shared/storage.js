import { STORAGE_KEYS, DEFAULT_SETTINGS, SCORE_CACHE_LIMIT, MAX_PROFILES } from "./constants.js";
import { createProfile } from "./profiles.js";

export function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => resolve(items));
  });
}

export function setSettings(partial) {
  return new Promise((resolve) => {
    chrome.storage.local.set(partial, resolve);
  });
}

// Legacy pre-profiles keys, read only by the one-time migration below.
const LEGACY_KEYS = [
  STORAGE_KEYS.INTENT_TEXT,
  STORAGE_KEYS.INTENT_VECTOR,
  STORAGE_KEYS.AVOID_TEXT,
  STORAGE_KEYS.AVOID_VECTOR,
  STORAGE_KEYS.INTENT_VERSION,
  STORAGE_KEYS.CALIBRATION,
  STORAGE_KEYS.INCLUDE_KEYWORDS,
  STORAGE_KEYS.EXCLUDE_KEYWORDS,
  STORAGE_KEYS.SCHEDULE,
  STORAGE_KEYS.SCHEDULE_ENABLED,
];

function migrateLegacyProfile(raw) {
  const profile = createProfile("Profile 1");
  profile.intentText = raw[STORAGE_KEYS.INTENT_TEXT] || "";
  profile.intentVector = raw[STORAGE_KEYS.INTENT_VECTOR] || null;
  profile.avoidText = raw[STORAGE_KEYS.AVOID_TEXT] || "";
  profile.avoidVector = raw[STORAGE_KEYS.AVOID_VECTOR] || null;
  profile.intentVersion = raw[STORAGE_KEYS.INTENT_VERSION] || 0;
  profile.calibration = raw[STORAGE_KEYS.CALIBRATION] || null;
  profile.includeKeywords = raw[STORAGE_KEYS.INCLUDE_KEYWORDS] || [];
  profile.excludeKeywords = raw[STORAGE_KEYS.EXCLUDE_KEYWORDS] || [];
  if (raw[STORAGE_KEYS.SCHEDULE]) profile.schedule = raw[STORAGE_KEYS.SCHEDULE];
  profile.scheduleEnabled = !!raw[STORAGE_KEYS.SCHEDULE_ENABLED];
  return profile;
}

/**
 * Returns the user's profiles (1-3). On first read after upgrading from
 * the old single-profile version — no PROFILES key saved yet — this
 * migrates whatever legacy settings exist (or an empty default on a fresh
 * install) into a single "Profile 1" and persists it, so this only ever
 * runs once per install.
 */
export function getProfiles() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.PROFILES, ...LEGACY_KEYS], async (items) => {
      const existing = items[STORAGE_KEYS.PROFILES];
      if (existing && existing.length > 0) {
        resolve(existing);
        return;
      }
      const migrated = [migrateLegacyProfile(items)];
      await setProfiles(migrated);
      resolve(migrated);
    });
  });
}

export function setProfiles(profiles) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles.slice(0, MAX_PROFILES) }, resolve);
  });
}

// For fields that never require re-embedding (name, keywords, schedule) —
// callers can write these straight to storage instead of round-tripping
// through the background service worker, which exists only to reach the
// offscreen document for the model. Returns the updated profile.
export async function updateProfileFields(profileId, partial) {
  const profiles = await getProfiles();
  const next = profiles.map((p) => (p.id === profileId ? { ...p, ...partial } : p));
  await setProfiles(next);
  return next.find((p) => p.id === profileId);
}

export async function deleteProfile(profileId) {
  const profiles = await getProfiles();
  const next = profiles.filter((p) => p.id !== profileId);
  await setProfiles(next);
  await clearScoreCacheForProfile(profileId);
  return next;
}

export function getScoreCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEYS.SCORE_CACHE]: {} }, (items) =>
      resolve(items[STORAGE_KEYS.SCORE_CACHE])
    );
  });
}

/**
 * Bounds the cache to SCORE_CACHE_LIMIT entries, evicting oldest-inserted
 * first. Cache is keyed by `${profileId}:${videoId}` -> { score, version },
 * where version must match that profile's current intentVersion or the
 * entry is stale.
 */
export function boundCache(cache, limit = SCORE_CACHE_LIMIT) {
  const keys = Object.keys(cache);
  if (keys.length <= limit) return cache;
  const excess = keys.length - limit;
  const trimmed = { ...cache };
  for (let i = 0; i < excess; i++) {
    delete trimmed[keys[i]];
  }
  return trimmed;
}

export function setScoreCache(cache) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SCORE_CACHE]: boundCache(cache) }, resolve);
  });
}

export function clearScoreCache() {
  return setScoreCache({});
}

// Scoped invalidation: re-embedding one profile's intent must not throw
// away every other profile's cached scores too (they're still valid — cache
// keys are namespaced by profile id precisely so this can be scoped).
export async function clearScoreCacheForProfile(profileId) {
  const cache = await getScoreCache();
  const prefix = `${profileId}:`;
  const trimmed = {};
  for (const [key, value] of Object.entries(cache)) {
    if (!key.startsWith(prefix)) trimmed[key] = value;
  }
  await setScoreCache(trimmed);
}
