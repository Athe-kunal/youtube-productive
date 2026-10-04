import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { getProfiles, getStats, updateProfileFields } from "../shared/storage.js";
import { dayKey } from "../shared/stats.js";
import { pickActiveProfile, isHardcoreActive, HARDCORE_PAUSE_MAX_MINUTES } from "../shared/profiles.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE } from "../shared/constants.js";

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
const intentCounterEl = document.getElementById("intent-counter");
const avoidCounterEl = document.getElementById("avoid-counter");
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
const todayStatsEl = document.getElementById("today-stats");

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

// No master switch here — it lives only in full settings. Hardcore mode can
// only be paused here for a bounded time (max 1 hour) and resumes by itself;
// every pause is counted in the stats.
const hardcoreSectionEl = document.getElementById("hardcore-section");
const hardcoreStatusEl = document.getElementById("hardcore-status");
const hardcoreMinutesEl = document.getElementById("hardcore-minutes");
const hardcorePauseRow = document.getElementById("hardcore-pause-row");
const hardcoreResumeBtn = document.getElementById("hardcore-resume");
const hardcoreStatsEl = document.getElementById("hardcore-stats");
let hardcoreTimer = null;

function renderHardcore() {
  clearTimeout(hardcoreTimer);
  const profile = currentProfile();
  hardcoreSectionEl.hidden = !(profile && profile.hardcoreMode);
  if (hardcoreSectionEl.hidden) return;
  const left = (profile.hardcoreOffUntil || 0) - Date.now();
  const paused = left > 0;
  hardcorePauseRow.hidden = paused;
  hardcoreResumeBtn.hidden = !paused;
  if (paused) {
    const mins = Math.ceil(left / 60000);
    hardcoreStatusEl.textContent = `Off for ${mins} more min — back on automatically.`;
    hardcoreTimer = setTimeout(renderHardcore, Math.min(left, 15000) + 50);
  } else {
    hardcoreStatusEl.textContent = "On — filtered videos can't be unhidden.";
  }
}

async function renderHardcoreStats() {
  const stats = await getStats();
  let offs = 0;
  let minutes = 0;
  for (const day of Object.values(stats)) {
    offs += day.hardcoreOffs || 0;
    minutes += day.hardcoreOffMinutes || 0;
  }
  hardcoreStatsEl.textContent = `Switched off ${offs} time${offs === 1 ? "" : "s"} · ${minutes} min total`;
}

async function setHardcorePause(minutes) {
  const profile = currentProfile();
  if (!profile) return;
  const updated = await updateProfileFields(profile.id, {
    hardcoreOffUntil: minutes > 0 ? Date.now() + minutes * 60000 : 0,
  });
  profiles = profiles.map((p) => (p.id === profile.id ? updated : p));
  renderHardcore();
}

document.getElementById("hardcore-pause").addEventListener("click", async () => {
  const minutes = Math.min(
    HARDCORE_PAUSE_MAX_MINUTES,
    Math.max(1, Math.round(Number(hardcoreMinutesEl.value) || 0))
  );
  hardcoreMinutesEl.value = minutes;
  await setHardcorePause(minutes);
  sendToBackground(MSG.RECORD_STAT, { kind: "hardcoreOffs", count: 1 }).catch(() => {});
  sendToBackground(MSG.RECORD_STAT, { kind: "hardcoreOffMinutes", count: minutes }).catch(() => {});
});

hardcoreResumeBtn.addEventListener("click", async () => {
  // Ending early: refund the unused minutes so the tally reflects time
  // actually spent with hardcore off.
  const profile = currentProfile();
  const unused = Math.floor(((profile && profile.hardcoreOffUntil) - Date.now()) / 60000);
  await setHardcorePause(0);
  if (unused > 0) {
    sendToBackground(MSG.RECORD_STAT, { kind: "hardcoreOffMinutes", count: -unused }).catch(() => {});
  }
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

async function renderTodayStats() {
  const stats = await getStats();
  const today = stats[dayKey()] || {};
  todayStatsEl.replaceChildren();
  const parts = [
    ["Unhidden today: ", today.unhides || 0],
    [" · Filtered today: ", today.filtered || 0],
  ];
  for (const [label, value] of parts) {
    const strong = document.createElement("strong");
    strong.textContent = value;
    todayStatsEl.append(label, strong);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (STORAGE_KEYS.STATS in changes) {
    renderTodayStats();
    renderHardcoreStats();
  }
});

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
  renderHardcore();

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
  profiles = await getProfiles();
  const active = pickActiveProfile(profiles);
  currentProfileId = (active || profiles[0]).id;
  renderProfileOptions();
  loadProfileIntoForm(currentProfile());
  renderTodayStats();
  renderHardcoreStats();
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

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message) return;
  if (message.type === MSG.MODEL_DOWNLOAD_PROGRESS) {
    statusEl.textContent = "Loading model…";
  } else if (message.type === MSG.MODEL_READY) {
    statusEl.textContent = "Model ready.";
  } else if (message.type === MSG.MODEL_ERROR) {
    statusEl.textContent = `Model error: ${message.payload && message.payload.message}`;
  } else if (message.type === MSG.FILTER_STATE_CHANGED) {
    // The content script re-scores asynchronously after Apply — this is
    // its "I've updated some decisions" signal, since GET_FILTERED_VIDEOS
    // is a one-shot snapshot that would otherwise go stale the moment
    // Apply is clicked (thumbnail hides on the page, but the popup's list
    // still shows the pre-Apply state).
    // currentTabId is set inside loadFiltered(), which is still awaiting its
    // first chrome.tabs.query() for a brief window right after the popup
    // opens — a broadcast landing in that window used to be dropped (it
    // matched neither branch), leaving the popup stuck on an empty or
    // pre-scoring snapshot until the next time it was reopened.
    if (!currentTabId || !sender.tab || sender.tab.id === currentTabId) loadFiltered();
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
        const response = await chrome.tabs.sendMessage(currentTabId, {
          type: MSG.UNHIDE_VIDEO,
          payload: { videoId: v.videoId },
        });
        if (response && response.hardcore) {
          await loadFiltered();
        } else if (response && response.ok && response.scrolled) {
          li.remove();
          if (!listEl.children.length) {
            emptyState.textContent = "Nothing filtered on this page yet.";
            emptyState.style.display = "";
          }
          // Deliberately does NOT close the popup — unhiding is often done
          // one-after-another for several rows in the same list, and
          // closing after each click meant reopening the popup and finding
          // your place again just to unhide the next one. The tab's scroll
          // happens behind the popup either way; closing it (click outside,
          // Escape) reveals the result whenever the user's ready to look.
        } else {
          // scrolled: false means the content script couldn't find the card
          // it had tracked (stale after scrolling/DOM churn/navigation) —
          // this row no longer reflects the live page, so refetch instead of
          // just removing it and leaving the rest of the list stale too.
          await loadFiltered();
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

  if (response.hardcore) {
    listEl.innerHTML = "";
    emptyState.style.display = "";
    emptyState.textContent = "Hardcore mode is on — filtered videos stay hidden.";
    return;
  }

  if (response.dimmed.length === 0) {
    listEl.innerHTML = "";
    emptyState.style.display = "";
    emptyState.textContent = "Nothing filtered on this page yet.";
    return;
  }

  emptyState.style.display = "none";
  renderFiltered(response.dimmed);
}

loadSettings();
loadFiltered();
