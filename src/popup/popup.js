import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { getSettings, setSettings, getProfiles } from "../shared/storage.js";
import { pickActiveProfile } from "../shared/profiles.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE } from "../shared/constants.js";

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
const intentCounterEl = document.getElementById("intent-counter");
const avoidCounterEl = document.getElementById("avoid-counter");
const extensionEnabledEl = document.getElementById("extension-enabled");
const profileSelectEl = document.getElementById("profile-select");
const profileHintEl = document.getElementById("profile-hint");
const scheduleEnabledEl = document.getElementById("schedule-enabled");
const scheduleRowsEl = document.getElementById("schedule-rows");
const weekdayStartEl = document.getElementById("weekday-start");
const weekdayEndEl = document.getElementById("weekday-end");
const weekendStartEl = document.getElementById("weekend-start");
const weekendEndEl = document.getElementById("weekend-end");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const emptyState = document.getElementById("empty-state");
const listEl = document.getElementById("list");

let currentTabId = null;
let profiles = [];
let currentProfileId = null;

const includeChips = createChipInput(document.getElementById("include-chips"), {
  placeholder: "e.g. kubernetes, rust",
});
const excludeChips = createChipInput(document.getElementById("exclude-chips"), {
  placeholder: "e.g. football, drama",
});

function updateCounter(el, counterEl) {
  counterEl.textContent = `${el.maxLength - el.value.length} characters left`;
}

intentEl.addEventListener("input", () => updateCounter(intentEl, intentCounterEl));
avoidEl.addEventListener("input", () => updateCounter(avoidEl, avoidCounterEl));

document.getElementById("full-settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Applies instantly, no Save click needed — this is a kill switch, not a
// tunable that benefits from a review-before-commit step.
extensionEnabledEl.addEventListener("change", () => {
  setSettings({ [STORAGE_KEYS.EXTENSION_ENABLED]: extensionEnabledEl.checked });
});

function readSchedule() {
  return {
    weekday: { start: weekdayStartEl.value || "00:00", end: weekdayEndEl.value || "23:59" },
    weekend: { start: weekendStartEl.value || "00:00", end: weekendEndEl.value || "23:59" },
  };
}

function syncScheduleRowsVisibility() {
  scheduleRowsEl.hidden = !scheduleEnabledEl.checked;
}

function currentProfile() {
  return profiles.find((p) => p.id === currentProfileId) || null;
}

function loadProfileIntoForm(profile) {
  intentEl.value = profile.intentText || "";
  avoidEl.value = profile.avoidText || "";
  updateCounter(intentEl, intentCounterEl);
  updateCounter(avoidEl, avoidCounterEl);
  includeChips.setChips(profile.includeKeywords || []);
  excludeChips.setChips(profile.excludeKeywords || []);

  const schedule = profile.schedule || DEFAULT_SCHEDULE;
  weekdayStartEl.value = schedule.weekday.start;
  weekdayEndEl.value = schedule.weekday.end;
  weekendStartEl.value = schedule.weekend.start;
  weekendEndEl.value = schedule.weekend.end;
  scheduleEnabledEl.checked = !!profile.scheduleEnabled;
  syncScheduleRowsVisibility();

  const active = pickActiveProfile(profiles);
  profileHintEl.textContent =
    active && active.id === profile.id ? "Active right now." : "Not active right now.";
}

function renderProfileOptions() {
  const active = pickActiveProfile(profiles);
  profileSelectEl.innerHTML = "";
  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = active && active.id === profile.id ? `${profile.name} (active)` : profile.name;
    profileSelectEl.appendChild(option);
  }
  profileSelectEl.value = currentProfileId;
}

profileSelectEl.addEventListener("change", () => {
  currentProfileId = profileSelectEl.value;
  const profile = currentProfile();
  if (profile) loadProfileIntoForm(profile);
});

async function loadSettings() {
  const settings = await getSettings();
  extensionEnabledEl.checked = settings[STORAGE_KEYS.EXTENSION_ENABLED] !== false;

  profiles = await getProfiles();
  const active = pickActiveProfile(profiles);
  currentProfileId = (active || profiles[0]).id;
  renderProfileOptions();
  loadProfileIntoForm(currentProfile());
}

saveBtn.addEventListener("click", async () => {
  const profile = currentProfile();
  if (!profile) return;
  saveBtn.disabled = true;
  statusEl.textContent = "Saving…";
  try {
    const response = await sendToBackground(MSG.SAVE_PROFILE, {
      profileId: profile.id,
      name: profile.name,
      intent: intentEl.value.trim(),
      avoidIntent: avoidEl.value.trim(),
      includeKeywords: includeChips.getChips(),
      excludeKeywords: excludeChips.getChips(),
      schedule: readSchedule(),
      scheduleEnabled: scheduleEnabledEl.checked,
    });
    if (response && response.ok) {
      statusEl.textContent = "Saved.";
      profiles = profiles.map((p) => (p.id === profile.id ? response.profile : p));
      renderProfileOptions();
      loadProfileIntoForm(currentProfile());
    } else {
      statusEl.textContent = `Error: ${(response && response.error) || "unknown"}`;
    }
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

    const infoEl = document.createElement("span");
    infoEl.className = "row-info";

    const typeBadge = document.createElement("span");
    typeBadge.className = v.isShort ? "type-badge type-badge-short" : "type-badge type-badge-video";
    typeBadge.textContent = v.isShort ? "Short" : "Video";

    const titleEl = document.createElement("span");
    titleEl.className = "row-title";
    titleEl.textContent = v.title;

    infoEl.append(typeBadge, titleEl);

    const unhideBtn = document.createElement("button");
    unhideBtn.type = "button";
    unhideBtn.className = "unhide-btn";
    unhideBtn.textContent = "Unhide";
    unhideBtn.addEventListener("click", async () => {
      unhideBtn.disabled = true;
      try {
        await chrome.tabs.sendMessage(currentTabId, { type: MSG.UNHIDE_VIDEO, payload: { videoId: v.videoId } });
        li.remove();
        if (!listEl.children.length) {
          emptyState.textContent = "Nothing filtered on this page yet.";
          emptyState.style.display = "";
        }
      } catch {
        unhideBtn.disabled = false;
      }
    });

    li.append(infoEl, unhideBtn);
    listEl.appendChild(li);
  }
}

async function loadFiltered() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("youtube.com")) {
    emptyState.textContent = "Open youtube.com to see filtered videos here.";
    return;
  }
  currentTabId = tab.id;

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

  if (!response.isSupportedPage) {
    emptyState.textContent = "Filtering runs on the home feed and video-watch recommendations.";
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
