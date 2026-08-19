import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { startTour } from "../shared/tour.js";
import { getSettings, setSettings } from "../shared/storage.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE } from "../shared/constants.js";
// Model tier switching is disabled for now (see commented-out block below
// and in options.html) — re-add DEFAULT_MODEL_TIER, MODEL_TIERS to the
// import above when re-enabling it.

const TOUR_STEPS = [
  { selector: ".switch", text: "Master switch — pause or resume the whole extension instantly." },
  { selector: "#intent", text: "Show me — describe what you want to see, in your own words." },
  {
    selector: "#avoid",
    text: 'Avoid — describe what to skip here, not in "Show me". Models can\'t understand "no X".',
  },
  { selector: "#include-chips", text: "Always show — exact keywords that force a video to show, no matter the score." },
  { selector: "#exclude-chips", text: "Always hide — exact keywords that force a video to hide, no matter the score." },
  { selector: ".toggle-label", text: "Active hours — optionally only filter during set hours. Off by default." },
];

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
// const modelTierEl = document.getElementById("model-tier");
// const modelTierStatusEl = document.getElementById("model-tier-status");
const extensionEnabledEl = document.getElementById("extension-enabled");
const scheduleEnabledEl = document.getElementById("schedule-enabled");
const scheduleRowsEl = document.getElementById("schedule-rows");
const weekdayStartEl = document.getElementById("weekday-start");
const weekdayEndEl = document.getElementById("weekday-end");
const weekendStartEl = document.getElementById("weekend-start");
const weekendEndEl = document.getElementById("weekend-end");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

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

function readSchedule() {
  return {
    weekday: { start: weekdayStartEl.value || "00:00", end: weekdayEndEl.value || "23:59" },
    weekend: { start: weekendStartEl.value || "00:00", end: weekendEndEl.value || "23:59" },
  };
}

function syncScheduleRowsVisibility() {
  scheduleRowsEl.hidden = !scheduleEnabledEl.checked;
}

function runTour() {
  startTour(TOUR_STEPS, {
    onFinish: () => setSettings({ [STORAGE_KEYS.TOUR_SEEN]: true }),
  });
}

document.getElementById("tour-link").addEventListener("click", runTour);

// let currentTier = DEFAULT_MODEL_TIER;
//
// function tierFromCheckbox(checked) {
//   return checked ? "large" : "small";
// }

async function load() {
  const settings = await getSettings();
  extensionEnabledEl.checked = settings[STORAGE_KEYS.EXTENSION_ENABLED] !== false;
  intentEl.value = settings[STORAGE_KEYS.INTENT_TEXT] || "";
  avoidEl.value = settings[STORAGE_KEYS.AVOID_TEXT] || "";
  // currentTier = settings[STORAGE_KEYS.MODEL_TIER] || DEFAULT_MODEL_TIER;
  // modelTierEl.checked = currentTier === "large";
  includeChips.setChips(settings[STORAGE_KEYS.INCLUDE_KEYWORDS] || []);
  excludeChips.setChips(settings[STORAGE_KEYS.EXCLUDE_KEYWORDS] || []);

  const schedule = settings[STORAGE_KEYS.SCHEDULE] || DEFAULT_SCHEDULE;
  weekdayStartEl.value = schedule.weekday.start;
  weekdayEndEl.value = schedule.weekday.end;
  weekendStartEl.value = schedule.weekend.start;
  weekendEndEl.value = schedule.weekend.end;
  scheduleEnabledEl.checked = !!settings[STORAGE_KEYS.SCHEDULE_ENABLED];
  syncScheduleRowsVisibility();

  if (!settings[STORAGE_KEYS.TOUR_SEEN]) {
    // Let the page finish laying out before measuring element positions.
    requestAnimationFrame(runTour);
  }
}

// Keyword / schedule edits are cheap: persist immediately so open YouTube
// tabs restyle instantly via chrome.storage.onChanged, no re-embedding.
let liveDebounce = null;
function scheduleLiveSave() {
  clearTimeout(liveDebounce);
  liveDebounce = setTimeout(async () => {
    await setSettings({
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

// Model tier switching UI disabled for now — sticking to the small bundled
// model only. Re-enable by uncommenting this listener, the state/helpers
// above, and the markup in options.html.
//
// modelTierEl.addEventListener("change", async () => {
//   const nextTier = tierFromCheckbox(modelTierEl.checked);
//   if (nextTier === currentTier) return;
//
//   if (nextTier === "large") {
//     const proceed = confirm(
//       `Switch to ${MODEL_TIERS.large.label}? It downloads ${MODEL_TIERS.large.sizeLabel} and is slower per batch.`
//     );
//     if (!proceed) {
//       modelTierEl.checked = currentTier === "large";
//       return;
//     }
//   }
//
//   modelTierEl.disabled = true;
//   modelTierStatusEl.textContent = nextTier === "large" ? "Downloading model…" : "Switching model…";
//   try {
//     const response = await sendToBackground(MSG.SET_MODEL_TIER, { tier: nextTier });
//     if (response && response.ok) {
//       currentTier = nextTier;
//       modelTierStatusEl.textContent = "Model ready.";
//     } else {
//       modelTierEl.checked = currentTier === "large";
//       modelTierStatusEl.textContent = `Error: ${(response && response.error) || "unknown"}`;
//     }
//   } finally {
//     modelTierEl.disabled = false;
//   }
// });

scheduleEnabledEl.addEventListener("change", () => {
  syncScheduleRowsVisibility();
  scheduleLiveSave();
});
for (const el of [weekdayStartEl, weekdayEndEl, weekendStartEl, weekendEndEl]) {
  el.addEventListener("input", scheduleLiveSave);
}

// Drove the model-tier download status text; no-op while tier switching is
// disabled (see above).
// chrome.runtime.onMessage.addListener((message) => {
//   if (!message) return;
//   if (message.type === MSG.MODEL_DOWNLOAD_PROGRESS) {
//     const p = message.payload;
//     if (p && p.status === "progress") {
//       modelTierStatusEl.textContent = `Loading model… ${Math.round(p.progress || 0)}%`;
//     } else {
//       modelTierStatusEl.textContent = "Loading model…";
//     }
//   } else if (message.type === MSG.MODEL_READY) {
//     modelTierStatusEl.textContent = "Model ready.";
//   } else if (message.type === MSG.MODEL_ERROR) {
//     modelTierStatusEl.textContent = `Model error: ${message.payload && message.payload.message}`;
//   }
// });

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  setStatus("Saving…");
  try {
    const response = await sendToBackground(MSG.SAVE_SETTINGS, {
      intent: intentEl.value.trim(),
      avoidIntent: avoidEl.value.trim(),
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
