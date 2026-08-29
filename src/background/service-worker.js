import { MSG, onMessage, sendToOffscreen } from "../shared/messaging.js";
import {
  getSettings,
  setSettings,
  getProfiles,
  setProfiles,
  getScoreCache,
  setScoreCache,
  clearScoreCacheForProfile,
} from "../shared/storage.js";
import { STORAGE_KEYS, DEFAULT_MODEL_TIER } from "../shared/constants.js";
import { computeCalibration } from "../shared/scoring.js";
import { PROBE_TITLES } from "../shared/probe-titles.js";

const OFFSCREEN_PATH = "offscreen/offscreen.html";

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["WORKERS"],
    justification: "Run local embedding model inference (Transformers.js/WASM) off the main thread.",
  });
}

// Relay model lifecycle events from the offscreen document out to whichever
// tabs/pages care (options page, active YouTube tabs). These are
// intentionally untargeted broadcasts, unlike sendToOffscreen's
// request/response traffic below.
chrome.runtime.onMessage.addListener((message) => {
  if (
    message &&
    (message.type === MSG.MODEL_DOWNLOAD_PROGRESS ||
      message.type === MSG.MODEL_READY ||
      message.type === MSG.MODEL_ERROR)
  ) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});

/**
 * Embeds `text` via the offscreen document and returns the vector, or null
 * if `text` is empty. Throws the offscreen error string on failure so the
 * caller's catch can turn it into a sendResponse({ ok: false }).
 */
async function embedText(text, tier) {
  if (!text) return null;
  const response = await sendToOffscreen(MSG.EMBED_INTENT, { text, tier });
  if (!response || !response.ok) {
    throw new Error((response && response.error) || "embedding failed");
  }
  return response.vector;
}

/**
 * Scores the fixed probe title set against the new intent/avoid vectors and
 * fits a { mean, std } over the results — the absolute cutoff for this
 * intent is derived from this later (mean + k * std). One-time cost per
 * save, not per scroll batch.
 */
async function calibrate(intentVector, avoidVector, tier) {
  if (!intentVector) return null;
  const response = await sendToOffscreen(MSG.SCORE_BATCH, {
    intentVector,
    avoidVector,
    tier,
    videos: PROBE_TITLES.map((title, i) => ({ videoId: `probe-${i}`, title })),
  });
  if (!response || !response.ok || response.results.length === 0) return null;
  return computeCalibration(response.results.map((r) => r.score));
}

/**
 * Re-embeds intent/avoid text under `tier` and recalibrates against the
 * probe set — shared by SAVE_PROFILE (when either text changed) and
 * SET_MODEL_TIER (when the model changed but the text didn't), since a
 * tier switch invalidates the old vectors' dimensionality exactly like a
 * text edit invalidates their meaning. Callers are responsible for
 * clearing that profile's score cache afterward (see
 * clearScoreCacheForProfile) — this function only touches vectors.
 *
 * `intentChanged`/`avoidChanged` let a caller that knows only one field
 * actually changed (SAVE_PROFILE) skip re-embedding the other and reuse
 * `prevVector`/`prevAvoidVector` instead — calibration still runs fresh
 * either way, since it's a function of both vectors together. A tier
 * switch invalidates both, so SET_MODEL_TIER passes both flags true and
 * has no prior vectors to reuse.
 */
async function reembedAndCalibrate({
  intentText,
  avoidText,
  tier,
  prevVersion,
  intentChanged = true,
  avoidChanged = true,
  prevVector = null,
  prevAvoidVector = null,
}) {
  await ensureOffscreenDocument();
  // Force the model to load even if there's no intent text yet (e.g.
  // switching tiers right after install) — otherwise embedText's
  // empty-text short-circuit below would skip loading entirely, and a
  // tier switch with no visible download would look broken.
  await sendToOffscreen(MSG.ENSURE_MODEL_LOADED, { tier });
  const vector = intentChanged ? await embedText(intentText, tier) : prevVector;
  const avoidVector = avoidChanged ? await embedText(avoidText, tier) : prevAvoidVector;
  const version = (prevVersion || 0) + 1;
  const fit = vector ? await calibrate(vector, avoidVector, tier) : null;
  return { vector, avoidVector, version, calibration: fit ? { ...fit, version } : null };
}

// Keywords are matched lowercase (see shared/keyword-filter.js) — normalize
// here too rather than only trusting the chip UI, so that invariant holds
// regardless of caller.
function normalizeKeywords(list) {
  return (list || []).map((k) => (k || "").trim().toLowerCase()).filter(Boolean);
}

onMessage((type, payload, sender, sendResponse) => {
  if (type === MSG.SCORE_BATCH) {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const [profiles, settings] = await Promise.all([getProfiles(), getSettings()]);
        const profile = profiles.find((p) => p.id === payload.profileId);
        if (!profile || !profile.intentVector) {
          sendResponse({ ok: false, error: "No intent set yet." });
          return;
        }
        const response = await sendToOffscreen(MSG.SCORE_BATCH, {
          intentVector: profile.intentVector,
          avoidVector: profile.avoidVector,
          tier: settings[STORAGE_KEYS.MODEL_TIER] || DEFAULT_MODEL_TIER,
          videos: payload.videos,
        });
        if (!response || !response.ok) {
          sendResponse({ ok: false, error: response && response.error });
          return;
        }
        const cache = await getScoreCache();
        const prefix = `${profile.id}:`;
        for (const r of response.results) {
          cache[prefix + r.videoId] = { score: r.score, version: profile.intentVersion };
        }
        await setScoreCache(cache);
        sendResponse({ ok: true, results: response.results, failedCount: response.failedCount });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (type === MSG.SAVE_PROFILE) {
    (async () => {
      try {
        const profiles = await getProfiles();
        const profile = profiles.find((p) => p.id === payload.profileId);
        if (!profile) {
          sendResponse({ ok: false, error: "Profile not found." });
          return;
        }
        const settings = await getSettings();
        const tier = settings[STORAGE_KEYS.MODEL_TIER] || DEFAULT_MODEL_TIER;

        const intentChanged = payload.intent !== profile.intentText;
        const avoidChanged = (payload.avoidIntent || "") !== (profile.avoidText || "");

        let vector = profile.intentVector;
        let avoidVector = profile.avoidVector;
        let version = profile.intentVersion;
        let calibration = profile.calibration;

        if (intentChanged || avoidChanged) {
          const result = await reembedAndCalibrate({
            intentText: payload.intent,
            avoidText: payload.avoidIntent,
            tier,
            prevVersion: version,
            intentChanged,
            avoidChanged,
            prevVector: vector,
            prevAvoidVector: avoidVector,
          });
          vector = result.vector;
          avoidVector = result.avoidVector;
          version = result.version;
          calibration = result.calibration;
          await clearScoreCacheForProfile(profile.id);
        }

        const updated = {
          ...profile,
          name: payload.name || profile.name,
          intentText: payload.intent,
          intentVector: vector,
          avoidText: payload.avoidIntent || "",
          avoidVector,
          intentVersion: version,
          calibration,
          includeKeywords: normalizeKeywords(payload.includeKeywords),
          excludeKeywords: normalizeKeywords(payload.excludeKeywords),
          schedule: payload.schedule || profile.schedule,
          scheduleEnabled: !!payload.scheduleEnabled,
        };

        await setProfiles(profiles.map((p) => (p.id === updated.id ? updated : p)));

        sendResponse({ ok: true, profile: updated });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (type === MSG.SET_MODEL_TIER) {
    (async () => {
      try {
        const tier = payload.tier;
        const profiles = await getProfiles();
        const nextProfiles = [];
        for (const profile of profiles) {
          const result = await reembedAndCalibrate({
            intentText: profile.intentText,
            avoidText: profile.avoidText,
            tier,
            prevVersion: profile.intentVersion,
          });
          await clearScoreCacheForProfile(profile.id);
          nextProfiles.push({
            ...profile,
            intentVector: result.vector,
            avoidVector: result.avoidVector,
            intentVersion: result.version,
            calibration: result.calibration,
          });
        }
        await setProfiles(nextProfiles);
        await setSettings({ [STORAGE_KEYS.MODEL_TIER]: tier });

        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  return undefined;
}, { target: "background" });

// The review popup only makes sense on a YouTube tab. Everywhere else,
// clicking the toolbar icon should jump straight to Settings instead of
// showing an empty/irrelevant popup — so the popup is set per-tab rather
// than declared statically in the manifest.
function isYouTubeUrl(url) {
  return !!url && /^https:\/\/(www\.)?youtube\.com\//.test(url);
}

async function syncPopupForTab(tabId, url) {
  try {
    await chrome.action.setPopup({
      tabId,
      popup: isYouTubeUrl(url) ? "popup/popup.html" : "",
    });
  } catch {
    // Tab may have closed before this ran; safe to ignore.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    syncPopupForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => syncPopupForTab(tabId, tab.url));
});

chrome.action.onClicked.addListener((tab) => {
  // Only fires when no popup is set for this tab (i.e. non-YouTube tabs).
  chrome.runtime.openOptionsPage();
});

// On install/reload the service worker starts fresh with no per-tab popup
// state, so sync every currently open tab once.
chrome.tabs.query({}).then((tabs) => {
  for (const tab of tabs) syncPopupForTab(tab.id, tab.url);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});
