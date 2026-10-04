import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { startTour } from "../shared/tour.js";
import { getSettings, setSettings, getProfiles, setProfiles, updateProfileFields, deleteProfile, getStats } from "../shared/storage.js";
import { lastNDays, sumSeries, dayKey } from "../shared/stats.js";
import { renderStatsChart } from "./stats-chart.js";
import { createProfile, pickActiveProfile } from "../shared/profiles.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE, MAX_PROFILES } from "../shared/constants.js";

const TOUR_STEPS = [
  { selector: ".switch", text: "Master switch — pause or resume the whole extension instantly." },
  { selector: ".profile-tabs", text: "Profiles — up to 3, each with its own intent and active hours. Add one for each mode you switch between during the day." },
  { selector: "#intent", text: "Show me — describe what you want to see, in your own words." },
  {
    selector: "#avoid",
    text: 'Avoid — describe what you\'d rather not see here, not in "Show me" above.',
  },
  { selector: "#include-chips", text: "Always show — exact keywords that force a video to show, no matter the score." },
  { selector: "#exclude-chips", text: "Always hide — exact keywords that force a video to hide, no matter the score." },
  { selector: ".toggle-label", text: "Active hours — optionally only use this profile during set hours. Off by default." },
  { selector: "#hardcore-row", text: "Hardcore mode — hides the filtered-videos list so nothing can be unhidden. Per profile, and only changeable here — not from the popup." },
];

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
const intentCounterEl = document.getElementById("intent-counter");
const avoidCounterEl = document.getElementById("avoid-counter");
const hardcoreEl = document.getElementById("hardcore-mode");
const extensionEnabledEl = document.getElementById("extension-enabled");
const profileTabsEl = document.getElementById("profile-tabs");
const addProfileBtn = document.getElementById("add-profile-btn");
const deleteProfileBtn = document.getElementById("delete-profile-btn");

// Stable, modern accent per profile slot (up to MAX_PROFILES = 3).
const PROFILE_COLORS = ["#6366f1", "#ec4899", "#10b981"];
const scheduleEnabledEl = document.getElementById("schedule-enabled");
const scheduleRowsEl = document.getElementById("schedule-rows");
const weekdayStartEl = document.getElementById("weekday-start");
const weekdayEndEl = document.getElementById("weekday-end");
const weekendStartEl = document.getElementById("weekend-start");
const weekendEndEl = document.getElementById("weekend-end");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

let profiles = [];
let currentProfileId = null;

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

function updateCounter(el, counterEl) {
  counterEl.textContent = `${el.maxLength - el.value.length} characters left`;
}

intentEl.addEventListener("input", () => updateCounter(intentEl, intentCounterEl));
avoidEl.addEventListener("input", () => updateCounter(avoidEl, avoidCounterEl));

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
  hardcoreEl.checked = !!profile.hardcoreMode;
}

async function commitProfileRename(profile, input, item) {
  const name = input.value.trim();
  item.classList.remove("editing");
  if (!name || name === profile.name) {
    renderProfileTabs();
    return;
  }
  const updated = await updateProfileFields(profile.id, { name });
  profiles = profiles.map((p) => (p.id === profile.id ? updated : p));
  renderProfileTabs();
  setStatus("Renamed.");
}

function renderProfileTabs() {
  const active = pickActiveProfile(profiles);
  profileTabsEl.innerHTML = "";
  profiles.forEach((profile, index) => {
    const color = PROFILE_COLORS[index % PROFILE_COLORS.length];
    const isCurrent = profile.id === currentProfileId;

    const item = document.createElement("div");
    item.className = "profile-tab-item" + (isCurrent ? " active" : "");
    item.style.setProperty("--profile-color", color);

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "profile-tab" + (isCurrent ? " active" : "");
    if (active && active.id === profile.id) {
      const dot = document.createElement("span");
      dot.className = "profile-tab-dot";
      dot.title = "Active right now";
      tab.appendChild(dot);
    }
    const nameSpan = document.createElement("span");
    nameSpan.className = "profile-tab-name";
    nameSpan.textContent = profile.name;
    tab.appendChild(nameSpan);
    tab.addEventListener("click", () => {
      currentProfileId = profile.id;
      renderProfileTabs();
      loadProfileIntoForm(currentProfile());
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "profile-edit-btn";
    editBtn.title = "Rename profile";
    editBtn.setAttribute("aria-label", `Rename ${profile.name}`);
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      currentProfileId = profile.id;
      item.classList.add("editing");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "profile-name-input";
      input.value = profile.name;
      input.maxLength = 40;
      item.replaceChildren(input);
      input.focus();
      input.select();

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        commitProfileRename(profile, input, item);
      };
      input.addEventListener("blur", finish);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          done = true;
          renderProfileTabs();
        }
      });
    });

    item.append(tab, editBtn);
    profileTabsEl.appendChild(item);
  });
  addProfileBtn.disabled = profiles.length >= MAX_PROFILES;
  deleteProfileBtn.disabled = profiles.length <= 1;
}

// Creating, renaming, and deleting touch no vectors, so these go straight
// to storage (shared/storage.js) instead of round-tripping through the
// background service worker — that hop only exists to reach the offscreen
// model, which none of these three need.
addProfileBtn.addEventListener("click", async () => {
  if (profiles.length >= MAX_PROFILES) return;
  const newProfile = createProfile(`Profile ${profiles.length + 1}`);
  await setProfiles([...profiles, newProfile]);
  profiles = [...profiles, newProfile];
  currentProfileId = newProfile.id;
  renderProfileTabs();
  loadProfileIntoForm(currentProfile());
  setStatus("Profile added.");
  intentEl.focus();
});

deleteProfileBtn.addEventListener("click", async () => {
  const profile = currentProfile();
  if (!profile || profiles.length <= 1) return;
  if (!confirm(`Delete "${profile.name}"? This can't be undone.`)) return;
  profiles = await deleteProfile(profile.id);
  currentProfileId = profiles[0].id;
  renderProfileTabs();
  loadProfileIntoForm(currentProfile());
  setStatus("Deleted.");
});

async function load() {
  const settings = await getSettings();
  extensionEnabledEl.checked = settings[STORAGE_KEYS.EXTENSION_ENABLED] !== false;

  profiles = await getProfiles();
  const active = pickActiveProfile(profiles);
  currentProfileId = (active || profiles[0]).id;
  renderProfileTabs();
  loadProfileIntoForm(currentProfile());

  // First install opens this page (service worker onInstalled) — start the
  // tour right away. Finishing or skipping it marks it seen, so it runs once.
  if (!settings[STORAGE_KEYS.TOUR_SEEN]) runTour();
}

// Keyword / schedule edits are cheap: persist straight to storage
// (shared/storage.js) so open YouTube tabs restyle instantly via
// chrome.storage.onChanged — no re-embedding, so no need for the
// background round trip either.
let liveDebounce = null;
function scheduleLiveSave() {
  clearTimeout(liveDebounce);
  liveDebounce = setTimeout(async () => {
    const profile = currentProfile();
    if (!profile) return;
    const updated = await updateProfileFields(profile.id, {
      includeKeywords: includeChips.getChips(),
      excludeKeywords: excludeChips.getChips(),
      schedule: readSchedule(),
      scheduleEnabled: scheduleEnabledEl.checked,
    });
    profiles = profiles.map((p) => (p.id === profile.id ? updated : p));
    renderProfileTabs();
  }, 200);
}

// Applies instantly, no Save click needed — this is a kill switch, not a
// tunable that benefits from a review-before-commit step.
extensionEnabledEl.addEventListener("change", () => {
  setSettings({ [STORAGE_KEYS.EXTENSION_ENABLED]: extensionEnabledEl.checked });
});

// Applies instantly, like the kill switch — open YouTube tabs pick it up
// through chrome.storage.onChanged.
hardcoreEl.addEventListener("change", async () => {
  const profile = currentProfile();
  if (!profile) return;
  const updated = await updateProfileFields(profile.id, { hardcoreMode: hardcoreEl.checked });
  profiles = profiles.map((p) => (p.id === profile.id ? updated : p));
  setStatus(hardcoreEl.checked ? "Hardcore mode on." : "Hardcore mode off.");
});

scheduleEnabledEl.addEventListener("change", () => {
  syncScheduleRowsVisibility();
  scheduleLiveSave();
});
for (const el of [weekdayStartEl, weekdayEndEl, weekendStartEl, weekendEndEl]) {
  el.addEventListener("input", scheduleLiveSave);
}

saveBtn.addEventListener("click", async () => {
  const profile = currentProfile();
  if (!profile) return;
  saveBtn.disabled = true;
  setStatus("Saving…");
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
      profiles = profiles.map((p) => (p.id === profile.id ? response.profile : p));
      renderProfileTabs();
      setStatus("Saved.");
    } else {
      setStatus(`Error: ${(response && response.error) || "unknown"}`);
    }
  } finally {
    saveBtn.disabled = false;
  }
});

// ---- Progress (stats) ----
const RANGE_KEY = "yif_stats_range";
let statsRange = 14;
try {
  const saved = Number(localStorage.getItem(RANGE_KEY));
  if ([7, 14, 30].includes(saved)) statsRange = saved;
} catch {
  // localStorage can throw when site data is blocked; default range is fine.
}

async function renderStats() {
  const stats = await getStats();
  const today = stats[dayKey()] || {};
  const series = lastNDays(stats, statsRange);
  const totals = sumSeries(series);
  document.getElementById("stat-filtered-today").textContent = today.filtered || 0;
  document.getElementById("stat-unhidden-today").textContent = today.unhides || 0;
  document.getElementById("stat-filtered-range").textContent = totals.filtered;
  document.getElementById("stat-unhidden-range").textContent = totals.unhides;
  document.getElementById("stat-filtered-range-label").textContent = `Filtered (${statsRange} days)`;
  document.getElementById("stat-unhidden-range-label").textContent = `Unhidden (${statsRange} days)`;
  document.getElementById("stats-empty").hidden = totals.filtered + totals.unhides > 0;
  renderStatsChart(document.getElementById("stats-chart"), series);
  renderHardcoreProgress(series, totals);
}

// Shown once hardcore is (or was) in use: when any profile has it on, or
// there are pauses in the selected range from a profile that later turned it off.
async function renderHardcoreProgress(series, totals) {
  const profiles = await getProfiles();
  const used = profiles.some((p) => p.hardcoreMode) || totals.hardcoreOffs > 0;
  document.getElementById("hardcore-progress").hidden = !used;
  if (!used) return;
  document.getElementById("stat-hardcore-offs").textContent = totals.hardcoreOffs;
  document.getElementById("stat-hardcore-minutes").textContent = totals.hardcoreOffMinutes;
  document.getElementById("stat-hardcore-offs-label").textContent = `Times switched off (${statsRange} days)`;
  document.getElementById("stat-hardcore-minutes-label").textContent = `Minutes off (${statsRange} days)`;
  document.getElementById("hardcore-empty").hidden = totals.hardcoreOffs > 0;
  renderStatsChart(document.getElementById("hardcore-chart"), series, {
    bars: [{ key: "hardcoreOffMinutes", cls: "chart-bar-hardcore" }],
    ariaLabel: "Minutes hardcore mode was switched off per day",
    tooltip: (day) =>
      `${day.date}: ${day.hardcoreOffMinutes} min off · switched off ${day.hardcoreOffs} time${day.hardcoreOffs === 1 ? "" : "s"}`,
  });
}

for (const btn of document.querySelectorAll("#range-toggle button")) {
  btn.addEventListener("click", () => {
    statsRange = Number(btn.dataset.days);
    try {
      localStorage.setItem(RANGE_KEY, String(statsRange));
    } catch {
      // Non-fatal: the choice just won't persist.
    }
    for (const b of document.querySelectorAll("#range-toggle button")) {
      b.classList.toggle("active", b === btn);
    }
    renderStats();
  });
  btn.classList.toggle("active", Number(btn.dataset.days) === statsRange);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // PROFILES too: toggling hardcore mode shows/hides its progress chart.
  if (STORAGE_KEYS.STATS in changes || STORAGE_KEYS.PROFILES in changes) renderStats();
});

renderStats();
load();
