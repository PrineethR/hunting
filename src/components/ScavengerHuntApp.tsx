"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CameraIcon,
  CheckCircleIcon,
  PhotoLibraryIcon,
  SparkHintIcon
} from "@/components/Icons";
import {
  compressImageForUpload,
  type CompressedImageResult
} from "@/lib/image-client";
import {
  createThumbnailDataUrl,
  renderKeepsakeStripPng,
  type KeepsakeShot
} from "@/lib/keepsake-strip";
import type {
  FinisherRecord,
  PublicHuntInfo,
  PublicHuntStop
} from "@/lib/types";

interface StoredProgress {
  progressToken: string;
  huntId: string;
}

type ScreenState = "loading" | "welcome" | "active" | "completed";

interface VerifySuccessHold {
  feedback: string;
  successNote: string;
  propRevealNote?: string | null;
  nextStop: PublicHuntStop;
  nextToken: string;
}

interface CompletedState {
  finisher: FinisherRecord;
  finaleTitle: string;
  finaleStory: string;
  prizeInstructions: string;
  lastFeedback?: string;
  propRevealNote?: string | null;
}

const STORAGE_PREFIX = "angana_hunt_session_v1:";
const PHOTOS_STORAGE_PREFIX = "angana_hunt_photos_v1:";

function storageKey(huntId: string): string {
  return `${STORAGE_PREFIX}${huntId}`;
}

function photosStorageKey(huntId: string): string {
  return `${PHOTOS_STORAGE_PREFIX}${huntId}`;
}

function loadStoredShots(huntId: string): KeepsakeShot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(photosStorageKey(huntId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KeepsakeShot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredShots(huntId: string, shots: KeepsakeShot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(photosStorageKey(huntId), JSON.stringify(shots));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function formatClockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

export function ScavengerHuntApp() {
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [huntInfo, setHuntInfo] = useState<PublicHuntInfo | null>(null);
  const [selectedHuntId, setSelectedHuntId] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [activePlayerName, setActivePlayerName] = useState("");
  const [progressToken, setProgressToken] = useState<string | null>(null);
  const [currentStop, setCurrentStop] = useState<PublicHuntStop | null>(null);

  const [photo, setPhoto] = useState<CompressedImageResult | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [nudgesRemaining, setNudgesRemaining] = useState(2);
  const [unlockedHint, setUnlockedHint] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    tone: "warn" | "error";
    text: string;
  } | null>(null);
  const [verifiedHold, setVerifiedHold] = useState<VerifySuccessHold | null>(
    null
  );
  const [completedState, setCompletedState] = useState<CompletedState | null>(
    null
  );
  const [keepsakeShots, setKeepsakeShots] = useState<KeepsakeShot[]>([]);
  const [stripBusy, setStripBusy] = useState(false);

  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const loadHuntAndResume = useCallback(async (requestedHuntId?: string) => {
    setGlobalError(null);
    setScreen("loading");

    try {
      const qs = requestedHuntId
        ? `?huntId=${encodeURIComponent(requestedHuntId)}`
        : "";
      const infoRes = await fetch(`/api/hunt/info${qs}`, { cache: "no-store" });
      if (!infoRes.ok) {
        throw new Error("Could not load hunt configuration.");
      }
      const info = (await infoRes.json()) as PublicHuntInfo;
      setHuntInfo(info);
      setSelectedHuntId(info.id);
      setNudgesRemaining(info.maxNudges ?? 2);

      // Reset transient per-stop UI
      setPhoto(null);
      setVerifiedHold(null);
      setFeedbackBanner(null);
      setUnlockedHint(null);
      setAttemptCount(0);
      setCompletedState(null);
      setKeepsakeShots(loadStoredShots(info.id));

      const rawSaved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(storageKey(info.id))
          : null;

      if (rawSaved) {
        try {
          const parsed = JSON.parse(rawSaved) as StoredProgress;
          if (parsed?.progressToken) {
            const resumeRes = await fetch("/api/hunt/resume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ progressToken: parsed.progressToken })
            });

            if (resumeRes.ok) {
              const resumed = await resumeRes.json();
              setProgressToken(parsed.progressToken);
              setActivePlayerName(resumed.playerName);
              setHuntInfo((prev) =>
                prev
                  ? { ...prev, prizesRemaining: resumed.prizesRemaining }
                  : prev
              );

              if (resumed.status === "completed") {
                setCompletedState({
                  finisher: resumed.finisher,
                  finaleTitle: resumed.finaleTitle,
                  finaleStory: resumed.finaleStory,
                  prizeInstructions: resumed.prizeInstructions
                });
                setScreen("completed");
                return;
              }

              setCurrentStop(resumed.currentStop);
              setAttemptCount(resumed.attemptNumber ?? 0);
              setNudgesRemaining(
                resumed.nudgesRemaining ?? info.maxNudges ?? 2
              );
              setUnlockedHint(resumed.unlockedHint ?? null);
              setScreen("active");
              return;
            }
          }
        } catch {
          // Invalid local state; clear and show welcome screen
        }
        window.localStorage.removeItem(storageKey(info.id));
        window.localStorage.removeItem(photosStorageKey(info.id));
        setKeepsakeShots([]);
      }

      setProgressToken(null);
      setCurrentStop(null);
      setScreen("welcome");
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Failed to initialize hunt."
      );
      setScreen("welcome");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlHuntId = params.get("hunt") ?? undefined;
    void loadHuntAndResume(urlHuntId);
  }, [loadHuntAndResume]);

  const handleStartHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!huntInfo) return;

    const trimmed = playerName.trim();
    if (trimmed.length < 2) {
      setGlobalError("Enter your name or pair name (at least 2 characters).");
      return;
    }

    setBusyMessage("Preparing your first clue...");
    setGlobalError(null);

    try {
      const res = await fetch("/api/hunt/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: trimmed,
          huntId: huntInfo.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not start the hunt.");
      }

      const saved: StoredProgress = {
        progressToken: data.progressToken,
        huntId: data.huntId
      };
      window.localStorage.setItem(storageKey(data.huntId), JSON.stringify(saved));
      window.localStorage.removeItem(photosStorageKey(data.huntId));

      setProgressToken(data.progressToken);
      setActivePlayerName(data.playerName);
      setCurrentStop(data.currentStop);
      setPhoto(null);
      setKeepsakeShots([]);
      setAttemptCount(0);
      setNudgesRemaining(data.nudgesRemaining ?? huntInfo.maxNudges ?? 2);
      setUnlockedHint(null);
      setFeedbackBanner(null);
      setVerifiedHold(null);
      setHuntInfo((prev) =>
        prev ? { ...prev, prizesRemaining: data.prizesRemaining } : prev
      );
      setScreen("active");
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Could not start hunt."
      );
    } finally {
      setBusyMessage(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setGlobalError(null);
    setFeedbackBanner(null);
    setBusyMessage("Preparing photo...");

    try {
      const compressed = await compressImageForUpload(file, 1024, 0.82);
      setPhoto(compressed);
    } catch (err) {
      setGlobalError(
        err instanceof Error
          ? err.message
          : "Could not read that image. Please try another shot."
      );
    } finally {
      setBusyMessage(null);
    }
  };

  const handleUseNudge = async () => {
    if (!progressToken || !currentStop || !huntInfo || unlockedHint) return;
    setBusyMessage("Opening field note...");
    setGlobalError(null);

    try {
      const res = await fetch("/api/hunt/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressToken,
          stopId: currentStop.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({
          tone: "warn",
          text: data.error || "No nudges remaining for this trail."
        });
        return;
      }

      window.localStorage.setItem(
        storageKey(huntInfo.id),
        JSON.stringify({
          progressToken: data.progressToken,
          huntId: huntInfo.id
        } satisfies StoredProgress)
      );
      setProgressToken(data.progressToken);
      setUnlockedHint(data.hint);
      setNudgesRemaining(data.nudgesRemaining);
    } catch {
      setFeedbackBanner({
        tone: "error",
        text: "Could not reach server for a nudge right now."
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleVerifyPhoto = async () => {
    if (!photo || !progressToken || !currentStop || !huntInfo) return;

    setBusyMessage("Inspecting your photo...");
    setFeedbackBanner(null);
    setGlobalError(null);

    try {
      const res = await fetch("/api/hunt/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressToken,
          stopId: currentStop.id,
          imageBase64: photo.base64,
          mimeType: photo.mimeType
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({
          tone: "error",
          text: data.error || "Verification paused—please try again."
        });
        return;
      }

      setHuntInfo((prev) =>
        prev ? { ...prev, prizesRemaining: data.prizesRemaining } : prev
      );

      if (!data.passed) {
        setAttemptCount(data.attemptNumber ?? attemptCount + 1);
        if (data.unlockedHint) {
          setUnlockedHint(data.unlockedHint);
        }
        setFeedbackBanner({
          tone: "warn",
          text:
            data.feedback ||
            "Close, though not quite the right spot yet. Try another angle."
        });
        return;
      }

      // Save compressed thumbnail locally for the end-of-trail Keepsake Strip
      try {
        const thumbUrl = await createThumbnailDataUrl(photo.previewUrl);
        const nextShots = [
          ...keepsakeShots.filter((s) => s.stopId !== currentStop.id),
          {
            stopId: currentStop.id,
            chapterTitle: currentStop.chapterTitle,
            locationLabel: currentStop.locationLabel,
            dataUrl: thumbUrl
          }
        ];
        setKeepsakeShots(nextShots);
        saveStoredShots(huntInfo.id, nextShots);
      } catch {
        // Non-blocking if thumbnail conversion fails
      }

      window.localStorage.setItem(
        storageKey(huntInfo.id),
        JSON.stringify({
          progressToken: data.progressToken,
          huntId: huntInfo.id
        } satisfies StoredProgress)
      );
      setProgressToken(data.progressToken);

      if (data.completedHunt) {
        setCompletedState({
          finisher: data.finisher,
          finaleTitle: data.finaleTitle,
          finaleStory: data.finaleStory,
          prizeInstructions: data.prizeInstructions,
          lastFeedback: data.feedback,
          propRevealNote: data.propRevealNote
        });
        setScreen("completed");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setVerifiedHold({
        feedback: data.feedback,
        successNote: data.successNote,
        propRevealNote: data.propRevealNote,
        nextStop: data.nextStop,
        nextToken: data.progressToken
      });
    } catch {
      setFeedbackBanner({
        tone: "error",
        text: "Network hiccup while sending photo. Check signal and tap verify again."
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleAdvanceNextStop = () => {
    if (!verifiedHold) return;
    setCurrentStop(verifiedHold.nextStop);
    setProgressToken(verifiedHold.nextToken);
    setVerifiedHold(null);
    setPhoto(null);
    setFeedbackBanner(null);
    setAttemptCount(0);
    setUnlockedHint(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDownloadKeepsakeStrip = async () => {
    if (!huntInfo || !completedState || keepsakeShots.length === 0) return;
    setStripBusy(true);
    try {
      const pngUrl = await renderKeepsakeStripPng({
        title: huntInfo.title,
        venueName: huntInfo.venueName,
        city: huntInfo.city,
        playerName: completedState.finisher.playerName,
        rank: completedState.finisher.rank,
        pureSleuth: completedState.finisher.pureSleuth,
        shots: keepsakeShots
      });
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${huntInfo.id}-keepsake.png`;
      link.click();
    } catch {
      setGlobalError("Could not generate keepsake strip image.");
    } finally {
      setStripBusy(false);
    }
  };

  const handleRestartLocal = () => {
    if (!huntInfo) return;
    window.localStorage.removeItem(storageKey(huntInfo.id));
    window.localStorage.removeItem(photosStorageKey(huntInfo.id));
    setProgressToken(null);
    setCurrentStop(null);
    setPhoto(null);
    setKeepsakeShots([]);
    setVerifiedHold(null);
    setFeedbackBanner(null);
    setCompletedState(null);
    setAttemptCount(0);
    setNudgesRemaining(huntInfo.maxNudges ?? 2);
    setUnlockedHint(null);
    setScreen("welcome");
  };

  const handleSwitchPack = (huntId: string) => {
    if (huntId === selectedHuntId) return;
    void loadHuntAndResume(huntId);
  };

  const totalStops = huntInfo?.totalStops ?? 0;
  const activeStepNumber = currentStop ? currentStop.index + 1 : 0;
  const progressPct =
    totalStops > 0 && currentStop
      ? Math.round(
          ((currentStop.index + (verifiedHold ? 1 : 0)) / totalStops) * 100
        )
      : 0;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-title">
            {huntInfo?.venueName ?? "Angana Courtyard Trail"}
          </span>
        </div>
        <div className="topbar-meta">
          {screen === "active" || screen === "completed" ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleRestartLocal}
            >
              Reset my run
            </button>
          ) : null}
          <Link href="/admin" className="quiet-link">
            Host Console
          </Link>
        </div>
      </header>

      {huntInfo?.allowSwitch && huntInfo.availablePacks.length > 1 ? (
        <div className="pack-switcher" role="group" aria-label="Trail mode">
          {huntInfo.availablePacks.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="pack-tab"
              data-active={pack.id === huntInfo.id}
              onClick={() => handleSwitchPack(pack.id)}
            >
              {pack.title}{" "}
              <span className="mono-num">({pack.totalStops} stops)</span>
            </button>
          ))}
        </div>
      ) : null}

      {globalError ? (
        <div className="feedback-banner" data-tone="error" role="alert">
          <div className="feedback-title">Something needs attention</div>
          <p className="feedback-text">{globalError}</p>
        </div>
      ) : null}

      {screen === "loading" ? (
        <section className="panel" aria-live="polite">
          <p className="lead-copy" style={{ margin: 0 }}>
            Opening trail notebook...
          </p>
        </section>
      ) : null}

      {screen === "welcome" && huntInfo ? (
        <section>
          <h1 className="display-heading">{huntInfo.title}</h1>
          <p className="lead-copy">{huntInfo.welcomeCopy}</p>

          <div className="prize-ledger" aria-label="Hunt status">
            <div className="ledger-cell">
              <span className="ledger-label">Stops on trail</span>
              <span className="ledger-value">
                {String(huntInfo.totalStops).padStart(2, "0")} chapters
              </span>
            </div>
            <div className="ledger-cell">
              <span className="ledger-label">Goody bags unclaimed</span>
              <span className="ledger-value">
                {huntInfo.prizesRemaining} of {huntInfo.maxWinners}
              </span>
            </div>
          </div>

          <form className="panel" onSubmit={handleStartHunt}>
            <label htmlFor="player-name" className="field-label">
              Your name or pair name
            </label>
            <input
              id="player-name"
              type="text"
              className="text-input"
              placeholder="e.g., Aarav & Meera"
              maxLength={48}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              disabled={Boolean(busyMessage)}
              required
            />
            <div style={{ marginTop: 14 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={Boolean(busyMessage)}
              >
                {busyMessage ?? "Begin the hunt"}
              </button>
            </div>
            <p
              style={{
                margin: "12px 0 0",
                fontSize: "0.84rem",
                color: "var(--ink-muted)"
              }}
            >
              Solve all {huntInfo.totalStops} clues without using a nudge to
              earn a No-Hint Sleuth stamp—plus a downloadable keepsake strip at
              the end.
            </p>
          </form>
        </section>
      ) : null}

      {screen === "active" && currentStop && huntInfo ? (
        <section>
          <div className="stop-header">
            <div>
              <span
                className="mono-num"
                style={{ fontSize: "0.84rem", color: "var(--ink-muted)" }}
              >
                Stop {String(activeStepNumber).padStart(2, "0")} /{" "}
                {String(currentStop.totalStops).padStart(2, "0")} ·{" "}
                {activePlayerName}
              </span>
            </div>
            <span className="status-pill" data-tone="accent">
              <span className="mono-num">
                {huntInfo.prizesRemaining}/{huntInfo.maxWinners}
              </span>
              &nbsp;gifts left
            </span>
          </div>

          <div
            className="progress-rail"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: `${Math.max(8, progressPct)}%` }}
            />
          </div>

          <article className="riddle-sheet">
            <h1 className="section-heading">
              {currentStop.chapterTitle}: {currentStop.locationLabel}
            </h1>
            <p className="riddle-narrative">{currentStop.narrative}</p>

            {currentStop.clueImage ? (
              <figure className="clue-image-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentStop.clueImage}
                  alt={
                    currentStop.clueImageCaption ??
                    "Visual detail clue for this stop"
                  }
                />
                {currentStop.clueImageCaption ? (
                  <figcaption className="clue-image-caption">
                    {currentStop.clueImageCaption}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}

            <blockquote className="riddle-verse">
              &ldquo;{currentStop.riddle}&rdquo;
            </blockquote>

            {currentStop.actionPrompt ? (
              <div className="action-twist-box">
                <strong>Photo twist:</strong> {currentStop.actionPrompt}
              </div>
            ) : null}

            {unlockedHint ? (
              <div className="hint-box">
                <strong>Field note:</strong> {unlockedHint}
              </div>
            ) : !verifiedHold ? (
              <div className="nudge-row">
                <span
                  style={{ fontSize: "0.83rem", color: "var(--ink-muted)" }}
                >
                  Stuck? Unlock a direct clue (costs your No-Hint Sleuth stamp).
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleUseNudge}
                  disabled={nudgesRemaining <= 0 || Boolean(busyMessage)}
                >
                  Use a nudge ({nudgesRemaining} left)
                </button>
              </div>
            ) : null}
          </article>

          {!verifiedHold ? (
            <>
              <div className="capture-stack">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden-file-input"
                  onChange={handleFileChange}
                />
                <input
                  ref={libraryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={handleFileChange}
                />

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={Boolean(busyMessage)}
                >
                  <CameraIcon />
                  {photo ? "Retake with camera" : "Take photo"}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={Boolean(busyMessage)}
                >
                  <PhotoLibraryIcon />
                  Choose from photo library
                </button>
              </div>

              {photo ? (
                <div className="preview-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt="Selected clue attempt"
                    className="preview-image"
                  />
                  <div className="preview-footer">
                    <span className="mono-num">
                      {photo.width}x{photo.height} ·{" "}
                      {Math.max(1, Math.round(photo.byteLength / 1024))} KB JPEG
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setPhoto(null)}
                      disabled={Boolean(busyMessage)}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ padding: "0 14px 14px" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleVerifyPhoto}
                      disabled={Boolean(busyMessage)}
                    >
                      <CheckCircleIcon />
                      {busyMessage ?? "Submit photo for check"}
                    </button>
                  </div>
                </div>
              ) : null}

              {feedbackBanner ? (
                <div
                  className="feedback-banner"
                  data-tone={feedbackBanner.tone}
                  role="status"
                >
                  <div className="feedback-title">
                    <SparkHintIcon />
                    {feedbackBanner.tone === "warn"
                      ? `Not quite yet (attempt ${attemptCount})`
                      : "Could not verify"}
                  </div>
                  <p className="feedback-text">{feedbackBanner.text}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="feedback-banner" data-tone="success" role="status">
              <div className="feedback-title">
                <CheckCircleIcon />
                Clue verified
              </div>
              <p className="feedback-text">{verifiedHold.feedback}</p>
              <p
                className="feedback-text"
                style={{
                  marginTop: 8,
                  color: "var(--ink-muted)",
                  fontSize: "0.9rem"
                }}
              >
                {verifiedHold.successNote}
              </p>

              {verifiedHold.propRevealNote ? (
                <div className="prop-reveal-box">
                  <strong>Hidden lead:</strong> {verifiedHold.propRevealNote}
                </div>
              ) : null}

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAdvanceNextStop}
                >
                  Open {verifiedHold.nextStop.chapterTitle}
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {screen === "completed" && completedState && huntInfo ? (
        <section>
          <h1 className="display-heading">{completedState.finaleTitle}</h1>
          <p className="lead-copy">{completedState.finaleStory}</p>

          {completedState.lastFeedback ? (
            <div
              className="feedback-banner"
              data-tone="success"
              style={{ marginBottom: 18 }}
            >
              <div className="feedback-title">
                <CheckCircleIcon />
                Final stop verified
              </div>
              <p className="feedback-text">{completedState.lastFeedback}</p>
            </div>
          ) : null}

          <div className="winner-pass">
            <div className="winner-rank-row">
              <div>
                <div
                  style={{
                    fontSize: "0.84rem",
                    color: "var(--ink-muted)",
                    marginBottom: 2
                  }}
                >
                  Trail finisher pass
                </div>
                <strong style={{ fontSize: "1.15rem" }}>
                  {completedState.finisher.playerName}
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center"
                }}
              >
                {completedState.finisher.pureSleuth ? (
                  <span className="status-pill" data-tone="success">
                    No-Hint Sleuth
                  </span>
                ) : null}
                {completedState.finisher.isPrizeWinner ? (
                  <span className="status-pill" data-tone="accent">
                    Goody Bag Winner #{completedState.finisher.rank} of{" "}
                    {huntInfo.maxWinners}
                  </span>
                ) : (
                  <span className="status-pill">
                    Finisher #{completedState.finisher.rank}
                  </span>
                )}
              </div>
            </div>

            {completedState.finisher.isPrizeWinner &&
            completedState.finisher.claimCode ? (
              <>
                <p style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>
                  You finished among the first {huntInfo.maxWinners}! Show this
                  pass to claim one of the physical goody bags.
                </p>
                <div className="claim-code-box">
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--ink-muted)",
                      marginBottom: 4
                    }}
                  >
                    Gift Table Claim Code
                  </div>
                  <div className="claim-code-value">
                    {completedState.finisher.claimCode}
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.88rem",
                    color: "var(--ink-muted)"
                  }}
                >
                  {completedState.prizeInstructions}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: "0.95rem" }}>
                All {huntInfo.maxWinners} goody bags have already been claimed
                for this round, though you completed every stop on the trail!
                Download your photo strip below as a keepsake from{" "}
                {huntInfo.venueName}.
              </p>
            )}

            <div
              className="prize-ledger"
              style={{ marginTop: 18, marginBottom: 0 }}
            >
              <div className="ledger-cell">
                <span className="ledger-label">Elapsed time</span>
                <span className="ledger-value">
                  {formatDuration(completedState.finisher.elapsedMs)}
                </span>
              </div>
              <div className="ledger-cell">
                <span className="ledger-label">Completed at</span>
                <span className="ledger-value">
                  {formatClockTime(completedState.finisher.finishedAt)}
                </span>
              </div>
            </div>
          </div>

          {keepsakeShots.length > 0 ? (
            <section className="keepsake-panel">
              <h2 className="section-heading" style={{ fontSize: "1.35rem" }}>
                Your Trail Keepsake Strip
              </h2>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: "0.9rem",
                  color: "var(--ink-muted)"
                }}
              >
                All {keepsakeShots.length} verified stops compiled on your phone
                —save a copy before leaving the courtyard.
              </p>

              <div className="keepsake-grid">
                {keepsakeShots.map((shot) => (
                  <div key={shot.stopId} className="keepsake-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot.dataUrl} alt={shot.locationLabel} />
                    <div className="keepsake-thumb-label">
                      {shot.chapterTitle}: {shot.locationLabel}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadKeepsakeStrip}
                disabled={stripBusy}
              >
                {stripBusy
                  ? "Composing PNG strip..."
                  : "Download Keepsake Photo Strip"}
              </button>
            </section>
          ) : null}
        </section>
      ) : null}

      <footer className="footer-note">
        <span>{huntInfo ? `${huntInfo.venueName}, ${huntInfo.city}` : ""}</span>
        <span>
          {huntInfo?.id === "home-test"
            ? "Home Rehearsal Pack"
            : "Courtyard Edition"}
        </span>
      </footer>
    </main>
  );
}
