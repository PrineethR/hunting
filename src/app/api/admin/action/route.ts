import { NextResponse } from "next/server";
import { resolveHunt } from "@/lib/hunts";
import {
  getLeaderboardState,
  markPrizeRedeemed,
  resetHuntState
} from "@/lib/store";
import { verifyAdminPin } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const pin = request.headers.get("x-admin-pin");
  if (!verifyAdminPin(pin)) {
    return NextResponse.json({ error: "Invalid host PIN." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: "toggle_redeem" | "reset_hunt";
      huntId?: string;
      sessionId?: string;
      redeemed?: boolean;
    };

    const hunt = resolveHunt(body.huntId);

    if (body.action === "reset_hunt") {
      await resetHuntState(hunt.id);
      const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);
      return NextResponse.json({ ok: true, ...snapshot });
    }

    if (body.action === "toggle_redeem") {
      if (!body.sessionId || typeof body.redeemed !== "boolean") {
        return NextResponse.json(
          { error: "Missing sessionId or redeemed boolean." },
          { status: 400 }
        );
      }

      const updated = await markPrizeRedeemed(
        hunt.id,
        body.sessionId,
        body.redeemed
      );
      if (!updated) {
        return NextResponse.json(
          { error: "Finisher record not found." },
          { status: 404 }
        );
      }
      const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);
      return NextResponse.json({ ok: true, updated, ...snapshot });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 }
    );
  }
}
