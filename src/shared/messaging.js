export const MSG = {
  ENSURE_MODEL_LOADED: "ENSURE_MODEL_LOADED",
  MODEL_READY: "MODEL_READY",
  MODEL_DOWNLOAD_PROGRESS: "MODEL_DOWNLOAD_PROGRESS",
  MODEL_ERROR: "MODEL_ERROR",

  EMBED_INTENT: "EMBED_INTENT",
  EMBED_INTENT_RESULT: "EMBED_INTENT_RESULT",

  SCORE_BATCH: "SCORE_BATCH",
  SCORE_RESULTS: "SCORE_RESULTS",

  SAVE_SETTINGS: "SAVE_SETTINGS",
  SETTINGS_SAVED: "SETTINGS_SAVED",
  EMBEDDING_ERROR: "EMBEDDING_ERROR",

  GET_FILTERED_VIDEOS: "GET_FILTERED_VIDEOS",
};

// chrome.runtime.sendMessage broadcasts to every extension page — options,
// popup, offscreen, and the sending context's own listeners. Messages that
// expect exactly one handler to respond (background's SCORE_BATCH/
// SAVE_SETTINGS, offscreen's SCORE_BATCH/EMBED_INTENT) carry a `target` so
// only the intended listener acts on them; everyone else bails via the
// `target` filter in onMessage. Without this, background broadcasting a
// message to offscreen also re-enters background's own listener for the
// same message type, racing whichever one calls sendResponse first.
export function sendToBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload, target: "background" });
}

export function sendToOffscreen(type, payload) {
  return chrome.runtime.sendMessage({ type, payload, target: "offscreen" });
}

export function sendToTab(tabId, type, payload) {
  return chrome.tabs.sendMessage(tabId, { type, payload });
}

export function onMessage(handler, { target } = {}) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return undefined;
    if (target && message.target !== target) return undefined;
    const result = handler(message.type, message.payload, sender, sendResponse);
    // Return true from the handler to keep the channel open for an async sendResponse.
    return result === true;
  });
}
