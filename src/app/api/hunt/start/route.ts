import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getPublicStop, resolveHunt } from "@/lib/hunts";
import { getLeaderboardState, registerOrUpdateSession } from "@/lib/store";
import { signProgressToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      playerName?: string;
      huntId?: string;
    };

    const rawName = typeof body.playerName === "string" ? body.playerName : "";
    const playerName = rawName.trim().replace(/\s+/g, " ").slice(0, 48);

    if (playerName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your name or pair name (at least 2 characters)." },
        { status: 400 }
      );
    }

    const hunt = resolveHunt(body.huntId);
    const firstStop = getPublicStop(hunt, 0);
    if (!firstStop) {
      return NextResponse.json(
        { error: "This hunt has no stops configured." },
        { status: 500 }
      );
    }

    const sessionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    await registerOrUpdateSession({
      sessionId,
      playerName,
      huntId: hunt.id,
      startedAt,
      currentStopIndex: 0,
      attemptsOnCurrentStop: 0
    });

    const progressToken = signProgressToken({
      v: 1,
      sessionId,
      playerName,
      huntId: hunt.id,
      currentStopIndex: 0,
      completedStopIds: [],
      nudgesUsed: 0,
      unlockedHintStopIds: [],
      startedAt
    });

    const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);

    return NextResponse.json({
      sessionId,
      playerName,
      huntId: hunt.id,
      startedAt,
      progressToken,
      currentStop: firstStop,
      nudgesUsed: 0,
      nudgesRemaining: hunt.maxNudges,
      prizesRemaining: snapshot.prizesRemaining,
      maxWinners: hunt.maxWinners
    });
  } catch {
    return NextResponse.json(
      { error: "Could not start the hunt session." },
      { status: 400 }
    );
  }
}
