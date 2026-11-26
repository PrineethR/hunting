import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ActiveSessionRecord, FinisherRecord } from "@/lib/types";

interface RateLimitBucket {
  windowStartMs: number;
  windowCount: number;
  totalCount: number;
}

interface HuntPersistedBucket {
  sessions: Record<string, ActiveSessionRecord>;
  finishers: FinisherRecord[];
  rateLimits: Record<string, RateLimitBucket>;
}

interface LocalStoreDocument {
  hunts: Record<string, HuntPersistedBucket>;
}

export interface RecordFinisherInput {
  sessionId: string;
  playerName: string;
  huntId: string;
  claimPrefix: string;
  startedAt: string;
  finishedAt: string;
  maxWinners: number;
  nudgesUsed?: number;
}

export interface HuntLeaderboardSnapshot {
  huntId: string;
  maxWinners: number;
  prizesRemaining: number;
  finishers: FinisherRecord[];
  activeSessions: ActiveSessionRecord[];
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 15;
const RATE_MAX_PER_SESSION = 60;

function generateClaimCode(prefix: string, rank: number): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  const rankStr = String(rank).padStart(2, "0");
  return `${prefix.toUpperCase()}-${rankStr}-${suffix}`;
}

function getRedisConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (url && token) {
    return { url: url.replace(/\/+$/, ""), token };
  }
  return null;
}

async function redisCommand<T = unknown>(
  cfg: { url: string; token: string },
  args: Array<string | number>
): Promise<T> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args),
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Redis REST error (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) {
    throw new Error(`Redis error: ${json.error}`);
  }
  return json.result;
}

// ============================================================================
// Local / Node Atomic Store (Mutex + Atomic Rename Persistence)
// ============================================================================

const globalForStore = globalThis as typeof globalThis & {
  __scavengerStoreQueue?: Promise<unknown>;
};

function getStoreFilePath(): string {
  const overridePath = process.env.SCAVENGER_STORE_PATH?.trim();
  if (overridePath) return overridePath;
  return path.join(process.cwd(), ".data", "scavenger-store.json");
}

function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForStore.__scavengerStoreQueue ?? Promise.resolve();
  const next = prev.then(fn, fn);
  globalForStore.__scavengerStoreQueue = next.catch(() => undefined);
  return next;
}

async function readLocalStore(filePath: string): Promise<LocalStoreDocument> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as LocalStoreDocument;
    if (parsed && typeof parsed.hunts === "object") {
      return parsed;
    }
  } catch {
    // Missing or unreadable file starts fresh
  }
  return { hunts: {} };
}

async function writeLocalStore(
  filePath: string,
  doc: LocalStoreDocument
): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2), "utf8");
    await fs.rename(tmpPath, filePath);
  } catch {
    // Fallback to /tmp if workspace directory is read-only
    const fallbackPath = "/tmp/scavenger-store.json";
    const tmpPath = `${fallbackPath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2), "utf8");
    await fs.rename(tmpPath, fallbackPath);
  }
}

function ensureBucket(
  doc: LocalStoreDocument,
  huntId: string
): HuntPersistedBucket {
  if (!doc.hunts[huntId]) {
    doc.hunts[huntId] = {
      sessions: {},
      finishers: [],
      rateLimits: {}
    };
  }
  return doc.hunts[huntId];
}

// ============================================================================
// Public Store Operations
// ============================================================================

export async function registerOrUpdateSession(params: {
  sessionId: string;
  playerName: string;
  huntId: string;
  startedAt: string;
  currentStopIndex: number;
  attemptsOnCurrentStop?: number;
}): Promise<void> {
  const redis = getRedisConfig();
  const nowIso = new Date().toISOString();

  if (redis) {
    const key = `scavenger:sessions:${params.huntId}`;
    const existingRaw = await redisCommand<string | null>(redis, [
      "HGET",
      key,
      params.sessionId
    ]);
    const existing = existingRaw
      ? (JSON.parse(existingRaw) as ActiveSessionRecord)
      : null;

    const updated: ActiveSessionRecord = {
      sessionId: params.sessionId,
      playerName: params.playerName,
      huntId: params.huntId,
      startedAt: params.startedAt,
      currentStopIndex: params.currentStopIndex,
      attemptsOnCurrentStop:
        params.attemptsOnCurrentStop ?? existing?.attemptsOnCurrentStop ?? 0,
      lastActiveAt: nowIso
    };

    await redisCommand(redis, [
      "HSET",
      key,
      params.sessionId,
      JSON.stringify(updated)
    ]);
    return;
  }

  return withStoreLock(async () => {
    const filePath = getStoreFilePath();
    const doc = await readLocalStore(filePath);
    const bucket = ensureBucket(doc, params.huntId);
    const existing = bucket.sessions[params.sessionId];

    bucket.sessions[params.sessionId] = {
      sessionId: params.sessionId,
      playerName: params.playerName,
      huntId: params.huntId,
      startedAt: params.startedAt,
      currentStopIndex: params.currentStopIndex,
      attemptsOnCurrentStop:
        params.attemptsOnCurrentStop ?? existing?.attemptsOnCurrentStop ?? 0,
      lastActiveAt: nowIso
    };

    await writeLocalStore(filePath, doc);
  });
}

export async function getSessionAttempts(
  huntId: string,
  sessionId: string
): Promise<number> {
  const redis = getRedisConfig();
  if (redis) {
    const raw = await redisCommand<string | null>(redis, [
      "HGET",
      `scavenger:sessions:${huntId}`,
      sessionId
    ]);
    if (!raw) return 0;
    const rec = JSON.parse(raw) as ActiveSessionRecord;
    return rec.attemptsOnCurrentStop ?? 0;
  }

  return withStoreLock(async () => {
    const doc = await readLocalStore(getStoreFilePath());
    return doc.hunts[huntId]?.sessions[sessionId]?.attemptsOnCurrentStop ?? 0;
  });
}

export async function checkAndIncrementRateLimit(
  huntId: string,
  sessionId: string
): Promise<RateLimitResult> {
  const now = Date.now();
  const redis = getRedisConfig();

  if (redis) {
    const minKey = `scavenger:rl:min:${huntId}:${sessionId}`;
    const totalKey = `scavenger:rl:tot:${huntId}:${sessionId}`;
    const minCount = await redisCommand<number>(redis, ["INCR", minKey]);
    if (minCount === 1) {
      await redisCommand(redis, ["EXPIRE", minKey, 60]);
    }
    const totalCount = await redisCommand<number>(redis, ["INCR", totalKey]);
    if (totalCount === 1) {
      await redisCommand(redis, ["EXPIRE", totalKey, 86_400]);
    }

    if (minCount > RATE_MAX_PER_WINDOW) {
      return {
        allowed: false,
        retryAfterSeconds: 30,
        reason: "Easy there! Wait a few seconds before snapping another photo."
      };
    }
    if (totalCount > RATE_MAX_PER_SESSION) {
      return {
        allowed: false,
        retryAfterSeconds: 120,
        reason: "Photo verification limit reached for this session."
      };
    }
    return { allowed: true };
  }

  return withStoreLock(async () => {
    const filePath = getStoreFilePath();
    const doc = await readLocalStore(filePath);
    const bucket = ensureBucket(doc, huntId);
    const current = bucket.rateLimits[sessionId] ?? {
      windowStartMs: now,
      windowCount: 0,
      totalCount: 0
    };

    if (now - current.windowStartMs > RATE_WINDOW_MS) {
      current.windowStartMs = now;
      current.windowCount = 0;
    }

    if (current.windowCount >= RATE_MAX_PER_WINDOW) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((RATE_WINDOW_MS - (now - current.windowStartMs)) / 1000)
        ),
        reason: "Easy there! Wait a few seconds before snapping another photo."
      };
    }

    if (current.totalCount >= RATE_MAX_PER_SESSION) {
      return {
        allowed: false,
        retryAfterSeconds: 120,
        reason: "Photo verification limit reached for this session."
      };
    }

    current.windowCount += 1;
    current.totalCount += 1;
    bucket.rateLimits[sessionId] = current;
    await writeLocalStore(filePath, doc);

    return { allowed: true };
  });
}

const LUA_RECORD_FINISHER = `
local finishersKey = KEYS[1]
local orderKey = KEYS[2]
local sessionId = ARGV[1]
local maxWinners = tonumber(ARGV[2])
local payloadJson = ARGV[3]
local claimCodeCandidate = ARGV[4]

local existing = redis.call("HGET", finishersKey, sessionId)
if existing then
  return existing
end

local currentCount = redis.call("LLEN", orderKey)
local rank = currentCount + 1
local isWinner = rank <= maxWinners

local record = cjson.decode(payloadJson)
record["rank"] = rank
record["isPrizeWinner"] = isWinner
if isWinner then
  record["claimCode"] = string.gsub(claimCodeCandidate, "__RANK__", string.format("%02d", rank))
else
  record["claimCode"] = cjson.null
end

local encoded = cjson.encode(record)
redis.call("HSET", finishersKey, sessionId, encoded)
redis.call("RPUSH", orderKey, sessionId)
return encoded
`;

export async function recordFinisher(
  input: RecordFinisherInput
): Promise<FinisherRecord> {
  const startedMs = Date.parse(input.startedAt);
  const finishedMs = Date.parse(input.finishedAt);
  const elapsedMs =
    Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : 0;

  const redis = getRedisConfig();
  if (redis) {
    const finishersKey = `scavenger:finishers:${input.huntId}`;
    const orderKey = `scavenger:order:${input.huntId}`;
    const tempCode = generateClaimCode(input.claimPrefix, 0).replace(
      "-00-",
      "-__RANK__-"
    );
    const nudgesUsed = input.nudgesUsed ?? 0;
    const seedRecord = {
      sessionId: input.sessionId,
      playerName: input.playerName,
      huntId: input.huntId,
      rank: 0,
      isPrizeWinner: false,
      claimCode: null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      elapsedMs,
      nudgesUsed,
      pureSleuth: nudgesUsed === 0,
      redeemed: false,
      redeemedAt: null
    };

    const resultJson = await redisCommand<string>(redis, [
      "EVAL",
      LUA_RECORD_FINISHER,
      2,
      finishersKey,
      orderKey,
      input.sessionId,
      input.maxWinners,
      JSON.stringify(seedRecord),
      tempCode
    ]);
    return JSON.parse(resultJson) as FinisherRecord;
  }

  return withStoreLock(async () => {
    const filePath = getStoreFilePath();
    const doc = await readLocalStore(filePath);
    const bucket = ensureBucket(doc, input.huntId);

    const existing = bucket.finishers.find(
      (f) => f.sessionId === input.sessionId
    );
    if (existing) {
      return existing;
    }

    const rank = bucket.finishers.length + 1;
    const isPrizeWinner = rank <= input.maxWinners;
    const nudgesUsed = input.nudgesUsed ?? 0;
    const record: FinisherRecord = {
      sessionId: input.sessionId,
      playerName: input.playerName,
      huntId: input.huntId,
      rank,
      isPrizeWinner,
      claimCode: isPrizeWinner
        ? generateClaimCode(input.claimPrefix, rank)
        : null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      elapsedMs,
      nudgesUsed,
      pureSleuth: nudgesUsed === 0,
      redeemed: false,
      redeemedAt: null
    };

    bucket.finishers.push(record);
    await writeLocalStore(filePath, doc);
    return record;
  });
}

export async function getFinisherBySession(
  huntId: string,
  sessionId: string
): Promise<FinisherRecord | null> {
  const redis = getRedisConfig();
  if (redis) {
    const raw = await redisCommand<string | null>(redis, [
      "HGET",
      `scavenger:finishers:${huntId}`,
      sessionId
    ]);
    return raw ? (JSON.parse(raw) as FinisherRecord) : null;
  }

  return withStoreLock(async () => {
    const doc = await readLocalStore(getStoreFilePath());
    const bucket = doc.hunts[huntId];
    if (!bucket) return null;
    return bucket.finishers.find((f) => f.sessionId === sessionId) ?? null;
  });
}

export async function getLeaderboardState(
  huntId: string,
  maxWinners: number
): Promise<HuntLeaderboardSnapshot> {
  const redis = getRedisConfig();
  if (redis) {
    const finishersKey = `scavenger:finishers:${huntId}`;
    const orderKey = `scavenger:order:${huntId}`;
    const sessionsKey = `scavenger:sessions:${huntId}`;

    const [orderIds, finishersRaw, sessionsRaw] = await Promise.all([
      redisCommand<string[]>(redis, ["LRANGE", orderKey, 0, -1]),
      redisCommand<string[]>(redis, ["HVALS", finishersKey]),
      redisCommand<string[]>(redis, ["HVALS", sessionsKey])
    ]);

    const byId = new Map<string, FinisherRecord>();
    for (const raw of finishersRaw) {
      const parsed = JSON.parse(raw) as FinisherRecord;
      byId.set(parsed.sessionId, parsed);
    }

    const finishers = orderIds
      .map((id) => byId.get(id))
      .filter((x): x is FinisherRecord => Boolean(x))
      .sort((a, b) => a.rank - b.rank);

    const activeSessions = sessionsRaw
      .map((raw) => JSON.parse(raw) as ActiveSessionRecord)
      .sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));

    const winnersTaken = finishers.filter((f) => f.isPrizeWinner).length;
    return {
      huntId,
      maxWinners,
      prizesRemaining: Math.max(0, maxWinners - winnersTaken),
      finishers,
      activeSessions
    };
  }

  return withStoreLock(async () => {
    const doc = await readLocalStore(getStoreFilePath());
    const bucket = doc.hunts[huntId] ?? {
      sessions: {},
      finishers: [],
      rateLimits: {}
    };

    const finishers = [...bucket.finishers].sort((a, b) => a.rank - b.rank);
    const activeSessions = Object.values(bucket.sessions).sort(
      (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)
    );
    const winnersTaken = finishers.filter((f) => f.isPrizeWinner).length;

    return {
      huntId,
      maxWinners,
      prizesRemaining: Math.max(0, maxWinners - winnersTaken),
      finishers,
      activeSessions
    };
  });
}

export async function markPrizeRedeemed(
  huntId: string,
  sessionId: string,
  redeemed: boolean
): Promise<FinisherRecord | null> {
  const nowIso = redeemed ? new Date().toISOString() : null;
  const redis = getRedisConfig();

  if (redis) {
    const key = `scavenger:finishers:${huntId}`;
    const raw = await redisCommand<string | null>(redis, [
      "HGET",
      key,
      sessionId
    ]);
    if (!raw) return null;
    const record = JSON.parse(raw) as FinisherRecord;
    record.redeemed = redeemed;
    record.redeemedAt = nowIso;
    await redisCommand(redis, [
      "HSET",
      key,
      sessionId,
      JSON.stringify(record)
    ]);
    return record;
  }

  return withStoreLock(async () => {
    const filePath = getStoreFilePath();
    const doc = await readLocalStore(filePath);
    const bucket = doc.hunts[huntId];
    if (!bucket) return null;

    const target = bucket.finishers.find((f) => f.sessionId === sessionId);
    if (!target) return null;

    target.redeemed = redeemed;
    target.redeemedAt = nowIso;
    await writeLocalStore(filePath, doc);
    return target;
  });
}

export async function resetHuntState(huntId: string): Promise<void> {
  const redis = getRedisConfig();
  if (redis) {
    await Promise.all([
      redisCommand(redis, ["DEL", `scavenger:finishers:${huntId}`]),
      redisCommand(redis, ["DEL", `scavenger:order:${huntId}`]),
      redisCommand(redis, ["DEL", `scavenger:sessions:${huntId}`])
    ]);
    return;
  }

  return withStoreLock(async () => {
    const filePath = getStoreFilePath();
    const doc = await readLocalStore(filePath);
    delete doc.hunts[huntId];
    await writeLocalStore(filePath, doc);
  });
}
