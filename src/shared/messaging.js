export const MSG = {
  ENSURE_MODEL_LOADED: "ENSURE_MODEL_LOADED",
  MODEL_READY: "MODEL_READY",
  MODEL_DOWNLOAD_PROGRESS: "MODEL_DOWNLOAD_PROGRESS",
  MODEL_ERROR: "MODEL_ERROR",

  EMBED_INTENT: "EMBED_INTENT",

  SCORE_BATCH: "SCORE_BATCH",

  // Updates an existing profile's intent/avoid text (plus whatever else is
  // in the payload) and re-embeds/recalibrates only if that text actually
  // changed. Creating, renaming, and deleting a profile touch no vectors,
  // so those go straight through shared/storage.js instead — no need to
  // round-trip through the background service worker just to reach
  // storage it already has direct access to.
  SAVE_PROFILE: "SAVE_PROFILE",
  SET_MODEL_TIER: "SET_MODEL_TIER",

  GET_FILTERED_VIDEOS: "GET_FILTERED_VIDEOS",
  UNHIDE_VIDEO: "UNHIDE_VIDEO",

  // Broadcast by the content script whenever a card's show/dim decision
  // changes (new scoring pass, keyword/schedule reapply, extension
  // toggled). The popup's "Filtered on this page" list is a snapshot taken
  // once on open (GET_FILTERED_VIDEOS is request/response, not live) — it
  // listens for this to know when to re-fetch that snapshot instead of
  // going stale the moment the user clicks Apply.
  FILTER_STATE_CHANGED: "FILTER_STATE_CHANGED",
};

// chrome.runtime.sendMessage broadcasts to every extension page — options,
// popup, offscreen, and the sending context's own listeners. Messages that
// expect exactly one handler to respond (background's SCORE_BATCH/
// SAVE_PROFILE, offscreen's SCORE_BATCH/EMBED_INTENT) carry a `target` so
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
