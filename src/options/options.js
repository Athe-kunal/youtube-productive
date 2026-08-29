import { MSG, sendToBackground } from "../shared/messaging.js";
import { createChipInput } from "../shared/chip-input.js";
import { startTour } from "../shared/tour.js";
import { getSettings, setSettings, getProfiles, setProfiles, updateProfileFields, deleteProfile } from "../shared/storage.js";
import { createProfile, pickActiveProfile } from "../shared/profiles.js";
import { STORAGE_KEYS, DEFAULT_SCHEDULE, MAX_PROFILES } from "../shared/constants.js";
// Model tier switching is disabled for now (see commented-out block below
// and in options.html) — re-add DEFAULT_MODEL_TIER, MODEL_TIERS to the
// import above when re-enabling it.

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
];

const intentEl = document.getElementById("intent");
const avoidEl = document.getElementById("avoid");
const intentCounterEl = document.getElementById("intent-counter");
const avoidCounterEl = document.getElementById("avoid-counter");
// const modelTierEl = document.getElementById("model-tier");
// const modelTierStatusEl = document.getElementById("model-tier-status");
const extensionEnabledEl = document.getElementById("extension-enabled");
const welcomeBannerEl = document.getElementById("welcome-banner");
const welcomeStartEl = document.getElementById("welcome-start");
const welcomeSkipEl = document.getElementById("welcome-skip");
const profileTabsEl = document.getElementById("profile-tabs");
const addProfileBtn = document.getElementById("add-profile-btn");
const renameProfileBtn = document.getElementById("rename-profile-btn");
const deleteProfileBtn = document.getElementById("delete-profile-btn");
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

welcomeStartEl.addEventListener("click", () => {
  welcomeBannerEl.hidden = true;
  runTour();
});
welcomeSkipEl.addEventListener("click", () => {
  welcomeBannerEl.hidden = true;
  setSettings({ [STORAGE_KEYS.TOUR_SEEN]: true });
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
}

function renderProfileTabs() {
  const active = pickActiveProfile(profiles);
  profileTabsEl.innerHTML = "";
  for (const profile of profiles) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "profile-tab" + (profile.id === currentProfileId ? " active" : "");
    if (active && active.id === profile.id) {
      const dot = document.createElement("span");
      dot.className = "profile-tab-dot";
      dot.title = "Active right now";
      tab.appendChild(dot);
    }
    tab.appendChild(document.createTextNode(profile.name));
    tab.addEventListener("click", () => {
      currentProfileId = profile.id;
      renderProfileTabs();
      loadProfileIntoForm(currentProfile());
    });
    profileTabsEl.appendChild(tab);
  }
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

renameProfileBtn.addEventListener("click", async () => {
  const profile = currentProfile();
  if (!profile) return;
  const name = prompt("Profile name", profile.name);
  if (!name || !name.trim() || name.trim() === profile.name) return;
  const updated = await updateProfileFields(profile.id, { name: name.trim() });
  profiles = profiles.map((p) => (p.id === profile.id ? updated : p));
  renderProfileTabs();
  setStatus("Renamed.");
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

// let currentTier = DEFAULT_MODEL_TIER;
//
// function tierFromCheckbox(checked) {
//   return checked ? "large" : "small";
// }

async function load() {
  const settings = await getSettings();
  extensionEnabledEl.checked = settings[STORAGE_KEYS.EXTENSION_ENABLED] !== false;
  // currentTier = settings[STORAGE_KEYS.MODEL_TIER] || DEFAULT_MODEL_TIER;
  // modelTierEl.checked = currentTier === "large";

  profiles = await getProfiles();
  const active = pickActiveProfile(profiles);
  currentProfileId = (active || profiles[0]).id;
  renderProfileTabs();
  loadProfileIntoForm(currentProfile());

  if (!settings[STORAGE_KEYS.TOUR_SEEN]) {
    // Show a one-line "what is this" welcome first — jumping straight into
    // the spotlight tour on a page the user has never seen is disorienting.
    welcomeBannerEl.hidden = false;
  }
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

load();
