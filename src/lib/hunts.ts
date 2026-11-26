import homeTestRaw from "@/data/hunts/home-test.json";
import anganaCourtyardRaw from "@/data/hunts/angana-courtyard.json";
import type {
  HuntConfig,
  PublicHuntPackSummary,
  PublicHuntStop
} from "@/lib/types";

const HUNTS: Record<string, HuntConfig> = {
  [homeTestRaw.id]: homeTestRaw as HuntConfig,
  [anganaCourtyardRaw.id]: anganaCourtyardRaw as HuntConfig
};

export function getDefaultHuntId(): string {
  const configured = process.env.DEFAULT_HUNT_ID?.trim();
  if (configured && HUNTS[configured]) {
    return configured;
  }
  return "home-test";
}

export function isHuntSwitchAllowed(): boolean {
  return process.env.ALLOW_HUNT_SWITCH !== "false";
}

export function resolveHunt(requestedHuntId?: string | null): HuntConfig {
  const allowSwitch = isHuntSwitchAllowed();
  const defaultId = getDefaultHuntId();

  if (allowSwitch && requestedHuntId && HUNTS[requestedHuntId]) {
    return HUNTS[requestedHuntId];
  }
  return HUNTS[defaultId];
}

export function listHuntSummaries(): PublicHuntPackSummary[] {
  return Object.values(HUNTS).map((hunt) => ({
    id: hunt.id,
    title: hunt.title,
    subtitle: hunt.subtitle,
    venueName: hunt.venueName,
    city: hunt.city,
    totalStops: hunt.stops.length,
    maxWinners: hunt.maxWinners
  }));
}

/**
 * Strips all server-only verification criteria and reference image lists
 * before sending any stop to the browser.
 */
export function getPublicStop(
  hunt: HuntConfig,
  stopIndex: number
): PublicHuntStop | null {
  const stop = hunt.stops[stopIndex];
  if (!stop) return null;

  return {
    index: stopIndex,
    totalStops: hunt.stops.length,
    id: stop.id,
    chapterTitle: stop.chapterTitle,
    locationLabel: stop.locationLabel,
    narrative: stop.narrative,
    riddle: stop.riddle
  };
}
