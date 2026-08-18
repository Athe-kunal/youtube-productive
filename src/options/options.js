import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { getSettings, setSettings } from "../shared/storage.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE } from "../shared/constants.js";
import { SENSITIVITY_LEVELS, DEFAULT_SENSITIVITY_KEY, kToLevelKey, levelKeyToK } from "../shared/sensitivity.js";

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
const sensitivityEl = document.getElementById("sensitivity");
const extensionEnabledEl = document.getElementById("extension-enabled");
const scheduleEnabledEl = document.getElementById("schedule-enabled");
const scheduleRowsEl = document.getElementById("schedule-rows");
const weekdayStartEl = document.getElementById("weekday-start");
const weekdayEndEl = document.getElementById("weekday-end");
const weekendStartEl = document.getElementById("weekend-start");
const weekendEndEl = document.getElementById("weekend-end");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

let selectedLevel = DEFAULT_SENSITIVITY_KEY;

const includeChips = createChipInput(document.getElementById("include-chips"), {
  placeholder: "e.g. kubernetes, rust",
  onChange: scheduleLiveSave,
});
const excludeChips = createChipInput(document.getElementById("exclude-chips"), {
  placeholder: "e.g. football, drama",
  onChange: scheduleLiveSave,
});

function setStatus(text) {
  statusEl.textContent = text;
}

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
      scheduleLiveSave();
    });
    sensitivityEl.appendChild(btn);
  }
}

function readSchedule() {
  return {
    weekday: { start: weekdayStartEl.value || "00:00", end: weekdayEndEl.value || "23:59" },
    weekend: { start: weekendStartEl.value || "00:00", end: weekendEndEl.value || "23:59" },
  };
}

function syncScheduleRowsVisibility() {
  scheduleRowsEl.hidden = !scheduleEnabledEl.checked;
}

async function load() {
  const settings = await getSettings();
  extensionEnabledEl.checked = settings[STORAGE_KEYS.EXTENSION_ENABLED] !== false;
  intentEl.value = settings[STORAGE_KEYS.INTENT_TEXT] || "";
  avoidEl.value = settings[STORAGE_KEYS.AVOID_TEXT] || "";
  includeChips.setChips(settings[STORAGE_KEYS.INCLUDE_KEYWORDS] || []);
  excludeChips.setChips(settings[STORAGE_KEYS.EXCLUDE_KEYWORDS] || []);
  selectedLevel = kToLevelKey(settings[STORAGE_KEYS.SENSITIVITY_K]);
  renderSensitivity();

  const schedule = settings[STORAGE_KEYS.SCHEDULE] || DEFAULT_SCHEDULE;
  weekdayStartEl.value = schedule.weekday.start;
  weekdayEndEl.value = schedule.weekday.end;
  weekendStartEl.value = schedule.weekend.start;
  weekendEndEl.value = schedule.weekend.end;
  scheduleEnabledEl.checked = !!settings[STORAGE_KEYS.SCHEDULE_ENABLED];
  syncScheduleRowsVisibility();
}

// Sensitivity / keyword / schedule edits are cheap: persist immediately so
// open YouTube tabs restyle instantly via chrome.storage.onChanged, no
// re-embedding.
let liveDebounce = null;
function scheduleLiveSave() {
  clearTimeout(liveDebounce);
  liveDebounce = setTimeout(async () => {
    await setSettings({
      [STORAGE_KEYS.SENSITIVITY_K]: levelKeyToK(selectedLevel),
      [STORAGE_KEYS.INCLUDE_KEYWORDS]: includeChips.getChips(),
      [STORAGE_KEYS.EXCLUDE_KEYWORDS]: excludeChips.getChips(),
      [STORAGE_KEYS.SCHEDULE]: readSchedule(),
      [STORAGE_KEYS.SCHEDULE_ENABLED]: scheduleEnabledEl.checked,
    });
  }, 200);
}

// Applies instantly, no Save click needed — this is a kill switch, not a
// tunable that benefits from a review-before-commit step.
extensionEnabledEl.addEventListener("change", () => {
  setSettings({ [STORAGE_KEYS.EXTENSION_ENABLED]: extensionEnabledEl.checked });
});

scheduleEnabledEl.addEventListener("change", () => {
  syncScheduleRowsVisibility();
  scheduleLiveSave();
});
for (const el of [weekdayStartEl, weekdayEndEl, weekendStartEl, weekendEndEl]) {
  el.addEventListener("input", scheduleLiveSave);
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;
  if (message.type === MSG.MODEL_DOWNLOAD_PROGRESS) {
    const p = message.payload;
    if (p && p.status === "progress") {
      setStatus(`Loading model… ${Math.round(p.progress || 0)}%`);
    } else {
      setStatus("Loading model…");
    }
  } else if (message.type === MSG.MODEL_READY) {
    setStatus("Model ready.");
  } else if (message.type === MSG.MODEL_ERROR) {
    setStatus(`Model error: ${message.payload && message.payload.message}`);
  }
});

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  setStatus("Saving…");
  try {
    const response = await sendToBackground(MSG.SAVE_SETTINGS, {
      intent: intentEl.value.trim(),
      avoidIntent: avoidEl.value.trim(),
      sensitivityK: levelKeyToK(selectedLevel),
      includeKeywords: includeChips.getChips(),
      excludeKeywords: excludeChips.getChips(),
      schedule: readSchedule(),
      scheduleEnabled: scheduleEnabledEl.checked,
    });
    if (response && response.ok) {
      setStatus("Saved.");
    } else {
      setStatus(`Error: ${(response && response.error) || "unknown"}`);
    }
  } finally {
    saveBtn.disabled = false;
  }
});

load();
