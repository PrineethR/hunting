export interface StopVerificationSpec {
  targetDescription: string;
  acceptNotes: string;
  rejectNotes?: string;
  referenceImages?: string[];
  minConfidence?: number;
}

export interface HuntStop {
  id: string;
  chapterTitle: string;
  locationLabel: string;
  narrative: string;
  riddle: string;
  nudgeHint: string;
  successNote: string;
  verification: StopVerificationSpec;
}

export interface HuntConfig {
  id: string;
  title: string;
  subtitle: string;
  venueName: string;
  city: string;
  welcomeCopy: string;
  maxWinners: number;
  claimPrefix: string;
  finaleTitle: string;
  finaleStory: string;
  prizeInstructions: string;
  stops: HuntStop[];
}

export interface PublicHuntStop {
  index: number;
  totalStops: number;
  id: string;
  chapterTitle: string;
  locationLabel: string;
  narrative: string;
  riddle: string;
}

export interface PublicHuntPackSummary {
  id: string;
  title: string;
  subtitle: string;
  venueName: string;
  city: string;
  totalStops: number;
  maxWinners: number;
}

export interface PublicHuntInfo {
  id: string;
  title: string;
  subtitle: string;
  venueName: string;
  city: string;
  welcomeCopy: string;
  totalStops: number;
  maxWinners: number;
  prizesRemaining: number;
  finishersCount: number;
  allowSwitch: boolean;
  availablePacks: PublicHuntPackSummary[];
}

export interface FinisherRecord {
  sessionId: string;
  playerName: string;
  huntId: string;
  rank: number;
  isPrizeWinner: boolean;
  claimCode: string | null;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  redeemed: boolean;
  redeemedAt: string | null;
}

export interface ActiveSessionRecord {
  sessionId: string;
  playerName: string;
  huntId: string;
  startedAt: string;
  currentStopIndex: number;
  attemptsOnCurrentStop: number;
  lastActiveAt: string;
}

export interface ProgressTokenPayload {
  v: 1;
  sessionId: string;
  playerName: string;
  huntId: string;
  currentStopIndex: number;
  completedStopIds: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface VisionVerdict {
  matched: boolean;
  confidence: number;
  observed: string;
  feedback: string;
  rawModel?: string;
}
