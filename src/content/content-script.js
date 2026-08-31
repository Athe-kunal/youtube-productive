import { MSG, sendToBackground } from "../shared/messaging.js";
import { resolveDecision } from "../shared/keyword-filter.js";
import { calibratedCutoff } from "../shared/scoring.js";
import { getSettings, getProfiles, getScoreCache, setScoreCache } from "../shared/storage.js";
import { pickActiveProfile } from "../shared/profiles.js";
import { STORAGE_KEYS, DEBOUNCE_MS, CACHE_FLUSH_DEBOUNCE_MS, MAX_SCORE_ATTEMPTS, DEFAULT_SENSITIVITY_K, SCHEDULE_RECHECK_MS } from "../shared/constants.js";
import { ADAPTIVE_SCORE_CHUNK_SIZE, EXTRACT_YIELD_EVERY, yieldToMain } from "../shared/device.js";
import { getPageConfig } from "./selectors.js";
import { extractCard } from "./card-extractor.js";
import { applyDecision } from "./visibility-controller.js";
import { createLogger } from "../shared/log.js";

const log = createLogger("content");

// Local to this file — purely an implementation detail of coalescing
// FILTER_STATE_CHANGED broadcasts (see scheduleFilterStateBroadcast).
const FILTER_BROADCAST_DEBOUNCE_MS = 300;

let observer = null;
let globalSettings = null; // EXTENSION_ENABLED, MODEL_TIER, TOUR_SEEN — not per-profile
let profiles = [];
let activeProfile = null; // whichever profile's schedule currently matches — see shared/profiles.js
let pageConfig = null; // home feed vs. watch-page sidebar — see selectors.js#PAGE_CONFIGS
const scoreCache = new Map(); // `${profileId}:${videoId}` -> { score, version, failed? }
const cardByVideoId = new Map(); // videoId -> card element
const cardState = new Map(); // videoId -> { title, channel, score, decision, isShort } (for the review popup)
const failureAttempts = new Map(); // videoId -> embed attempts this page session
// Explicit per-video "show anyway" clicks from the popup's filtered list.
// Session-only (cleared on init/navigation) — a permanent allowlist is what
// the "Always show" keyword field is for.
const manualShows = new Set();

function scoreCacheKey(videoId) {
  return `${activeProfile.id}:${videoId}`;
}

async function loadState() {
  globalSettings = await getSettings();
  profiles = await getProfiles();
  activeProfile = pickActiveProfile(profiles);
  const persisted = await getScoreCache();
  scoreCache.clear();
  for (const [key, entry] of Object.entries(persisted)) {
    scoreCache.set(key, entry);
  }
  log.log("loadState", {
    extensionEnabled: globalSettings[STORAGE_KEYS.EXTENSION_ENABLED],
    profileCount: profiles.length,
    activeProfile: activeProfile && { id: activeProfile.id, name: activeProfile.name },
    cachedScores: scoreCache.size,
  });
}

// Cutoff is absolute (mean + k*std from calibration), not a percentile of
// whatever's currently on screen — see shared/scoring.js#calibratedCutoff
// for why a percentile cutoff dims/shows a fixed fraction regardless of
// how relevant the feed actually is, and flickers as the feed grows.
function applyDecisionsForScoredItems(items) {
  const currentVersion = activeProfile.intentVersion;
  const versionStr = `${activeProfile.id}:${currentVersion}`;
  const calibration = activeProfile.calibration;
  const validCalibration = calibration && calibration.version === currentVersion ? calibration : null;
  const cutoff = calibratedCutoff(validCalibration, DEFAULT_SENSITIVITY_K);

  for (const item of items) {
    const decision = manualShows.has(item.videoId)
      ? "show"
      : resolveDecision({
          score: item.score,
          threshold: cutoff,
          title: item.title,
          channel: item.channel,
          includeKeywords: activeProfile.includeKeywords,
          excludeKeywords: activeProfile.excludeKeywords,
        });
    applyDecision(item.cardEl, decision);
    // Marks this card as fully decided for the active profile's current
    // intent version, so later passes can skip re-extracting/re-scoring it
    // entirely. Namespaced by profile id (not just the version number)
    // because each profile keeps its own independent version counter —
    // without the id, two different profiles both sitting at version 1
    // would look identical to this stamp and a profile switch could apply
    // stale decisions from the wrong profile.
    item.cardEl.dataset.yifVersion = versionStr;
    item.cardEl.dataset.yifVideoId = item.videoId;
    cardState.set(item.videoId, {
      title: item.title,
      channel: item.channel,
      score: item.score,
      decision,
      isShort: item.isShort,
    });
  }
  log.log("applyDecisionsForScoredItems", { count: items.length, cutoff: cutoff.toFixed(3) });
  scheduleFilterStateBroadcast();
}

function applyForVideoIds(videoIds, infoByVideoId, currentVersion) {
  const scoredItems = videoIds
    .map((videoId) => {
      const cached = scoreCache.get(scoreCacheKey(videoId));
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
  for (const [key, entry] of scoreCache) plain[key] = entry;
  setScoreCache(plain).catch((err) => log.error("cache flush failed", err));
}

// The popup's "Filtered on this page" list is fetched once on open
// (GET_FILTERED_VIDEOS), so it goes stale the moment the user clicks Apply
// and this tab re-scores in the background — the thumbnail visibly hides
// here, but a popup that's still open (or reopened before scoring
// finishes) shows the old, pre-Apply snapshot. Debounced since a scoring
// pass calls applyDecisionsForScoredItems once per chunk.
let filterBroadcastTimer = null;
function scheduleFilterStateBroadcast() {
  clearTimeout(filterBroadcastTimer);
  filterBroadcastTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: MSG.FILTER_STATE_CHANGED }).catch(() => {});
  }, FILTER_BROADCAST_DEBOUNCE_MS);
}

// No active profile at all (none configured, or every scheduled profile's
// window is currently closed with no always-on fallback): the extension is
// fully off for now — whatever is currently dimmed gets shown again and no
// scoring happens. Re-checked periodically (see SCHEDULE_RECHECK_MS) so a
// tab left open across a boundary (e.g. work hours ending) doesn't need a
// reload to pick it up.
function showAllTrackedCards() {
  for (const [videoId, cardEl] of cardByVideoId) {
    applyDecision(cardEl, "show");
    const prior = cardState.get(videoId);
    if (prior) cardState.set(videoId, { ...prior, decision: "show" });
  }
  scheduleFilterStateBroadcast();
}

async function processCardsInner() {
  if (!pageConfig) return;

  if (globalSettings && globalSettings[STORAGE_KEYS.EXTENSION_ENABLED] === false) {
    log.log("processCards: extension disabled, showing everything");
    showAllTrackedCards();
    return;
  }

  if (!activeProfile) {
    log.log("processCards: no active profile right now, showing everything");
    showAllTrackedCards();
    return;
  }

  if (!activeProfile.intentVector) {
    log.warn("processCards: skipped, active profile has no intent vector set yet");
    return;
  }

  const cards = collectCandidateCards();
  const currentVersion = activeProfile.intentVersion;
  const versionStr = `${activeProfile.id}:${currentVersion}`;
  const infos = []; // cards not yet fully decided for this version
  const toScore = [];

  let sinceYield = 0;
  for (const cardEl of cards) {
    // Already decided for this profile+version: re-register in
    // cardByVideoId (cheap) and skip the DOM extraction + scoring work
    // entirely — this is what keeps a scroll-triggered mutation pass from
    // re-processing every card ever seen. yifVideoId is absent for the
    // extraction-failure stamp set below, so this also catches "already
    // gave up on this one" without re-touching it.
    if (cardEl.dataset.yifVersion === versionStr) {
      if (cardEl.dataset.yifVideoId) cardByVideoId.set(cardEl.dataset.yifVideoId, cardEl);
      continue;
    }
    // Hide first, reveal on a "show" decision — not the other way around.
    // A card sits here, at worst, for one synchronous extraction call plus
    // however long its SCORE_BATCH round trip takes; showing it first and
    // only dimming the rejects would flash every unfiltered thumbnail
    // (title, channel, everything) for that whole window instead.
    applyDecision(cardEl, "dim");

    const info = extractCard(cardEl);
    if (!info) {
      // Can't extract a title -> can never be scored. Fail open: reveal it
      // rather than leaving something we'll never revisit stuck hidden, and
      // stamp it so future passes don't repeat the dim-then-show flicker.
      applyDecision(cardEl, "show");
      cardEl.dataset.yifVersion = versionStr;
      continue;
    }
    cardByVideoId.set(info.videoId, cardEl);
    infos.push({ ...info, cardEl });

    const cached = scoreCache.get(scoreCacheKey(info.videoId));
    if (!(cached && cached.version === currentVersion)) {
      toScore.push(info);
    }

    // A long first load or a full re-scan (see collectCandidateCards) can
    // hand this loop hundreds of cards at once. Extracting them all in one
    // synchronous pass is a long task that visibly janks scrolling on a
    // slow CPU, even though the model inference itself already runs off
    // the main thread. Yielding periodically keeps each slice short.
    sinceYield++;
    if (sinceYield >= EXTRACT_YIELD_EVERY) {
      sinceYield = 0;
      await yieldToMain();
    }
  }

  log.log("processCards", { candidateCards: cards.size, newlySeen: infos.length, toScore: toScore.length });

  const infoByVideoId = new Map(infos.map((i) => [i.videoId, i]));
  const toScoreIds = new Set(toScore.map((i) => i.videoId));

  // New-to-the-DOM cards that already have a valid cached score (e.g.
  // scrolled past earlier, or restored from storage on load) can be
  // decided immediately without a network round trip.
  const alreadyCachedIds = infos.map((i) => i.videoId).filter((id) => !toScoreIds.has(id));
  applyForVideoIds(alreadyCachedIds, infoByVideoId, currentVersion);

  // Chunked so a long first-load batch doesn't pad one giant forward pass
  // and so cards resolve progressively instead of all-at-once at the end.
  // Chunk size is hardware-adaptive (see shared/device.js): smaller batches
  // on weak/low-memory devices keep each WASM inference round trip short.
  for (let i = 0; i < toScore.length; i += ADAPTIVE_SCORE_CHUNK_SIZE) {
    const chunk = toScore.slice(i, i + ADAPTIVE_SCORE_CHUNK_SIZE);
    const response = await sendToBackground(MSG.SCORE_BATCH, { videos: chunk, profileId: activeProfile.id });
    if (!response || !response.ok) {
      log.error("processCards: SCORE_BATCH failed", response && response.error);
      continue;
    }
    if (response.failedCount) {
      log.warn("processCards: some items failed to embed", response.failedCount);
    }

    const resultIds = new Set();
    for (const { videoId, score } of response.results) {
      scoreCache.set(scoreCacheKey(videoId), { score, version: currentVersion });
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
        scoreCache.set(scoreCacheKey(item.videoId), { score: -Infinity, version: currentVersion, failed: true });
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
  if (!activeProfile) {
    showAllTrackedCards();
    return;
  }
  const currentVersion = activeProfile.intentVersion;
  const scoredItems = [];
  for (const [videoId, cardEl] of cardByVideoId) {
    const cached = scoreCache.get(scoreCacheKey(videoId));
    const prior = cardState.get(videoId);
    if (!cached || cached.version !== currentVersion || !prior) continue;
    scoredItems.push({ videoId, cardEl, title: prior.title, channel: prior.channel, score: cached.score, isShort: prior.isShort });
  }
  if (scoredItems.length > 0) applyDecisionsForScoredItems(scoredItems);
}

let debounceTimer = null;
function scheduleProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runProcessCards, DEBOUNCE_MS);
}

// Roots to search for cards on the next process pass. Populated from
// MutationObserver's addedNodes so a scroll-triggered pass only walks the
// subtrees that actually just appeared, instead of re-querying every card
// ever seen on the page — on a long infinite-scroll session (hundreds of
// accumulated cards) that full-document re-scan is the kind of O(n) work
// that's invisible on a fast machine and a real source of jank on a slow
// one. `null` means "do a full scan" — used for init and other passes that
// aren't triggered by a specific DOM addition (e.g. active profile change,
// the periodic schedule recheck) where a targeted root set isn't available
// and correctness requires re-evaluating everything anyway.
let pendingRoots = null;

function collectCandidateCards() {
  if (pendingRoots === null) {
    // Consume the full-scan request; resume scoped/incremental tracking
    // for subsequent passes until something forces another full scan.
    pendingRoots = new Set();
    return new Set(document.querySelectorAll(pageConfig.cardSelector));
  }
  const roots = pendingRoots;
  pendingRoots = new Set();
  const cards = new Set();
  for (const root of roots) {
    if (!root.isConnected) continue;
    if (root.matches && root.matches(pageConfig.cardSelector)) cards.add(root);
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll(pageConfig.cardSelector)) cards.add(el);
    }
  }
  return cards;
}

function collectAddedRoots(mutations) {
  let found = false;
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (
        (node.matches && node.matches(pageConfig.cardSelector)) ||
        (node.querySelector && node.querySelector(pageConfig.cardSelector))
      ) {
        found = true;
        if (pendingRoots !== null) pendingRoots.add(node);
      }
    }
  }
  return found;
}

function attachObserver() {
  // Always observe with subtree: true. New cards aren't reliably direct
  // children of the feed container — infinite scroll on the watch-page
  // sidebar in particular appends them a level or two deeper (inside a new
  // continuation/section wrapper each load), so childList-only observation
  // silently stopped seeing anything past the first screenful. The
  // collectAddedRoots filter is what keeps this cheap despite subtree:
  // true, by ignoring YouTube's constant unrelated deep mutation (thumbnail
  // swaps, hover previews, view-count refresh) and only scheduling a pass
  // — scoped to the added nodes — when one actually matches the card
  // selector.
  const specific = document.querySelector(pageConfig.feedContainer);
  const container = specific || document.body;
  if (!specific) {
    log.warn("attachObserver: feed container selector didn't match, observing document.body instead", pageConfig.feedContainer);
  } else {
    log.log("attachObserver: container found, observing", pageConfig.feedContainer);
  }
  observer = new MutationObserver((mutations) => {
    if (!collectAddedRoots(mutations)) return;
    scheduleProcess();
  });
  observer.observe(container, { childList: true, subtree: true });
  // First pass has no mutation-derived roots yet — do a full scan to catch
  // whatever's already rendered.
  pendingRoots = null;
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
  pageConfig = getPageConfig(location.pathname);
  if (!pageConfig) {
    log.log("init: unsupported page, skipping");
    detachObserver();
    return;
  }
  await loadState();
  cardByVideoId.clear();
  cardState.clear();
  failureAttempts.clear();
  manualShows.clear();
  detachObserver();
  attachObserver();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  let needsFullScan = false;

  if (STORAGE_KEYS.PROFILES in changes) {
    profiles = changes[STORAGE_KEYS.PROFILES].newValue || [];
    const nextActive = pickActiveProfile(profiles);
    const activeChanged =
      (activeProfile ? activeProfile.id : null) !== (nextActive ? nextActive.id : null) ||
      (activeProfile && nextActive && activeProfile.intentVersion !== nextActive.intentVersion);
    activeProfile = nextActive;
    if (activeChanged) {
      needsFullScan = true;
    } else if (activeProfile) {
      // Same profile, same intent version — only keywords/schedule
      // changed, which don't need a model round trip to re-apply.
      reapplyFromCache();
    }
  }

  if (!globalSettings) return;

  if (STORAGE_KEYS.EXTENSION_ENABLED in changes) {
    globalSettings[STORAGE_KEYS.EXTENSION_ENABLED] = changes[STORAGE_KEYS.EXTENSION_ENABLED].newValue;
    needsFullScan = true;
  }
  if (STORAGE_KEYS.MODEL_TIER in changes) {
    globalSettings[STORAGE_KEYS.MODEL_TIER] = changes[STORAGE_KEYS.MODEL_TIER].newValue;
  }

  if (needsFullScan) {
    pendingRoots = null;
    scheduleProcess();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === MSG.GET_FILTERED_VIDEOS) {
    const dimmed = Array.from(cardState.entries())
      .filter(([, v]) => v.decision === "dim")
      .map(([videoId, v]) => ({ videoId, title: v.title, channel: v.channel, score: v.score, isShort: v.isShort }));
    // Page order, not score order: a card dimmed near the top of the feed
    // should surface at the top of the popup list too, matching where the
    // user would actually go looking for it — not wherever its score
    // happens to rank it.
    dimmed.sort((a, b) => {
      const aEl = cardByVideoId.get(a.videoId);
      const bEl = cardByVideoId.get(b.videoId);
      if (!aEl || !bEl) return 0;
      const position = aEl.compareDocumentPosition(bEl);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    sendResponse({
      ok: true,
      isSupportedPage: !!pageConfig,
      dimmed,
      activeProfile: activeProfile && { id: activeProfile.id, name: activeProfile.name },
    });
    return true;
  }

  if (message && message.type === MSG.UNHIDE_VIDEO) {
    const { videoId } = message.payload;
    manualShows.add(videoId);
    const cardEl = cardByVideoId.get(videoId);
    if (cardEl) {
      applyDecision(cardEl, "show");
      // The popup that triggered this sits on top of the same tab, so the
      // scroll happens out of sight until the user closes it — but it means
      // the unhidden card is already centered in view once they do.
      cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const prior = cardState.get(videoId);
    if (prior) cardState.set(videoId, { ...prior, decision: "show" });
    sendResponse({ ok: true });
    return true;
  }

  return undefined;
});

window.addEventListener("pagehide", flushCacheNow);

// A tab left open across a schedule boundary (e.g. work hours ending at
// 17:00, or one profile's window handing off to another's) has no other
// trigger to re-evaluate — nothing in the DOM changes on its own at that
// moment. Only forces a rescan when the active profile actually changed,
// rather than unconditionally re-walking every card on the page every
// minute regardless of whether anything crossed a boundary.
setInterval(() => {
  if (!pageConfig || profiles.length === 0) return;
  const nextActive = pickActiveProfile(profiles);
  const changed = (activeProfile ? activeProfile.id : null) !== (nextActive ? nextActive.id : null);
  if (!changed) return;
  activeProfile = nextActive;
  pendingRoots = null;
  scheduleProcess();
}, SCHEDULE_RECHECK_MS);

log.log("content script injected", { url: location.href });
document.addEventListener("yt-navigate-finish", init);
init();
