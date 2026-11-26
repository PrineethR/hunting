import { NextResponse } from "next/server";
import { getPublicStop, resolveHunt } from "@/lib/hunts";
import {
  getFinisherBySession,
  getLeaderboardState,
  getSessionAttempts,
  recordFinisher
} from "@/lib/store";
import { verifyProgressToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      progressToken?: string;
    };

    if (!body.progressToken) {
      return NextResponse.json(
        { error: "Missing progress token." },
        { status: 400 }
      );
    }

    const token = verifyProgressToken(body.progressToken);
    if (!token) {
      return NextResponse.json(
        { error: "Session token is invalid or expired." },
        { status: 401 }
      );
    }

    const hunt = resolveHunt(token.huntId);
    if (hunt.id !== token.huntId) {
      return NextResponse.json(
        { error: "This saved trail belongs to another hunt configuration." },
        { status: 409 }
      );
    }

    const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);

    if (
      token.finishedAt ||
      token.currentStopIndex >= hunt.stops.length
    ) {
      const finisher =
        (await getFinisherBySession(hunt.id, token.sessionId)) ??
        (await recordFinisher({
          sessionId: token.sessionId,
          playerName: token.playerName,
          huntId: hunt.id,
          claimPrefix: hunt.claimPrefix,
          startedAt: token.startedAt,
          finishedAt: token.finishedAt ?? new Date().toISOString(),
          maxWinners: hunt.maxWinners
        }));

      const refreshedSnapshot = await getLeaderboardState(
        hunt.id,
        hunt.maxWinners
      );

      return NextResponse.json({
        status: "completed",
        sessionId: token.sessionId,
        playerName: token.playerName,
        huntId: hunt.id,
        startedAt: token.startedAt,
        finisher,
        finaleTitle: hunt.finaleTitle,
        finaleStory: hunt.finaleStory,
        prizeInstructions: hunt.prizeInstructions,
        prizesRemaining: refreshedSnapshot.prizesRemaining,
        maxWinners: hunt.maxWinners
      });
    }

    const currentStop = getPublicStop(hunt, token.currentStopIndex);
    if (!currentStop) {
      return NextResponse.json(
        { error: "Unable to restore active clue." },
        { status: 404 }
      );
    }

    const attempts = await getSessionAttempts(hunt.id, token.sessionId);
    const fullStop = hunt.stops[token.currentStopIndex];

    return NextResponse.json({
      status: "active",
      sessionId: token.sessionId,
      playerName: token.playerName,
      huntId: hunt.id,
      startedAt: token.startedAt,
      currentStop,
      attemptNumber: attempts,
      unlockedHint: attempts >= 2 ? fullStop.nudgeHint : null,
      prizesRemaining: snapshot.prizesRemaining,
      maxWinners: hunt.maxWinners
    });
  } catch {
    return NextResponse.json(
      { error: "Could not restore saved progress." },
      { status: 400 }
    );
  }
}
