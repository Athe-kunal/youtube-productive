import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { getProfiles, getStats, updateProfileFields } from "../shared/storage.js";
import { dayKey } from "../shared/stats.js";
import {
  pickActiveProfile,
  hardcoreRevealDelaySeconds,
} from "../shared/profiles.js";
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

// Hardcore mode can only be turned ON from here. Turning it off (or
// pausing it) happens in full settings, so there is no way around it from
// the popup. The only friction here is the breathing session that gates
// viewing the hidden videos.
const hardcoreSectionEl = document.getElementById("hardcore-section");
const hardcoreToggleEl = document.getElementById("hardcore-toggle");
const hardcoreStatusEl = document.getElementById("hardcore-status");
let hardcoreTimer = null;
let revealsToday = 0;

function renderHardcore() {
  clearTimeout(hardcoreTimer);
  const profile = currentProfile();
  hardcoreSectionEl.hidden = !profile;
  if (!profile) return;
  // A pause set earlier in full settings or by an older version counts as off.
  const left = (profile.hardcoreOffUntil || 0) - Date.now();
  const paused = !!profile.hardcoreMode && left > 0;
  const on = !!profile.hardcoreMode && !paused;
  // While on there is no switch at all, so nothing suggests it can be turned
  // off here; it only appears when hardcore is off, to turn it on.
  hardcoreToggleEl.checked = on;
  hardcoreToggleEl.hidden = on;
  hardcoreStatusEl.textContent = on ? "Hardcore mode is on." : "Off";
  if (paused) hardcoreTimer = setTimeout(renderHardcore, Math.min(left, 15000) + 50);
}

// ---- Breathing gate (Opal-style) ----
// Viewing the videos hardcore mode hid starts a guided breathing session. Its length doubles with each one
// completed today (see hardcoreRevealDelaySeconds) and is never shown —
// only the orb and "Breathe in" / "Breathe out". Cancelling or closing the
// popup abandons it without counting.
const BREATHE_IN_MS = 4000;
const BREATHE_CYCLE_MS = 10000; // 4s in + 6s out; matches the CSS animation
const breatheEl = document.getElementById("breathe");
const breathePhaseEl = document.getElementById("breathe-phase");
const breatheTimeEl = document.getElementById("breathe-time");
const breatheFillEl = document.getElementById("breathe-fill");
const hideNowBtnEl = document.getElementById("hide-now-btn");

// { endsAt, startedAt, onDone, timer } while a session runs.
let breathe = null;

function startBreathe(host, beforeNode, onDone) {
  if (breathe) return;
  const seconds = hardcoreRevealDelaySeconds(revealsToday);
  const now = Date.now();
  breathe = { startedAt: now, endsAt: now + seconds * 1000, onDone, timer: null };
  // Shown in place — inside whichever card started it — not at the top.
  host.insertBefore(breatheEl, beforeNode);
  breatheEl.hidden = false;
  // One linear CSS transition for the whole wait, so the fill moves
  // smoothly instead of stepping with the 250ms text tick.
  breatheFillEl.style.transition = "none";
  breatheFillEl.style.width = "0%";
  void breatheFillEl.offsetWidth;
  breatheFillEl.style.transition = `width ${seconds}s linear`;
  breatheFillEl.style.width = "100%";
  breatheEl.classList.add("is-running");
  breatheEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  renderHardcore();
  loadFiltered();
  tickBreathe();
}

function tickBreathe() {
  if (!breathe) return;
  const now = Date.now();
  if (now >= breathe.endsAt) {
    const { onDone } = breathe;
    stopBreathe();
    onDone();
    return;
  }
  const inhaling = (now - breathe.startedAt) % BREATHE_CYCLE_MS < BREATHE_IN_MS;
  breatheTimeEl.textContent = `Wait for ${Math.ceil((breathe.endsAt - now) / 1000)}s`;
  breathePhaseEl.textContent = inhaling ? "Breathe In" : "Breathe Out";
  breatheEl.classList.toggle("is-in", inhaling);
  breatheEl.classList.toggle("is-out", !inhaling);
  breathe.timer = setTimeout(tickBreathe, 250);
}

function stopBreathe() {
  if (!breathe) return;
  clearTimeout(breathe.timer);
  breathe = null;
  breatheEl.hidden = true;
  breatheEl.classList.remove("is-running", "is-in", "is-out");
  renderHardcore();
}

function cancelBreathe() {
  if (!breathe) return;
  stopBreathe();
  loadFiltered();
}

document.getElementById("breathe-cancel").addEventListener("click", cancelBreathe);

async function renderHardcoreStats() {
  const stats = await getStats();
  revealsToday = (stats[dayKey()] || {}).hardcoreReveals || 0;
  if (!breathe) renderHardcore();
}

async function updateHardcore(profileId, fields) {
  const updated = await updateProfileFields(profileId, fields);
  profiles = profiles.map((p) => (p.id === profileId ? updated : p));
  renderHardcore();
}

hardcoreToggleEl.addEventListener("change", () => {
  const profile = currentProfile();
  if (!profile || !hardcoreToggleEl.checked) return;
  updateHardcore(profile.id, { hardcoreMode: true, hardcoreOffUntil: 0 });
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

// Only reveals the time pickers; the choice is persisted on Apply.
scheduleEnabledEl.addEventListener("change", syncScheduleRowsVisibility);

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
  const isActive = !!active && active.id === profile.id;
  profileHintEl.textContent = isActive ? "Active right now" : "Not active right now";
  profileHintEl.parentElement.classList.toggle("is-active", isActive);
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
  cancelBreathe();
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

// ---- Reveal gate: hidden videos behind a breathing session ----
const filteredSectionEl = document.getElementById("filtered-section");
const revealGateEl = document.getElementById("reveal-gate");
const revealBtnEl = document.getElementById("reveal-btn");
function startReveal() {
  const tabId = currentTabId;
  if (!tabId) return;
  startBreathe(filteredSectionEl, listEl, async () => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: MSG.REVEAL_HARDCORE });
      if (response && response.ok) {
        sendToBackground(MSG.RECORD_STAT, { kind: "hardcoreReveals", count: 1 }).catch(() => {});
      }
    } catch {
      // Tab went away; loadFiltered below explains what to do.
    }
    await loadFiltered();
  });
}

hideNowBtnEl.addEventListener("click", async () => {
  hideNowBtnEl.disabled = true;
  try {
    await chrome.tabs.sendMessage(currentTabId, { type: MSG.LOCK_HARDCORE });
  } catch {
    // Tab went away; loadFiltered below explains what to do.
  }
  hideNowBtnEl.disabled = false;
  await loadFiltered();
});

function showLockedGate() {
  listEl.innerHTML = "";
  emptyState.style.display = "none";
  revealGateEl.hidden = !!breathe;
  hideNowBtnEl.hidden = true;
}

revealBtnEl.addEventListener("click", startReveal);

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

  // `locked` is undefined from a content script injected before the reveal
  // gate existed (YouTube tab not reloaded yet): fall back to `hardcore`.
  if (response.locked || (response.hardcore && response.locked === undefined)) {
    showLockedGate();
    return;
  }
  revealGateEl.hidden = true;
  hideNowBtnEl.hidden = !(response.hardcore && response.revealUntil > Date.now());

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
