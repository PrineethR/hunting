import { NextResponse } from "next/server";
import {
  isHuntSwitchAllowed,
  listHuntSummaries,
  resolveHunt
} from "@/lib/hunts";
import { getLeaderboardState } from "@/lib/store";
import type { PublicHuntInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedHuntId = searchParams.get("huntId");
  const hunt = resolveHunt(requestedHuntId);
  const snapshot = await getLeaderboardState(hunt.id, hunt.maxWinners);
  const allowSwitch = isHuntSwitchAllowed();

  const payload: PublicHuntInfo = {
    id: hunt.id,
    title: hunt.title,
    subtitle: hunt.subtitle,
    venueName: hunt.venueName,
    city: hunt.city,
    welcomeCopy: hunt.welcomeCopy,
    totalStops: hunt.stops.length,
    maxWinners: hunt.maxWinners,
    prizesRemaining: snapshot.prizesRemaining,
    finishersCount: snapshot.finishers.length,
    allowSwitch,
    availablePacks: allowSwitch ? listHuntSummaries() : []
  };

  return NextResponse.json(payload);
}
