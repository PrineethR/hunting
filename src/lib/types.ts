export type ChallengeType =
  | "riddle"
  | "action-combo"
  | "visual-crop"
  | "composition"
  | "social";

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
  challengeType?: ChallengeType;
  narrative: string;
  riddle: string;
  clueImage?: string;
  clueImageCaption?: string;
  actionPrompt?: string;
  nudgeHint: string;
  successNote: string;
  propRevealNote?: string;
  verification: StopVerificationSpec;
}

export interface HuntConfig {
  id: string;
  title: string;
  subtitle: string;
  venueName: string;
  city: string;
  welcomeCopy: string;
  hostPersona: string;
  maxNudges: number;
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
  challengeType?: ChallengeType;
  narrative: string;
  riddle: string;
  clueImage?: string;
  clueImageCaption?: string;
  actionPrompt?: string;
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
  maxNudges: number;
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
  nudgesUsed?: number;
  pureSleuth?: boolean;
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
  nudgesUsed?: number;
  unlockedHintStopIds?: string[];
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
