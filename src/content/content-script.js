import { MSG, sendToBackground } from "../shared/messaging.js";
import { resolveDecision } from "../shared/keyword-filter.js";
import { calibratedCutoff } from "../shared/scoring.js";
import { getSettings, getScoreCache, setScoreCache } from "../shared/storage.js";
import {
  STORAGE_KEYS,
  DEBOUNCE_MS,
  SCORE_CHUNK_SIZE,
  CACHE_FLUSH_DEBOUNCE_MS,
  MAX_SCORE_ATTEMPTS,
} from "../shared/constants.js";
import { FEED_CONTAINER, CARD_SELECTOR } from "./selectors.js";
import { extractCard } from "./card-extractor.js";
import { applyDecision } from "./visibility-controller.js";
import { createLogger } from "../shared/log.js";

const log = createLogger("content");

let observer = null;
let settings = null;
const scoreCache = new Map(); // videoId -> { score, version, failed? }
const cardByVideoId = new Map(); // videoId -> card element
const cardState = new Map(); // videoId -> { title, channel, score, decision } (for the review popup)
const failureAttempts = new Map(); // videoId -> embed attempts this page session

function isHomeFeed() {
  return location.pathname === "/";
}

async function loadState() {
  settings = await getSettings();
  const persisted = await getScoreCache();
  scoreCache.clear();
  for (const [videoId, entry] of Object.entries(persisted)) {
    scoreCache.set(videoId, entry);
  }
  log.log("loadState", {
    hasIntentVector: !!settings[STORAGE_KEYS.INTENT_VECTOR],
    hasCalibration: !!settings[STORAGE_KEYS.CALIBRATION],
    sensitivityK: settings[STORAGE_KEYS.SENSITIVITY_K],
    includeKeywords: settings[STORAGE_KEYS.INCLUDE_KEYWORDS],
    excludeKeywords: settings[STORAGE_KEYS.EXCLUDE_KEYWORDS],
    cachedScores: scoreCache.size,
  });
}

// Cutoff is absolute (mean + k*std from calibration), not a percentile of
// whatever's currently on screen — see shared/scoring.js#calibratedCutoff
// for why a percentile cutoff dims/shows a fixed fraction regardless of
// how relevant the feed actually is, and flickers as the feed grows.
function applyDecisionsForScoredItems(items) {
  const currentVersion = settings[STORAGE_KEYS.INTENT_VERSION];
  const versionStr = String(currentVersion);
  const calibration = settings[STORAGE_KEYS.CALIBRATION];
  const validCalibration = calibration && calibration.version === currentVersion ? calibration : null;
  const cutoff = calibratedCutoff(validCalibration, settings[STORAGE_KEYS.SENSITIVITY_K]);

  for (const item of items) {
    const decision = resolveDecision({
      score: item.score,
      threshold: cutoff,
      title: item.title,
      channel: item.channel,
      includeKeywords: settings[STORAGE_KEYS.INCLUDE_KEYWORDS],
      excludeKeywords: settings[STORAGE_KEYS.EXCLUDE_KEYWORDS],
    });
    applyDecision(item.cardEl, decision);
    // Marks this card as fully decided for the current intent version, so
    // later passes can skip re-extracting/re-scoring it entirely.
    item.cardEl.dataset.yifVersion = versionStr;
    item.cardEl.dataset.yifVideoId = item.videoId;
    cardState.set(item.videoId, { title: item.title, channel: item.channel, score: item.score, decision });
  }
  log.log("applyDecisionsForScoredItems", { count: items.length, cutoff: cutoff.toFixed(3) });
}

function applyForVideoIds(videoIds, infoByVideoId, currentVersion) {
  const scoredItems = videoIds
    .map((videoId) => {
      const cached = scoreCache.get(videoId);
      const info = infoByVideoId.get(videoId);
      if (!info || !cached || cached.version !== currentVersion) return null;
      return { ...info, score: cached.score };
    })
    .filter(Boolean);
  if (scoredItems.length > 0) applyDecisionsForScoredItems(scoredItems);
}

let cacheFlushTimer = null;
function scheduleCacheFlush() {
  clearTimeout(cacheFlushTimer);
  cacheFlushTimer = setTimeout(flushCacheNow, CACHE_FLUSH_DEBOUNCE_MS);
}

function flushCacheNow() {
  clearTimeout(cacheFlushTimer);
  const plain = {};
  for (const [videoId, entry] of scoreCache) plain[videoId] = entry;
  setScoreCache(plain).catch((err) => log.error("cache flush failed", err));
}

async function processCardsInner() {
  if (!settings || !settings[STORAGE_KEYS.INTENT_VECTOR]) {
    log.warn("processCards: skipped, no intent vector set yet");
    return;
  }

  const cards = document.querySelectorAll(CARD_SELECTOR);
  const currentVersion = settings[STORAGE_KEYS.INTENT_VERSION];
  const versionStr = String(currentVersion);
  const infos = []; // cards not yet fully decided for this version
  const toScore = [];

  for (const cardEl of cards) {
    // Already decided for this intent version: re-register in
    // cardByVideoId (cheap) and skip the DOM extraction + scoring work
    // entirely — this is what keeps a scroll-triggered mutation pass from
    // re-querying every card ever seen.
    if (cardEl.dataset.yifVersion === versionStr && cardEl.dataset.yifVideoId) {
      cardByVideoId.set(cardEl.dataset.yifVideoId, cardEl);
      continue;
    }
    const info = extractCard(cardEl);
    if (!info) continue;
    cardByVideoId.set(info.videoId, cardEl);
    infos.push({ ...info, cardEl });

    const cached = scoreCache.get(info.videoId);
    if (!(cached && cached.version === currentVersion)) {
      toScore.push(info);
    }
  }

  log.log("processCards", { domCards: cards.length, newlySeen: infos.length, toScore: toScore.length });

  const infoByVideoId = new Map(infos.map((i) => [i.videoId, i]));
  const toScoreIds = new Set(toScore.map((i) => i.videoId));

  // New-to-the-DOM cards that already have a valid cached score (e.g.
  // scrolled past earlier, or restored from storage on load) can be
  // decided immediately without a network round trip.
  const alreadyCachedIds = infos.map((i) => i.videoId).filter((id) => !toScoreIds.has(id));
  applyForVideoIds(alreadyCachedIds, infoByVideoId, currentVersion);

  // Chunked so a long first-load batch doesn't pad one giant forward pass
  // and so cards resolve progressively instead of all-at-once at the end.
  for (let i = 0; i < toScore.length; i += SCORE_CHUNK_SIZE) {
    const chunk = toScore.slice(i, i + SCORE_CHUNK_SIZE);
    const response = await sendToBackground(MSG.SCORE_BATCH, { videos: chunk });
    if (!response || !response.ok) {
      log.error("processCards: SCORE_BATCH failed", response && response.error);
      continue;
    }
    if (response.failedCount) {
      log.warn("processCards: some items failed to embed", response.failedCount);
    }

    const resultIds = new Set();
    for (const { videoId, score } of response.results) {
      scoreCache.set(videoId, { score, version: currentVersion });
      resultIds.add(videoId);
      failureAttempts.delete(videoId);
    }
    for (const item of chunk) {
      if (resultIds.has(item.videoId)) continue;
      const attempts = (failureAttempts.get(item.videoId) || 0) + 1;
      if (attempts >= MAX_SCORE_ATTEMPTS) {
        // Give up: cache a permanently-dimmed entry so this title stops
        // being resent on every subsequent pass. Include-keyword rules
        // still apply on top of this in resolveDecision.
        scoreCache.set(item.videoId, { score: -Infinity, version: currentVersion, failed: true });
        failureAttempts.delete(item.videoId);
      } else {
        failureAttempts.set(item.videoId, attempts);
      }
    }
    scheduleCacheFlush();
    applyForVideoIds(chunk.map((c) => c.videoId), infoByVideoId, currentVersion);
  }
}

let running = false;
let dirty = false;
async function runProcessCards() {
  if (running) {
    dirty = true;
    return;
  }
  running = true;
  try {
    await processCardsInner();
  } catch (err) {
    log.error("processCards: unhandled error", err);
  } finally {
    running = false;
    if (dirty) {
      dirty = false;
      scheduleProcess();
    }
  }
}

function reapplyFromCache() {
  const currentVersion = settings[STORAGE_KEYS.INTENT_VERSION];
  const scoredItems = [];
  for (const [videoId, cardEl] of cardByVideoId) {
    const cached = scoreCache.get(videoId);
    const prior = cardState.get(videoId);
    if (!cached || cached.version !== currentVersion || !prior) continue;
    scoredItems.push({ videoId, cardEl, title: prior.title, channel: prior.channel, score: cached.score });
  }
  if (scoredItems.length > 0) applyDecisionsForScoredItems(scoredItems);
}

let debounceTimer = null;
function scheduleProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runProcessCards, DEBOUNCE_MS);
}

function hasNewCard(mutations) {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches && node.matches(CARD_SELECTOR)) return true;
      if (node.querySelector && node.querySelector(CARD_SELECTOR)) return true;
    }
  }
  return false;
}

function attachObserver() {
  // Prefer the specific feed container when it's present — new cards are
  // appended as its direct children, so childList without subtree is
  // enough and never fires on YouTube's constant deep mutation (lazy
  // thumbnail swaps, hover-preview injection, view-count refresh). If it's
  // not present yet, fall back to document.body with subtree, but filter
  // mutations down to ones that actually add a card before scheduling a
  // pass — otherwise every deep mutation anywhere resets the debounce.
  const specific = document.querySelector(FEED_CONTAINER);
  const container = specific || document.body;
  const subtree = !specific;
  if (!specific) {
    log.warn("attachObserver: feed container selector didn't match, observing document.body instead", FEED_CONTAINER);
  } else {
    log.log("attachObserver: container found, observing", FEED_CONTAINER);
  }
  observer = new MutationObserver((mutations) => {
    if (subtree && !hasNewCard(mutations)) return;
    scheduleProcess();
  });
  observer.observe(container, { childList: true, subtree });
  scheduleProcess();
}

function detachObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

async function init() {
  log.log("init", { path: location.pathname });
  if (!isHomeFeed()) {
    log.log("init: not home feed, skipping");
    detachObserver();
    return;
  }
  await loadState();
  cardByVideoId.clear();
  cardState.clear();
  failureAttempts.clear();
  detachObserver();
  attachObserver();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !settings) return;
  let relevant = false;
  for (const key of [
    STORAGE_KEYS.SENSITIVITY_K,
    STORAGE_KEYS.INCLUDE_KEYWORDS,
    STORAGE_KEYS.EXCLUDE_KEYWORDS,
    STORAGE_KEYS.INTENT_VECTOR,
    STORAGE_KEYS.INTENT_VERSION,
    STORAGE_KEYS.CALIBRATION,
  ]) {
    if (key in changes) {
      settings[key] = changes[key].newValue;
      relevant = true;
    }
  }
  if (!relevant) return;

  if (STORAGE_KEYS.INTENT_VERSION in changes) {
    // New intent embedding: cached scores are stale, re-score everything.
    scoreCache.clear();
    failureAttempts.clear();
    scheduleProcess();
  } else {
    reapplyFromCache();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === MSG.GET_FILTERED_VIDEOS) {
    const dimmed = Array.from(cardState.entries())
      .filter(([, v]) => v.decision === "dim")
      .map(([videoId, v]) => ({ videoId, title: v.title, channel: v.channel, score: v.score }))
      .sort((a, b) => b.score - a.score);
    sendResponse({ ok: true, isHomeFeed: isHomeFeed(), dimmed });
    return true;
  }
  return undefined;
});

window.addEventListener("pagehide", flushCacheNow);

log.log("content script injected", { url: location.href });
document.addEventListener("yt-navigate-finish", init);
init();
