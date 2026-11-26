import {
  compressImageForUpload,
  createThumbnailDataUrl,
  renderKeepsakeStripPng
} from "./keepsake.js";

const KEY_STORAGE = "angana_gemini_key_v1";
const SESSION_PREFIX = "angana_static_session_v1:";
const PHOTOS_PREFIX = "angana_static_photos_v1:";
const MODEL_NAME = "gemini-2.5-flash";

const PACKS = [
  { id: "home-test", label: "Home Rehearsal Trail", stopsCount: 6 },
  { id: "angana-courtyard", label: "Courtyard Trails at Angana", stopsCount: 7 }
];

const state = {
  hunt: null,
  huntId: "home-test",
  apiKey: "",
  session: null,
  photo: null,
  verifiedHold: null,
  feedback: null,
  shots: [],
  busyText: null
};

const els = {
  venueBrand: document.getElementById("venue-brand"),
  resetBtn: document.getElementById("reset-run-btn"),
  packSwitcher: document.getElementById("pack-switcher"),
  globalAlert: document.getElementById("global-alert"),
  globalAlertText: document.getElementById("global-alert-text"),
  screenLoading: document.getElementById("screen-loading"),
  screenWelcome: document.getElementById("screen-welcome"),
  screenActive: document.getElementById("screen-active"),
  screenCompleted: document.getElementById("screen-completed"),
  welcomeTitle: document.getElementById("welcome-title"),
  welcomeCopy: document.getElementById("welcome-copy"),
  ledgerStops: document.getElementById("ledger-stops"),
  ledgerGifts: document.getElementById("ledger-gifts"),
  keySetupBox: document.getElementById("key-setup-box"),
  keySavedRow: document.getElementById("key-saved-row"),
  apiKeyInput: document.getElementById("api-key-input"),
  clearKeyBtn: document.getElementById("clear-key-btn"),
  startForm: document.getElementById("start-form"),
  playerNameInput: document.getElementById("player-name-input"),
  startSubmitBtn: document.getElementById("start-submit-btn"),
  stopCounter: document.getElementById("stop-counter"),
  giftsBadge: document.getElementById("gifts-badge"),
  progressFill: document.getElementById("progress-fill"),
  stopHeading: document.getElementById("stop-heading"),
  stopNarrative: document.getElementById("stop-narrative"),
  clueImageWrap: document.getElementById("clue-image-wrap"),
  clueImage: document.getElementById("clue-image"),
  clueImageCaption: document.getElementById("clue-image-caption"),
  stopRiddle: document.getElementById("stop-riddle"),
  actionTwistBox: document.getElementById("action-twist-box"),
  actionTwistText: document.getElementById("action-twist-text"),
  hintBox: document.getElementById("hint-box"),
  hintText: document.getElementById("hint-text"),
  nudgeRow: document.getElementById("nudge-row"),
  nudgeBtn: document.getElementById("nudge-btn"),
  captureControls: document.getElementById("capture-controls"),
  cameraInput: document.getElementById("camera-input"),
  libraryInput: document.getElementById("library-input"),
  takePhotoBtn: document.getElementById("take-photo-btn"),
  libraryPhotoBtn: document.getElementById("library-photo-btn"),
  previewCard: document.getElementById("preview-card"),
  previewImg: document.getElementById("preview-img"),
  previewMeta: document.getElementById("preview-meta"),
  clearPhotoBtn: document.getElementById("clear-photo-btn"),
  verifyPhotoBtn: document.getElementById("verify-photo-btn"),
  feedbackBanner: document.getElementById("feedback-banner"),
  feedbackTitle: document.getElementById("feedback-title"),
  feedbackText: document.getElementById("feedback-text"),
  verifiedBanner: document.getElementById("verified-banner"),
  verifiedFeedback: document.getElementById("verified-feedback"),
  verifiedSuccessNote: document.getElementById("verified-success-note"),
  propRevealBox: document.getElementById("prop-reveal-box"),
  propRevealText: document.getElementById("prop-reveal-text"),
  nextStopBtn: document.getElementById("next-stop-btn"),
  finaleTitle: document.getElementById("finale-title"),
  finaleStory: document.getElementById("finale-story"),
  finalFeedbackBanner: document.getElementById("final-feedback-banner"),
  finalFeedbackText: document.getElementById("final-feedback-text"),
  finisherName: document.getElementById("finisher-name"),
  sleuthBadge: document.getElementById("sleuth-badge"),
  winnerBadge: document.getElementById("winner-badge"),
  prizeInstructions: document.getElementById("prize-instructions"),
  elapsedTime: document.getElementById("elapsed-time"),
  completedAt: document.getElementById("completed-at"),
  keepsakePanel: document.getElementById("keepsake-panel"),
  keepsakeSummary: document.getElementById("keepsake-summary"),
  keepsakeGrid: document.getElementById("keepsake-grid"),
  downloadStripBtn: document.getElementById("download-strip-btn"),
  footerVenue: document.getElementById("footer-venue"),
  footerEdition: document.getElementById("footer-edition")
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
  els.resetBtn.classList.toggle(
    "hidden",
    name !== "active" && name !== "completed"
  );
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
  if (!state.hunt || !state.session) return;
  window.localStorage.setItem(
    `${SESSION_PREFIX}${state.hunt.id}`,
    JSON.stringify(state.session)
  );
}

function loadSession(huntId) {
  try {
    const raw = window.localStorage.getItem(`${SESSION_PREFIX}${huntId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadShots(huntId) {
  try {
    const raw = window.localStorage.getItem(`${PHOTOS_PREFIX}${huntId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveShots(huntId, shots) {
  try {
    window.localStorage.setItem(`${PHOTOS_PREFIX}${huntId}`, JSON.stringify(shots));
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

function renderPackSwitcher() {
  els.packSwitcher.innerHTML = "";
  for (const pack of PACKS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pack-tab";
    btn.dataset.active = String(pack.id === state.huntId);
    btn.innerHTML = `${pack.label} <span class="mono-num">(${pack.stopsCount} stops)</span>`;
    btn.addEventListener("click", () => {
      if (pack.id !== state.huntId) {
        void initHunt(pack.id);
      }
    });
    els.packSwitcher.appendChild(btn);
  }
}

function renderKeyStatus() {
  const hasKey = Boolean(state.apiKey);
  els.keySetupBox.classList.toggle("hidden", hasKey);
  els.keySavedRow.classList.toggle("hidden", !hasKey);
  els.apiKeyInput.required = !hasKey;
}

function renderWelcome() {
  const h = state.hunt;
  els.welcomeTitle.textContent = h.title;
  els.welcomeCopy.textContent = h.welcomeCopy;
  els.ledgerStops.textContent = `${String(h.stops.length).padStart(2, "0")} chapters`;
  els.ledgerGifts.textContent = `First ${h.maxWinners} finishers`;
  els.startSubmitBtn.textContent = state.busyText || "Begin the hunt";
  els.startSubmitBtn.disabled = Boolean(state.busyText);
  renderKeyStatus();
  showScreen("welcome");
}

function renderActiveStop() {
  const h = state.hunt;
  const s = state.session;
  const stop = h.stops[s.currentStopIndex];
  const total = h.stops.length;

  els.stopCounter.textContent = `Stop ${String(s.currentStopIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")} · ${s.playerName}`;
  els.giftsBadge.textContent = `First ${h.maxWinners} win bags`;

  const pct = Math.round(
    ((s.currentStopIndex + (state.verifiedHold ? 1 : 0)) / total) * 100
  );
  els.progressFill.style.width = `${Math.max(8, pct)}%`;

  els.stopHeading.textContent = `${stop.chapterTitle}: ${stop.locationLabel}`;
  els.stopNarrative.textContent = stop.narrative;
  els.stopRiddle.textContent = `“${stop.riddle}”`;

  if (stop.clueImage) {
    els.clueImage.src = stop.clueImage;
    els.clueImage.alt = stop.clueImageCaption || "Visual detail clue";
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

  if (hintUnlocked) {
    els.hintText.textContent = stop.nudgeHint;
    els.hintBox.classList.remove("hidden");
    els.nudgeRow.classList.add("hidden");
  } else {
    els.hintBox.classList.add("hidden");
    els.nudgeRow.classList.toggle("hidden", Boolean(state.verifiedHold));
    els.nudgeBtn.textContent = `Use a nudge (${nudgesRemaining} left)`;
    els.nudgeBtn.disabled = nudgesRemaining <= 0 || Boolean(state.busyText);
  }

  if (state.verifiedHold) {
    els.captureControls.classList.add("hidden");
    els.previewCard.classList.add("hidden");
    els.feedbackBanner.classList.add("hidden");
    els.verifiedBanner.classList.remove("hidden");
    els.verifiedFeedback.textContent = state.verifiedHold.feedback;
    els.verifiedSuccessNote.textContent = state.verifiedHold.successNote;

    if (state.verifiedHold.propRevealNote) {
      els.propRevealText.textContent = state.verifiedHold.propRevealNote;
      els.propRevealBox.classList.remove("hidden");
    } else {
      els.propRevealBox.classList.add("hidden");
    }
    const nextStop = h.stops[s.currentStopIndex + 1];
    els.nextStopBtn.textContent = nextStop
      ? `Open ${nextStop.chapterTitle}`
      : "Continue";
  } else {
    els.verifiedBanner.classList.add("hidden");
    els.captureControls.classList.remove("hidden");
    els.takePhotoBtn.disabled = Boolean(state.busyText);
    els.libraryPhotoBtn.disabled = Boolean(state.busyText);
    els.takePhotoBtn.textContent = state.photo
      ? "Retake with camera"
      : "Take photo";

    if (state.photo) {
      els.previewImg.src = state.photo.previewUrl;
      els.previewMeta.textContent = `${state.photo.width}x${state.photo.height} · ${Math.max(1, Math.round(state.photo.byteLength / 1024))} KB JPEG`;
      els.clearPhotoBtn.disabled = Boolean(state.busyText);
      els.verifyPhotoBtn.disabled = Boolean(state.busyText);
      els.verifyPhotoBtn.textContent =
        state.busyText || "Submit photo for check";
      els.previewCard.classList.remove("hidden");
    } else {
      els.previewCard.classList.add("hidden");
    }

    if (state.feedback) {
      els.feedbackBanner.dataset.tone = state.feedback.tone;
      els.feedbackTitle.textContent =
        state.feedback.tone === "warn"
          ? `Not quite yet (attempt ${s.attemptsOnCurrentStop})`
          : "Could not verify";
      els.feedbackText.textContent = state.feedback.text;
      els.feedbackBanner.classList.remove("hidden");
    } else {
      els.feedbackBanner.classList.add("hidden");
    }
  }

  showScreen("active");
}

function renderCompleted() {
  const h = state.hunt;
  const s = state.session;
  const pureSleuth = (s.nudgesUsed || 0) === 0;

  els.finaleTitle.textContent = h.finaleTitle;
  els.finaleStory.textContent = h.finaleStory;
  els.finisherName.textContent = s.playerName;
  els.sleuthBadge.classList.toggle("hidden", !pureSleuth);
  els.winnerBadge.textContent = `First ${h.maxWinners} Claim Bags`;
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

  if (s.lastFeedback) {
    els.finalFeedbackText.textContent = s.lastFeedback;
    els.finalFeedbackBanner.classList.remove("hidden");
  } else {
    els.finalFeedbackBanner.classList.add("hidden");
  }

  if (state.shots.length > 0) {
    els.keepsakeSummary.textContent = `All ${state.shots.length} verified stops compiled on your phone—save a copy before leaving the courtyard.`;
    els.keepsakeGrid.innerHTML = "";
    for (const shot of state.shots) {
      const card = document.createElement("div");
      card.className = "keepsake-thumb";
      card.innerHTML = `<img src="${shot.dataUrl}" alt="${shot.locationLabel}" /><div class="keepsake-thumb-label">${shot.chapterTitle}: ${shot.locationLabel}</div>`;
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
    `1. Real wedding/home phone photos often have warm evening lighting, motion blur, or unusual angles—be generous when the target object or landmark is genuinely present.`,
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
    const errMsg = data?.error?.message || `Gemini API returned ${res.status}`;
    throw new Error(errMsg);
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

async function initHunt(requestedHuntId) {
  showGlobalError(null);
  showScreen("loading");
  state.photo = null;
  state.verifiedHold = null;
  state.feedback = null;

  try {
    const id = requestedHuntId || "home-test";
    const res = await fetch(`./hunts/${encodeURIComponent(id)}.json`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`Could not load hunt "${id}".`);

    state.hunt = await res.json();
    state.huntId = state.hunt.id;
    state.shots = loadShots(state.hunt.id);
    state.session = loadSession(state.hunt.id);

    els.venueBrand.textContent = state.hunt.venueName;
    els.footerVenue.textContent = `${state.hunt.venueName}, ${state.hunt.city}`;
    els.footerEdition.textContent =
      state.hunt.id === "home-test"
        ? "Home Rehearsal Pack"
        : "Courtyard Edition";
    renderPackSwitcher();

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

// Event bindings
els.clearKeyBtn.addEventListener("click", () => {
  window.localStorage.removeItem(KEY_STORAGE);
  state.apiKey = "";
  renderKeyStatus();
});

els.startForm.addEventListener("submit", (e) => {
  e.preventDefault();
  showGlobalError(null);

  if (!state.apiKey) {
    const entered = els.apiKeyInput.value.trim();
    if (!entered) {
      showGlobalError("Paste your restricted Gemini API key once to begin.");
      return;
    }
    window.localStorage.setItem(KEY_STORAGE, entered);
    state.apiKey = entered;
  }

  const name = els.playerNameInput.value.trim().replace(/\s+/g, " ").slice(0, 48);
  if (name.length < 2) {
    showGlobalError("Enter your name or pair name (at least 2 characters).");
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
  window.localStorage.removeItem(`${PHOTOS_PREFIX}${state.hunt.id}`);
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
  state.feedback = null;
  state.busyText = "Preparing photo...";
  renderActiveStop();

  try {
    state.photo = await compressImageForUpload(file, 1024, 0.82);
  } catch (err) {
    showGlobalError(
      err instanceof Error ? err.message : "Could not read selected image."
    );
  } finally {
    state.busyText = null;
    renderActiveStop();
  }
}

els.cameraInput.addEventListener("change", onFileSelected);
els.libraryInput.addEventListener("change", onFileSelected);

els.clearPhotoBtn.addEventListener("click", () => {
  state.photo = null;
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

  state.busyText = "Inspecting your photo...";
  state.feedback = null;
  showGlobalError(null);
  renderActiveStop();

  try {
    const verdict = await callGeminiVision(stop, state.photo, attemptNumber);

    if (!verdict.matched) {
      state.session.attemptsOnCurrentStop = attemptNumber;
      saveSession();
      state.feedback = {
        tone: "warn",
        text:
          verdict.feedback ||
          "Close, though not quite the right spot yet. Try another angle."
      };
      return;
    }

    // Save local thumbnail for keepsake strip
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
      saveShots(state.hunt.id, state.shots);
    } catch {
      // Non-blocking
    }

    const nextIdx = state.session.currentStopIndex + 1;
    if (nextIdx >= state.hunt.stops.length) {
      state.session.currentStopIndex = nextIdx;
      state.session.attemptsOnCurrentStop = 0;
      state.session.finishedAt = new Date().toISOString();
      state.session.lastFeedback = verdict.feedback;
      saveSession();
      state.photo = null;
      renderCompleted();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    state.verifiedHold = {
      feedback: verdict.feedback,
      successNote: stop.successNote,
      propRevealNote: stop.propRevealNote || null
    };
  } catch (err) {
    state.feedback = {
      tone: "error",
      text:
        err instanceof Error
          ? err.message
          : "Verification failed—check your API key and signal."
    };
  } finally {
    state.busyText = null;
    if (!state.session.finishedAt) {
      renderActiveStop();
    }
  }
});

els.nextStopBtn.addEventListener("click", () => {
  state.session.currentStopIndex += 1;
  state.session.attemptsOnCurrentStop = 0;
  saveSession();
  state.verifiedHold = null;
  state.photo = null;
  state.feedback = null;
  renderActiveStop();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

els.resetBtn.addEventListener("click", () => {
  window.localStorage.removeItem(`${SESSION_PREFIX}${state.hunt.id}`);
  window.localStorage.removeItem(`${PHOTOS_PREFIX}${state.hunt.id}`);
  state.session = null;
  state.shots = [];
  state.photo = null;
  state.verifiedHold = null;
  state.feedback = null;
  renderWelcome();
});

els.downloadStripBtn.addEventListener("click", async () => {
  if (!state.shots.length) return;
  els.downloadStripBtn.disabled = true;
  els.downloadStripBtn.textContent = "Composing PNG strip...";
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
    link.download = `${state.hunt.id}-keepsake.png`;
    link.click();
  } catch {
    showGlobalError("Could not generate keepsake strip image.");
  } finally {
    els.downloadStripBtn.disabled = false;
    els.downloadStripBtn.textContent = "Download Keepsake Photo Strip";
  }
});

// Boot
captureApiKeyFromUrl();
const urlHunt = new URLSearchParams(window.location.search).get("hunt");
void initHunt(urlHunt || "home-test");
