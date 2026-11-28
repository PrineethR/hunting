import {
  compressImageForUpload,
  createThumbnailDataUrl,
  renderKeepsakeStripPng
} from "./keepsake.js";

const KEY_STORAGE = "angana_gemini_key_v1";
const SESSION_KEY = "angana_courtyard_session_v1";
const PHOTOS_KEY = "angana_courtyard_photos_v1";
const HUNT_PATH = "./hunts/angana-courtyard.json";
const MODEL_NAME = "gemini-2.5-flash";

const state = {
  hunt: null,
  apiKey: "",
  session: null,
  photo: null,
  verifiedHold: null,
  feedbackText: null,
  shots: [],
  checking: false
};

const els = {
  globalAlert: document.getElementById("global-alert"),
  globalAlertText: document.getElementById("global-alert-text"),
  screenLoading: document.getElementById("screen-loading"),
  screenWelcome: document.getElementById("screen-welcome"),
  screenActive: document.getElementById("screen-active"),
  screenCompleted: document.getElementById("screen-completed"),
  welcomeTitle: document.getElementById("welcome-title"),
  welcomeCopy: document.getElementById("welcome-copy"),
  keySetupBox: document.getElementById("key-setup-box"),
  apiKeyInput: document.getElementById("api-key-input"),
  startForm: document.getElementById("start-form"),
  playerNameInput: document.getElementById("player-name-input"),
  startSubmitBtn: document.getElementById("start-submit-btn"),
  stepDots: document.getElementById("step-dots"),
  stopCounter: document.getElementById("stop-counter"),
  resetBtn: document.getElementById("reset-run-btn"),
  stopHeading: document.getElementById("stop-heading"),
  stopNarrative: document.getElementById("stop-narrative"),
  clueImageWrap: document.getElementById("clue-image-wrap"),
  clueImage: document.getElementById("clue-image"),
  clueImageCaption: document.getElementById("clue-image-caption"),
  stopRiddle: document.getElementById("stop-riddle"),
  actionTwistBox: document.getElementById("action-twist-box"),
  actionTwistText: document.getElementById("action-twist-text"),
  nudgeBtn: document.getElementById("nudge-btn"),
  hintCollapse: document.getElementById("hint-collapse"),
  hintText: document.getElementById("hint-text"),
  captureControls: document.getElementById("capture-controls"),
  cameraInput: document.getElementById("camera-input"),
  libraryInput: document.getElementById("library-input"),
  takePhotoBtn: document.getElementById("take-photo-btn"),
  libraryPhotoBtn: document.getElementById("library-photo-btn"),
  previewCard: document.getElementById("preview-card"),
  polaroidFrame: document.getElementById("polaroid-frame"),
  previewImg: document.getElementById("preview-img"),
  checkingVeil: document.getElementById("checking-veil"),
  clearPhotoBtn: document.getElementById("clear-photo-btn"),
  verifyPhotoBtn: document.getElementById("verify-photo-btn"),
  feedbackBanner: document.getElementById("feedback-banner"),
  feedbackText: document.getElementById("feedback-text"),
  verifiedBanner: document.getElementById("verified-banner"),
  verifiedFeedback: document.getElementById("verified-feedback"),
  verifiedSuccessNote: document.getElementById("verified-success-note"),
  propRevealBox: document.getElementById("prop-reveal-box"),
  propRevealText: document.getElementById("prop-reveal-text"),
  interludeCard: document.getElementById("interlude-card"),
  interludeTitle: document.getElementById("interlude-title"),
  interludeText: document.getElementById("interlude-text"),
  nextStopBtn: document.getElementById("next-stop-btn"),
  finaleTitle: document.getElementById("finale-title"),
  finaleStory: document.getElementById("finale-story"),
  finisherName: document.getElementById("finisher-name"),
  sleuthBadge: document.getElementById("sleuth-badge"),
  prizeInstructions: document.getElementById("prize-instructions"),
  elapsedTime: document.getElementById("elapsed-time"),
  completedAt: document.getElementById("completed-at"),
  keepsakePanel: document.getElementById("keepsake-panel"),
  keepsakeGrid: document.getElementById("keepsake-grid"),
  downloadStripBtn: document.getElementById("download-strip-btn"),
  playAgainBtn: document.getElementById("play-again-btn")
};

function showGlobalError(msg) {
  if (!msg) {
    els.globalAlert.classList.add("hidden");
    return;
  }
  els.globalAlertText.textContent = msg;
  els.globalAlert.classList.remove("hidden");
}

function showScreen(name) {
  els.screenLoading.classList.toggle("hidden", name !== "loading");
  els.screenWelcome.classList.toggle("hidden", name !== "welcome");
  els.screenActive.classList.toggle("hidden", name !== "active");
  els.screenCompleted.classList.toggle("hidden", name !== "completed");
}

function captureApiKeyFromUrl() {
  let foundKey = "";
  const hash = window.location.hash || "";
  if (hash.startsWith("#")) {
    const hashParams = new URLSearchParams(hash.slice(1));
    const hk = hashParams.get("k")?.trim();
    if (hk) {
      foundKey = hk;
      hashParams.delete("k");
      const nextHash = hashParams.toString();
      const cleanUrl =
        window.location.pathname +
        window.location.search +
        (nextHash ? `#${nextHash}` : "");
      window.history.replaceState(null, "", cleanUrl);
    }
  }

  if (!foundKey) {
    const queryParams = new URLSearchParams(window.location.search);
    const qk = queryParams.get("k")?.trim();
    if (qk) {
      foundKey = qk;
      queryParams.delete("k");
      const nextSearch = queryParams.toString();
      const cleanUrl =
        window.location.pathname +
        (nextSearch ? `?${nextSearch}` : "") +
        window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    }
  }

  if (foundKey) {
    window.localStorage.setItem(KEY_STORAGE, foundKey);
  }
  state.apiKey = window.localStorage.getItem(KEY_STORAGE) || "";
}

function saveSession() {
  if (!state.session) return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
}

function loadSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadShots() {
  try {
    const raw = window.localStorage.getItem(PHOTOS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveShots(shots) {
  try {
    window.localStorage.setItem(PHOTOS_KEY, JSON.stringify(shots));
  } catch {
    // Ignore storage quota errors
  }
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins === 0 ? `${secs}s` : `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function formatClock(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function renderWelcome() {
  const h = state.hunt;
  els.welcomeTitle.textContent = h.title;
  els.welcomeCopy.textContent = h.welcomeCopy;

  const needsKey = !state.apiKey;
  els.keySetupBox.classList.toggle("hidden", !needsKey);
  els.apiKeyInput.required = needsKey;

  showScreen("welcome");
}

function renderStepDots(total, currentIndex) {
  els.stepDots.innerHTML = "";
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement("span");
    dot.className = "step-dot";
    if (i < currentIndex || (i === currentIndex && state.verifiedHold)) {
      dot.dataset.state = "done";
    } else if (i === currentIndex) {
      dot.dataset.state = "current";
    } else {
      dot.dataset.state = "upcoming";
    }
    els.stepDots.appendChild(dot);
  }
}

function renderActiveStop() {
  const h = state.hunt;
  const s = state.session;
  const stop = h.stops[s.currentStopIndex];
  const total = h.stops.length;

  renderStepDots(total, s.currentStopIndex);
  els.stopCounter.textContent = `${s.currentStopIndex + 1} / ${total}`;

  els.stopHeading.textContent = stop.locationLabel;
  els.stopNarrative.textContent = stop.narrative;
  els.stopRiddle.textContent = `“${stop.riddle}”`;

  if (stop.clueImage) {
    els.clueImage.src = stop.clueImage;
    els.clueImage.alt = stop.clueImageCaption || "Visual clue";
    els.clueImageCaption.textContent = stop.clueImageCaption || "";
    els.clueImageCaption.classList.toggle("hidden", !stop.clueImageCaption);
    els.clueImageWrap.classList.remove("hidden");
  } else {
    els.clueImageWrap.classList.add("hidden");
  }

  if (stop.actionPrompt) {
    els.actionTwistText.textContent = stop.actionPrompt;
    els.actionTwistBox.classList.remove("hidden");
  } else {
    els.actionTwistBox.classList.add("hidden");
  }

  const hintUnlocked =
    (s.unlockedHintStopIds || []).includes(stop.id) ||
    (s.attemptsOnCurrentStop || 0) >= 2;
  const nudgesRemaining = Math.max(0, h.maxNudges - (s.nudgesUsed || 0));

  els.hintText.textContent = stop.nudgeHint;
  els.hintCollapse.classList.toggle("is-open", hintUnlocked);
  els.hintCollapse.setAttribute("aria-hidden", String(!hintUnlocked));
  els.nudgeBtn.classList.toggle(
    "hidden",
    hintUnlocked || Boolean(state.verifiedHold) || nudgesRemaining <= 0
  );

  if (state.verifiedHold) {
    els.captureControls.classList.add("hidden");
    els.previewCard.classList.add("hidden");
    els.verifiedBanner.classList.remove("hidden");
    els.verifiedFeedback.textContent = state.verifiedHold.feedback;
    els.verifiedSuccessNote.textContent = state.verifiedHold.successNote;

    const burst = els.verifiedBanner.querySelector(".petal-burst");
    if (burst) {
      burst.classList.remove("is-bursting");
      void burst.offsetWidth;
      burst.classList.add("is-bursting");
    }

    if (state.verifiedHold.propRevealNote) {
      els.propRevealText.textContent = state.verifiedHold.propRevealNote;
      els.propRevealBox.classList.remove("hidden");
    } else {
      els.propRevealBox.classList.add("hidden");
    }

    if (state.verifiedHold.interlude) {
      els.interludeTitle.textContent = state.verifiedHold.interlude.title;
      els.interludeText.textContent = state.verifiedHold.interlude.text;
      els.interludeCard.classList.remove("hidden");
    } else {
      els.interludeCard.classList.add("hidden");
    }

    const isLast = s.currentStopIndex + 1 >= total;
    els.nextStopBtn.textContent = isLast ? "Finish trail" : "Next clue";
  } else {
    els.verifiedBanner.classList.add("hidden");
    els.captureControls.classList.toggle("hidden", Boolean(state.photo));
    els.takePhotoBtn.disabled = state.checking;
    els.libraryPhotoBtn.disabled = state.checking;

    if (state.photo) {
      els.previewImg.src = state.photo.previewUrl;
      els.checkingVeil.classList.toggle("hidden", !state.checking);
      els.clearPhotoBtn.disabled = state.checking;
      els.verifyPhotoBtn.disabled = state.checking;
      els.previewCard.classList.remove("hidden");
    } else {
      els.previewCard.classList.add("hidden");
    }

    if (state.feedbackText) {
      els.feedbackText.textContent = state.feedbackText;
      els.feedbackBanner.classList.remove("hidden");
    } else {
      els.feedbackBanner.classList.add("hidden");
    }
  }

  showScreen("active");
}

function triggerWrongWiggle() {
  els.polaroidFrame.classList.remove("is-wrong");
  void els.polaroidFrame.offsetWidth;
  els.polaroidFrame.classList.add("is-wrong");
}

function renderCompleted() {
  const h = state.hunt;
  const s = state.session;
  const pureSleuth = (s.nudgesUsed || 0) === 0;

  els.finaleTitle.textContent = h.finaleTitle;
  els.finaleStory.textContent = h.finaleStory;
  els.finisherName.textContent = s.playerName;
  els.sleuthBadge.classList.toggle("hidden", !pureSleuth);
  els.prizeInstructions.textContent = h.prizeInstructions;

  const elapsedMs = Math.max(
    0,
    Date.parse(s.finishedAt || new Date().toISOString()) -
      Date.parse(s.startedAt)
  );
  els.elapsedTime.textContent = formatDuration(elapsedMs);
  els.completedAt.textContent = formatClock(
    s.finishedAt || new Date().toISOString()
  );

  if (state.shots.length > 0) {
    els.keepsakeGrid.innerHTML = "";
    for (const shot of state.shots) {
      const card = document.createElement("div");
      card.className = "keepsake-polaroid";
      card.innerHTML = `<img src="${shot.dataUrl}" alt="${shot.locationLabel}" /><div class="keepsake-polaroid-label">${shot.locationLabel}</div>`;
      els.keepsakeGrid.appendChild(card);
    }
    els.keepsakePanel.classList.remove("hidden");
  } else {
    els.keepsakePanel.classList.add("hidden");
  }

  showScreen("completed");
}

function buildGeminiPrompt(stop, attemptNumber) {
  const h = state.hunt;
  return [
    h.hostPersona,
    `Venue: "${h.venueName}" in ${h.city}.`,
    `The guest is currently on "${stop.chapterTitle}: ${stop.locationLabel}".`,
    `Riddle shown to guest: "${stop.riddle}"`,
    stop.actionPrompt
      ? `Extra Photo Twist required in frame: "${stop.actionPrompt}"`
      : null,
    ``,
    `TARGET TO VERIFY:`,
    `- Primary target: ${stop.verification.targetDescription}`,
    `- Accept generously: ${stop.verification.acceptNotes}`,
    stop.verification.rejectNotes
      ? `- Reject if: ${stop.verification.rejectNotes}`
      : null,
    ``,
    `JUDGING RULES:`,
    `1. Real wedding phone photos often have warm evening lighting, motion blur, or unusual angles—be generous when the target object or landmark is genuinely present.`,
    stop.actionPrompt
      ? `2. Check BOTH the target object/spot AND the requested Photo Twist ("${stop.actionPrompt}"). If they clearly found the right object/spot but forgot the action/gesture/composition, set matched=false and give cheerful partial-credit praise without spoiling anything else.`
      : `2. Confirm the target object or spot is clearly visible in their photo.`,
    `3. Do NOT pass pitch-black frames, unrelated objects, or obvious photos of another screen unless the target itself is genuinely present.`,
    `4. Current attempt number: ${attemptNumber}.${attemptNumber >= 3 ? " (Attempt 3+: be extra forgiving on dim light or slight framing quirks.)" : ""}`,
    `5. Keep "feedback" to 1-2 short, warm, witty sentences in character.`
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGeminiVision(stop, photo, attemptNumber) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildGeminiPrompt(stop, attemptNumber) },
          {
            inlineData: {
              mimeType: photo.mimeType,
              data: photo.base64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          matched: { type: "BOOLEAN" },
          confidence: { type: "NUMBER" },
          observed: { type: "STRING" },
          feedback: { type: "STRING" }
        },
        required: ["matched", "confidence", "observed", "feedback"]
      }
    }
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `API returned ${res.status}`);
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = JSON.parse(rawText);
  const baseThreshold = stop.verification.minConfidence ?? 0.65;
  const threshold =
    attemptNumber >= 3 ? Math.max(0.55, baseThreshold - 0.08) : baseThreshold;
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

  return {
    matched: Boolean(parsed.matched) && confidence >= threshold,
    confidence,
    feedback: String(parsed.feedback || "").trim()
  };
}

async function initHunt() {
  showGlobalError(null);
  showScreen("loading");

  try {
    const res = await fetch(HUNT_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load trail.");

    state.hunt = await res.json();
    state.shots = loadShots();
    state.session = loadSession();

    if (state.session) {
      if (
        state.session.finishedAt ||
        state.session.currentStopIndex >= state.hunt.stops.length
      ) {
        renderCompleted();
      } else {
        renderActiveStop();
      }
    } else {
      renderWelcome();
    }
  } catch (err) {
    showGlobalError(err instanceof Error ? err.message : "Failed to load trail.");
    showScreen("welcome");
  }
}

function resetRun() {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(PHOTOS_KEY);
  state.session = null;
  state.shots = [];
  state.photo = null;
  state.verifiedHold = null;
  state.feedbackText = null;
  renderWelcome();
}

// Event bindings
els.startForm.addEventListener("submit", (e) => {
  e.preventDefault();
  showGlobalError(null);

  if (!state.apiKey) {
    const entered = els.apiKeyInput.value.trim();
    if (!entered) {
      showGlobalError("Paste your passcode key once to begin.");
      return;
    }
    window.localStorage.setItem(KEY_STORAGE, entered);
    state.apiKey = entered;
  }

  const name = els.playerNameInput.value.trim().replace(/\s+/g, " ").slice(0, 48);
  if (name.length < 2) {
    showGlobalError("Enter your name (at least 2 characters).");
    return;
  }

  state.session = {
    playerName: name,
    startedAt: new Date().toISOString(),
    currentStopIndex: 0,
    attemptsOnCurrentStop: 0,
    nudgesUsed: 0,
    unlockedHintStopIds: []
  };
  state.shots = [];
  window.localStorage.removeItem(PHOTOS_KEY);
  saveSession();
  renderActiveStop();
});

els.takePhotoBtn.addEventListener("click", () => els.cameraInput.click());
els.libraryPhotoBtn.addEventListener("click", () => els.libraryInput.click());

async function onFileSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  showGlobalError(null);
  state.feedbackText = null;

  try {
    state.photo = await compressImageForUpload(file, 1024, 0.82);
  } catch (err) {
    showGlobalError(
      err instanceof Error ? err.message : "Could not read selected image."
    );
  }
  renderActiveStop();
}

els.cameraInput.addEventListener("change", onFileSelected);
els.libraryInput.addEventListener("change", onFileSelected);

els.clearPhotoBtn.addEventListener("click", () => {
  state.photo = null;
  state.feedbackText = null;
  renderActiveStop();
});

els.nudgeBtn.addEventListener("click", () => {
  const stop = state.hunt.stops[state.session.currentStopIndex];
  if ((state.session.nudgesUsed || 0) >= state.hunt.maxNudges) return;

  if (!state.session.unlockedHintStopIds.includes(stop.id)) {
    state.session.unlockedHintStopIds.push(stop.id);
    state.session.nudgesUsed = (state.session.nudgesUsed || 0) + 1;
    saveSession();
  }
  renderActiveStop();
});

els.verifyPhotoBtn.addEventListener("click", async () => {
  if (!state.photo) return;
  const stop = state.hunt.stops[state.session.currentStopIndex];
  const attemptNumber = (state.session.attemptsOnCurrentStop || 0) + 1;

  state.checking = true;
  state.feedbackText = null;
  showGlobalError(null);
  renderActiveStop();

  try {
    const verdict = await callGeminiVision(stop, state.photo, attemptNumber);

    if (!verdict.matched) {
      state.session.attemptsOnCurrentStop = attemptNumber;
      saveSession();
      state.feedbackText =
        verdict.feedback ||
        "Not quite that spot yet—try another angle.";
      state.checking = false;
      renderActiveStop();
      triggerWrongWiggle();
      return;
    }

    try {
      const thumbUrl = await createThumbnailDataUrl(state.photo.previewUrl);
      state.shots = [
        ...state.shots.filter((x) => x.stopId !== stop.id),
        {
          stopId: stop.id,
          chapterTitle: stop.chapterTitle,
          locationLabel: stop.locationLabel,
          dataUrl: thumbUrl
        }
      ];
      saveShots(state.shots);
    } catch {
      // Non-blocking
    }

    const nextIdx = state.session.currentStopIndex + 1;
    if (nextIdx >= state.hunt.stops.length) {
      state.session.currentStopIndex = nextIdx;
      state.session.attemptsOnCurrentStop = 0;
      state.session.finishedAt = new Date().toISOString();
      saveSession();
      state.photo = null;
      state.checking = false;
      renderCompleted();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    state.verifiedHold = {
      feedback: verdict.feedback,
      successNote: stop.successNote,
      propRevealNote: stop.propRevealNote || null,
      interlude: stop.interlude || null
    };
    state.checking = false;
    renderActiveStop();
  } catch (err) {
    state.checking = false;
    state.feedbackText =
      err instanceof Error
        ? err.message
        : "Could not check right now—try again.";
    renderActiveStop();
  }
});

els.nextStopBtn.addEventListener("click", () => {
  state.session.currentStopIndex += 1;
  state.session.attemptsOnCurrentStop = 0;
  saveSession();
  state.verifiedHold = null;
  state.photo = null;
  state.feedbackText = null;
  renderActiveStop();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

els.resetBtn.addEventListener("click", resetRun);
els.playAgainBtn.addEventListener("click", resetRun);

els.downloadStripBtn.addEventListener("click", async () => {
  if (!state.shots.length) return;
  els.downloadStripBtn.disabled = true;
  els.downloadStripBtn.textContent = "Preparing strip...";
  try {
    const pngUrl = await renderKeepsakeStripPng({
      title: state.hunt.title,
      venueName: state.hunt.venueName,
      city: state.hunt.city,
      playerName: state.session.playerName,
      pureSleuth: (state.session.nudgesUsed || 0) === 0,
      shots: state.shots
    });
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = "courtyard-keepsake.png";
    link.click();
  } catch {
    showGlobalError("Could not generate keepsake strip.");
  } finally {
    els.downloadStripBtn.disabled = false;
    els.downloadStripBtn.textContent = "Save photo strip";
  }
});

// Boot
captureApiKeyFromUrl();
void initHunt();
