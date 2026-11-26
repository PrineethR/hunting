import { NextResponse } from "next/server";
import { listHuntSummaries, resolveHunt } from "@/lib/hunts";
import { getLeaderboardState } from "@/lib/store";
import { verifyAdminPin } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const pin = request.headers.get("x-admin-pin");
  if (!verifyAdminPin(pin)) {
    return NextResponse.json({ error: "Invalid host PIN." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const hunt = resolveHunt(searchParams.get("huntId"));
  const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);

  return NextResponse.json({
    hunt: {
      id: hunt.id,
      title: hunt.title,
      venueName: hunt.venueName,
      totalStops: hunt.stops.length,
      maxWinners: hunt.maxWinners
    },
    availablePacks: listHuntSummaries(),
    ...snapshot
  });
}
