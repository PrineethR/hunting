import { NextResponse } from "next/server";
import { verifyStopPhoto } from "@/lib/gemini";
import { getPublicStop, resolveHunt } from "@/lib/hunts";
import {
  checkAndIncrementRateLimit,
  getLeaderboardState,
  getSessionAttempts,
  recordFinisher,
  registerOrUpdateSession
} from "@/lib/store";
import { signProgressToken, verifyProgressToken } from "@/lib/token";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BASE64_LENGTH = 3_500_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      progressToken?: string;
      stopId?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!body.progressToken || !body.stopId || !body.imageBase64) {
      return NextResponse.json(
        { error: "Missing progress token, stopId, or image payload." },
        { status: 400 }
      );
    }

    const token = verifyProgressToken(body.progressToken);
    if (!token) {
      return NextResponse.json(
        { error: "Invalid or tampered session token." },
        { status: 401 }
      );
    }

    const hunt = resolveHunt(token.huntId);
    if (hunt.id !== token.huntId) {
      return NextResponse.json(
        { error: "This hunt pack is not currently active." },
        { status: 409 }
      );
    }

    if (token.finishedAt || token.currentStopIndex >= hunt.stops.length) {
      return NextResponse.json(
        { error: "This hunt has already been completed." },
        { status: 409 }
      );
    }

    const expectedStop = hunt.stops[token.currentStopIndex];
    if (!expectedStop || expectedStop.id !== body.stopId) {
      return NextResponse.json(
        {
          error:
            "Out-of-order stop submission blocked. Solve the active clue first."
        },
        { status: 403 }
      );
    }

    const rate = await checkAndIncrementRateLimit(hunt.id, token.sessionId);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: rate.reason ?? "Too many photo attempts.",
          retryAfterSeconds: rate.retryAfterSeconds ?? 15
        },
        { status: 429 }
      );
    }

    let cleanBase64 = body.imageBase64.trim();
    let mimeType = body.mimeType?.trim() || "image/jpeg";

    const dataUriMatch = cleanBase64.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );
    if (dataUriMatch) {
      mimeType = dataUriMatch[1];
      cleanBase64 = dataUriMatch[2];
    }

    if (cleanBase64.length < 64 || cleanBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        {
          error:
            "Image size must be under 2.5 MB. Try retaking or refreshing the page."
        },
        { status: 413 }
      );
    }

    const previousAttempts = await getSessionAttempts(hunt.id, token.sessionId);
    const attemptNumber = previousAttempts + 1;

    const verdict = await verifyStopPhoto({
      hunt,
      stop: expectedStop,
      imageBase64: cleanBase64,
      mimeType,
      attemptNumber
    });

    if (!verdict.matched) {
      await registerOrUpdateSession({
        sessionId: token.sessionId,
        playerName: token.playerName,
        huntId: hunt.id,
        startedAt: token.startedAt,
        currentStopIndex: token.currentStopIndex,
        attemptsOnCurrentStop: attemptNumber
      });

      const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);

      return NextResponse.json({
        passed: false,
        feedback: verdict.feedback,
        observed: verdict.observed,
        confidence: verdict.confidence,
        attemptNumber,
        unlockedHint: attemptNumber >= 2 ? expectedStop.nudgeHint : null,
        prizesRemaining: snapshot.prizesRemaining,
        maxWinners: hunt.maxWinners
      });
    }

    // Passed verification for expectedStop
    const nextIndex = token.currentStopIndex + 1;
    const completedStopIds = [...token.completedStopIds, expectedStop.id];
    const isFinalStop = nextIndex >= hunt.stops.length;

    if (!isFinalStop) {
      await registerOrUpdateSession({
        sessionId: token.sessionId,
        playerName: token.playerName,
        huntId: hunt.id,
        startedAt: token.startedAt,
        currentStopIndex: nextIndex,
        attemptsOnCurrentStop: 0
      });

      const updatedToken = signProgressToken({
        v: 1,
        sessionId: token.sessionId,
        playerName: token.playerName,
        huntId: hunt.id,
        currentStopIndex: nextIndex,
        completedStopIds,
        startedAt: token.startedAt
      });

      const nextStop = getPublicStop(hunt, nextIndex);
      const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);

      return NextResponse.json({
        passed: true,
        completedHunt: false,
        feedback: verdict.feedback,
        observed: verdict.observed,
        confidence: verdict.confidence,
        successNote: expectedStop.successNote,
        progressToken: updatedToken,
        nextStop,
        prizesRemaining: snapshot.prizesRemaining,
        maxWinners: hunt.maxWinners
      });
    }

    // Final stop completed — atomically assign finisher rank & first-5 claim code
    const finishedAt = new Date().toISOString();
    const finisher = await recordFinisher({
      sessionId: token.sessionId,
      playerName: token.playerName,
      huntId: hunt.id,
      claimPrefix: hunt.claimPrefix,
      startedAt: token.startedAt,
      finishedAt,
      maxWinners: hunt.maxWinners
    });

    await registerOrUpdateSession({
      sessionId: token.sessionId,
      playerName: token.playerName,
      huntId: hunt.id,
      startedAt: token.startedAt,
      currentStopIndex: nextIndex,
      attemptsOnCurrentStop: 0
    });

    const completedToken = signProgressToken({
      v: 1,
      sessionId: token.sessionId,
      playerName: token.playerName,
      huntId: hunt.id,
      currentStopIndex: nextIndex,
      completedStopIds,
      startedAt: token.startedAt,
      finishedAt
    });

    const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);

    return NextResponse.json({
      passed: true,
      completedHunt: true,
      feedback: verdict.feedback,
      observed: verdict.observed,
      confidence: verdict.confidence,
      successNote: expectedStop.successNote,
      progressToken: completedToken,
      finisher,
      finaleTitle: hunt.finaleTitle,
      finaleStory: hunt.finaleStory,
      prizeInstructions: hunt.prizeInstructions,
      prizesRemaining: snapshot.prizesRemaining,
      maxWinners: hunt.maxWinners
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error verifying photo.";
    console.error("[verify] error:", message);
    return NextResponse.json(
      { error: "Verification failed briefly—please try snapping again." },
      { status: 500 }
    );
  }
}
