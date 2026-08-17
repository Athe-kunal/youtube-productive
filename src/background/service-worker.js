import { MSG, onMessage } from "../shared/messaging.js";
import { getSettings, setSettings, getScoreCache, clearScoreCache, setScoreCache } from "../shared/storage.js";
import { STORAGE_KEYS } from "../shared/constants.js";

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

function sendToOffscreen(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

// Relay model lifecycle events from the offscreen document out to whichever
// tabs/pages care (options page, active YouTube tabs).
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

onMessage((type, payload, sender, sendResponse) => {
  if (type === MSG.SCORE_BATCH) {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const settings = await getSettings();
        const intentVector = settings[STORAGE_KEYS.INTENT_VECTOR];
        if (!intentVector) {
          sendResponse({ ok: false, error: "No intent set yet." });
          return;
        }
        const response = await sendToOffscreen(MSG.SCORE_BATCH, {
          intentVector,
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
        sendResponse({ ok: true, results: response.results });
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

        let vector = prev[STORAGE_KEYS.INTENT_VECTOR];
        let version = prev[STORAGE_KEYS.INTENT_VERSION];

        if (intentChanged) {
          await ensureOffscreenDocument();
          const embedResponse = await sendToOffscreen(MSG.EMBED_INTENT, { text: payload.intent });
          if (!embedResponse || !embedResponse.ok) {
            sendResponse({ ok: false, error: embedResponse && embedResponse.error });
            return;
          }
          vector = embedResponse.vector;
          version = (version || 0) + 1;
          await clearScoreCache();
        }

        await setSettings({
          [STORAGE_KEYS.INTENT_TEXT]: payload.intent,
          [STORAGE_KEYS.INTENT_VECTOR]: vector,
          [STORAGE_KEYS.INTENT_VERSION]: version,
          [STORAGE_KEYS.THRESHOLD]: payload.threshold,
          [STORAGE_KEYS.INCLUDE_KEYWORDS]: payload.includeKeywords,
          [STORAGE_KEYS.EXCLUDE_KEYWORDS]: payload.excludeKeywords,
        });

        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  return undefined;
});

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
