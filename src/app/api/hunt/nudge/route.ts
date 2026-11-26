import { NextResponse } from "next/server";
import { resolveHunt } from "@/lib/hunts";
import { signProgressToken, verifyProgressToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      progressToken?: string;
      stopId?: string;
    };

    if (!body.progressToken || !body.stopId) {
      return NextResponse.json(
        { error: "Missing progress token or stopId." },
        { status: 400 }
      );
    }

    const token = verifyProgressToken(body.progressToken);
    if (!token) {
      return NextResponse.json(
        { error: "Invalid or expired session token." },
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

    const expectedStop = hunt.stops[token.currentStopIndex];
    if (!expectedStop || expectedStop.id !== body.stopId) {
      return NextResponse.json(
        { error: "Nudge requested for an inactive stop." },
        { status: 403 }
      );
    }

    const unlockedList = Array.isArray(token.unlockedHintStopIds)
      ? token.unlockedHintStopIds
      : [];
    const currentNudgesUsed = token.nudgesUsed ?? 0;

    if (unlockedList.includes(expectedStop.id)) {
      return NextResponse.json({
        progressToken: body.progressToken,
        hint: expectedStop.nudgeHint,
        nudgesUsed: currentNudgesUsed,
        nudgesRemaining: Math.max(0, hunt.maxNudges - currentNudgesUsed),
        alreadyUnlocked: true
      });
    }

    if (currentNudgesUsed >= hunt.maxNudges) {
      return NextResponse.json(
        {
          error: `All ${hunt.maxNudges} nudges have been used on this trail.`
        },
        { status: 400 }
      );
    }

    const nextNudgesUsed = currentNudgesUsed + 1;
    const nextUnlocked = [...unlockedList, expectedStop.id];
    const updatedToken = signProgressToken({
      ...token,
      nudgesUsed: nextNudgesUsed,
      unlockedHintStopIds: nextUnlocked
    });

    return NextResponse.json({
      progressToken: updatedToken,
      hint: expectedStop.nudgeHint,
      nudgesUsed: nextNudgesUsed,
      nudgesRemaining: Math.max(0, hunt.maxNudges - nextNudgesUsed),
      alreadyUnlocked: false
    });
  } catch {
    return NextResponse.json(
      { error: "Could not unlock nudge." },
      { status: 400 }
    );
  }
}
