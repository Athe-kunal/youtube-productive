import { MSG, onMessage, sendToOffscreen } from "../shared/messaging.js";
import { getSettings, setSettings, getScoreCache, clearScoreCache, setScoreCache } from "../shared/storage.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE, DEFAULT_SENSITIVITY_K, DEFAULT_MODEL_TIER } from "../shared/constants.js";
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
 * Re-embeds the intent/avoid text under `tier` and recalibrates against
 * the probe set — shared by SAVE_SETTINGS (when the text changed) and
 * SET_MODEL_TIER (when the model changed but the text didn't), since a
 * tier switch invalidates the old vectors' dimensionality exactly like an
 * intent text edit invalidates their meaning.
 */
async function reembedAndCalibrate(intentText, avoidText, tier, prevVersion) {
  await ensureOffscreenDocument();
  // Force the model to load even if there's no intent text yet (e.g.
  // switching tiers right after install) — otherwise embedText's
  // empty-text short-circuit below would skip loading entirely, and a
  // tier switch with no visible download would look broken.
  await sendToOffscreen(MSG.ENSURE_MODEL_LOADED, { tier });
  const vector = await embedText(intentText, tier);
  const avoidVector = await embedText(avoidText, tier);
  const version = (prevVersion || 0) + 1;
  await clearScoreCache();
  const fit = vector ? await calibrate(vector, avoidVector, tier) : null;
  return { vector, avoidVector, version, calibration: fit ? { ...fit, version } : null };
}

onMessage((type, payload, sender, sendResponse) => {
  if (type === MSG.SCORE_BATCH) {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const settings = await getSettings();
        const intentVector = settings[STORAGE_KEYS.INTENT_VECTOR];
        const avoidVector = settings[STORAGE_KEYS.AVOID_VECTOR];
        if (!intentVector) {
          sendResponse({ ok: false, error: "No intent set yet." });
          return;
        }
        const response = await sendToOffscreen(MSG.SCORE_BATCH, {
          intentVector,
          avoidVector,
          tier: settings[STORAGE_KEYS.MODEL_TIER] || DEFAULT_MODEL_TIER,
          videos: payload.videos,
        });
        if (!response || !response.ok) {
          sendResponse({ ok: false, error: response && response.error });
          return;
        }
        const cache = await getScoreCache();
        const version = settings[STORAGE_KEYS.INTENT_VERSION];
        for (const r of response.results) {
          cache[r.videoId] = { score: r.score, version };
        }
        await setScoreCache(cache);
        sendResponse({ ok: true, results: response.results, failedCount: response.failedCount });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (type === MSG.SAVE_SETTINGS) {
    (async () => {
      try {
        const prev = await getSettings();
        const intentChanged = payload.intent !== prev[STORAGE_KEYS.INTENT_TEXT];
        const avoidChanged = (payload.avoidIntent || "") !== (prev[STORAGE_KEYS.AVOID_TEXT] || "");
        const tier = prev[STORAGE_KEYS.MODEL_TIER] || DEFAULT_MODEL_TIER;

        let vector = prev[STORAGE_KEYS.INTENT_VECTOR];
        let avoidVector = prev[STORAGE_KEYS.AVOID_VECTOR] || null;
        let version = prev[STORAGE_KEYS.INTENT_VERSION];
        let calibration = prev[STORAGE_KEYS.CALIBRATION] || null;

        if (intentChanged || avoidChanged) {
          const result = await reembedAndCalibrate(payload.intent, payload.avoidIntent, tier, version);
          vector = result.vector;
          avoidVector = result.avoidVector;
          version = result.version;
          calibration = result.calibration;
        }

        await setSettings({
          [STORAGE_KEYS.INTENT_TEXT]: payload.intent,
          [STORAGE_KEYS.INTENT_VECTOR]: vector,
          [STORAGE_KEYS.AVOID_TEXT]: payload.avoidIntent || "",
          [STORAGE_KEYS.AVOID_VECTOR]: avoidVector,
          [STORAGE_KEYS.INTENT_VERSION]: version,
          [STORAGE_KEYS.CALIBRATION]: calibration,
          // Fixed rather than user-tunable — the three-way "Show more /
          // Balanced / Show less" control turned out to be more confusing
          // than useful, since its effect depends on calibration the user
          // can't see.
          [STORAGE_KEYS.SENSITIVITY_K]: DEFAULT_SENSITIVITY_K,
          [STORAGE_KEYS.INCLUDE_KEYWORDS]: payload.includeKeywords,
          [STORAGE_KEYS.EXCLUDE_KEYWORDS]: payload.excludeKeywords,
          [STORAGE_KEYS.SCHEDULE]: payload.schedule || DEFAULT_SCHEDULE,
          [STORAGE_KEYS.SCHEDULE_ENABLED]: !!payload.scheduleEnabled,
        });

        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (type === MSG.SET_MODEL_TIER) {
    (async () => {
      try {
        const prev = await getSettings();
        const tier = payload.tier;
        const result = await reembedAndCalibrate(
          prev[STORAGE_KEYS.INTENT_TEXT],
          prev[STORAGE_KEYS.AVOID_TEXT],
          tier,
          prev[STORAGE_KEYS.INTENT_VERSION]
        );

        await setSettings({
          [STORAGE_KEYS.MODEL_TIER]: tier,
          [STORAGE_KEYS.INTENT_VECTOR]: result.vector,
          [STORAGE_KEYS.AVOID_VECTOR]: result.avoidVector,
          [STORAGE_KEYS.INTENT_VERSION]: result.version,
          [STORAGE_KEYS.CALIBRATION]: result.calibration,
        });

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
