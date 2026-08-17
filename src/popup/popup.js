import { MSG, sendToBackground } from "../shared/messaging.js";
import { parseKeywordList } from "../shared/keyword-filter.js";
import { getSettings } from "../shared/storage.js";
import { STORAGE_KEYS } from "../shared/constants.js";
import { SENSITIVITY_LEVELS, DEFAULT_SENSITIVITY_KEY, kToLevelKey, levelKeyToK } from "../shared/sensitivity.js";

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
const includeEl = document.getElementById("include");
const excludeEl = document.getElementById("exclude");
const sensitivityEl = document.getElementById("sensitivity");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const emptyState = document.getElementById("empty-state");
const listEl = document.getElementById("list");

let selectedLevel = DEFAULT_SENSITIVITY_KEY;

document.getElementById("full-settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function renderSensitivity() {
  sensitivityEl.innerHTML = "";
  for (const level of SENSITIVITY_LEVELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = level.label;
    btn.className = level.key === selectedLevel ? "active" : "";
    btn.addEventListener("click", () => {
      selectedLevel = level.key;
      renderSensitivity();
    });
    sensitivityEl.appendChild(btn);
  }
}

async function loadSettings() {
  const settings = await getSettings();
  intentEl.value = settings[STORAGE_KEYS.INTENT_TEXT] || "";
  avoidEl.value = settings[STORAGE_KEYS.AVOID_TEXT] || "";
  includeEl.value = (settings[STORAGE_KEYS.INCLUDE_KEYWORDS] || []).join(", ");
  excludeEl.value = (settings[STORAGE_KEYS.EXCLUDE_KEYWORDS] || []).join(", ");
  selectedLevel = kToLevelKey(settings[STORAGE_KEYS.SENSITIVITY_K]);
  renderSensitivity();
}

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  statusEl.textContent = "Saving…";
  try {
    const response = await sendToBackground(MSG.SAVE_SETTINGS, {
      intent: intentEl.value.trim(),
      avoidIntent: avoidEl.value.trim(),
      sensitivityK: levelKeyToK(selectedLevel),
      includeKeywords: parseKeywordList(includeEl.value),
      excludeKeywords: parseKeywordList(excludeEl.value),
    });
    statusEl.textContent = response && response.ok ? "Saved." : `Error: ${(response && response.error) || "unknown"}`;
  } finally {
    saveBtn.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;
  if (message.type === MSG.MODEL_DOWNLOAD_PROGRESS) {
    statusEl.textContent = "Loading model…";
  } else if (message.type === MSG.MODEL_READY) {
    statusEl.textContent = "Model ready.";
  } else if (message.type === MSG.MODEL_ERROR) {
    statusEl.textContent = `Model error: ${message.payload && message.payload.message}`;
  }
});

function renderFiltered(dimmed) {
  listEl.innerHTML = "";
  for (const v of dimmed) {
    const li = document.createElement("li");
    const titleEl = document.createElement("span");
    titleEl.className = "row-title";
    titleEl.textContent = v.title;
    const metaEl = document.createElement("span");
    metaEl.className = "row-meta";
    metaEl.textContent = `${v.channel || "Unknown channel"} · score ${v.score.toFixed(2)}`;
    li.append(titleEl, metaEl);
    listEl.appendChild(li);
  }
}

async function loadFiltered() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("youtube.com")) {
    emptyState.textContent = "Open youtube.com to see filtered videos here.";
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: MSG.GET_FILTERED_VIDEOS });
  } catch {
    emptyState.textContent = "Reload the YouTube tab to activate the filter.";
    return;
  }

  if (!response || !response.ok) {
    emptyState.textContent = "No data yet — reload the YouTube tab.";
    return;
  }

  if (!response.isHomeFeed) {
    emptyState.textContent = "Filtering only runs on the YouTube home feed (v1).";
    return;
  }

  if (response.dimmed.length === 0) {
    emptyState.textContent = "Nothing filtered on this page yet.";
    return;
  }

  emptyState.style.display = "none";
  renderFiltered(response.dimmed);
}

loadSettings();
loadFiltered();
