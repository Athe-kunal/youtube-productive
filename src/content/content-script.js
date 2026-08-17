import { MSG, sendToBackground } from "../shared/messaging.js";
import { resolveDecision } from "../shared/keyword-filter.js";
import { percentileCutoff } from "../shared/scoring.js";
import { getSettings, getScoreCache, setScoreCache } from "../shared/storage.js";
import { STORAGE_KEYS, DEBOUNCE_MS } from "../shared/constants.js";
import { FEED_CONTAINER, CARD_SELECTOR } from "./selectors.js";
import { extractCard } from "./card-extractor.js";
import { applyDecision } from "./dim-controller.js";
import { createLogger } from "../shared/log.js";

const log = createLogger("content");

let observer = null;
let settings = null;
const scoreCache = new Map(); // videoId -> { score, version }
const cardByVideoId = new Map(); // videoId -> card element (current batch only)
const cardState = new Map(); // videoId -> { title, channel, score, decision } (for the review popup)

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
    keepFraction: settings[STORAGE_KEYS.THRESHOLD],
    includeKeywords: settings[STORAGE_KEYS.INCLUDE_KEYWORDS],
    excludeKeywords: settings[STORAGE_KEYS.EXCLUDE_KEYWORDS],
    cachedScores: scoreCache.size,
  });
}

// Absolute cosine-similarity scores don't transfer cleanly across
// intents/models, so dimming is rank-based: cutoff is recomputed from
// whatever's currently on screen, and cards below it get dimmed.
function applyDecisionsForScoredItems(items) {
  const cutoff = percentileCutoff(
    items.map((i) => i.score),
    settings[STORAGE_KEYS.THRESHOLD]
  );
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
    cardState.set(item.videoId, { title: item.title, channel: item.channel, score: item.score, decision });
  }
  log.log("applyDecisionsForScoredItems", { count: items.length, cutoff: cutoff.toFixed(3) });
}

async function processCards() {
  if (!settings || !settings[STORAGE_KEYS.INTENT_VECTOR]) {
    log.warn("processCards: skipped, no intent vector set yet");
    return;
  }

  const cards = document.querySelectorAll(CARD_SELECTOR);
  const currentVersion = settings[STORAGE_KEYS.INTENT_VERSION];
  const infos = []; // { videoId, title, channel, cardEl }
  const toScore = [];

  cardByVideoId.clear();

  for (const cardEl of cards) {
    const info = extractCard(cardEl);
    if (!info) continue;
    cardByVideoId.set(info.videoId, cardEl);
    infos.push({ ...info, cardEl });

    const cached = scoreCache.get(info.videoId);
    if (!(cached && cached.version === currentVersion)) {
      toScore.push(info);
    }
  }

  for (const videoId of cardState.keys()) {
    if (!cardByVideoId.has(videoId)) cardState.delete(videoId);
  }

  log.log("processCards", {
    domCards: cards.length,
    extracted: infos.length,
    cacheHits: infos.length - toScore.length,
    toScore: toScore.length,
  });

  if (toScore.length > 0) {
    const response = await sendToBackground(MSG.SCORE_BATCH, { videos: toScore });
    if (!response || !response.ok) {
      log.error("processCards: SCORE_BATCH failed", response && response.error);
    } else {
      if (response.failedCount) {
        log.warn("processCards: some items failed to embed and will retry next pass", response.failedCount);
      }
      for (const { videoId, score } of response.results) {
        scoreCache.set(videoId, { score, version: currentVersion });
      }
      const plain = {};
      for (const [videoId, entry] of scoreCache) plain[videoId] = entry;
      await setScoreCache(plain);
    }
  }

  const scoredItems = infos
    .map((info) => {
      const cached = scoreCache.get(info.videoId);
      return cached && cached.version === currentVersion ? { ...info, score: cached.score } : null;
    })
    .filter(Boolean);

  if (scoredItems.length > 0) applyDecisionsForScoredItems(scoredItems);
}

function reapplyFromCache() {
  const currentVersion = settings[STORAGE_KEYS.INTENT_VERSION];
  const scoredItems = [];
  for (const [videoId, cardEl] of cardByVideoId) {
    const cached = scoreCache.get(videoId);
    if (!cached || cached.version !== currentVersion) continue;
    const info = extractCard(cardEl);
    if (!info) continue;
    scoredItems.push({ ...info, cardEl, score: cached.score });
  }
  if (scoredItems.length > 0) applyDecisionsForScoredItems(scoredItems);
}

let debounceTimer = null;
function scheduleProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processCards, DEBOUNCE_MS);
}

function attachObserver() {
  // Prefer the specific feed container when it's present (cheaper to
  // observe), but YouTube's exact nesting under ytd-rich-grid-renderer
  // shifts across releases and isn't reliable to wait on indefinitely.
  // document.body is always present at document_idle, so fall back to it
  // after a couple of quick attempts rather than retrying forever.
  const container = document.querySelector(FEED_CONTAINER) || document.body;
  if (container === document.body) {
    log.warn("attachObserver: feed container selector didn't match, observing document.body instead", FEED_CONTAINER);
  } else {
    log.log("attachObserver: container found, observing", FEED_CONTAINER);
  }
  observer = new MutationObserver(scheduleProcess);
  observer.observe(container, { childList: true, subtree: true });
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
  detachObserver();
  attachObserver();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !settings) return;
  let relevant = false;
  for (const key of [
    STORAGE_KEYS.THRESHOLD,
    STORAGE_KEYS.INCLUDE_KEYWORDS,
    STORAGE_KEYS.EXCLUDE_KEYWORDS,
    STORAGE_KEYS.INTENT_VECTOR,
    STORAGE_KEYS.INTENT_VERSION,
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

log.log("content script injected", { url: location.href });
document.addEventListener("yt-navigate-finish", init);
init();
