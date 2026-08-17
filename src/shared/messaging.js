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

export function sendToBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

export function sendToTab(tabId, type, payload) {
  return chrome.tabs.sendMessage(tabId, { type, payload });
}

export function onMessage(handler) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return undefined;
    const result = handler(message.type, message.payload, sender, sendResponse);
    // Return true from the handler to keep the channel open for an async sendResponse.
    return result === true;
  });
}
