import { STORAGE_KEYS, DEFAULT_SETTINGS, SCORE_CACHE_LIMIT } from "./constants.js";

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

export function getScoreCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEYS.SCORE_CACHE]: {} }, (items) =>
      resolve(items[STORAGE_KEYS.SCORE_CACHE])
    );
  });
}

/**
 * Bounds the cache to SCORE_CACHE_LIMIT entries, evicting oldest-inserted
 * first. Cache is keyed by videoId -> { score, version }, where version
 * must match the current intent version or the entry is stale.
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
