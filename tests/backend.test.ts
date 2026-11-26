import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { verifyStopPhoto } from "../src/lib/gemini";
import { getPublicStop, resolveHunt } from "../src/lib/hunts";
import {
  getLeaderboardState,
  recordFinisher,
  resetHuntState
} from "../src/lib/store";
import { signProgressToken, verifyProgressToken } from "../src/lib/token";

function loadEnvLocalIfNeeded(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Renders a recognizable 240x240 PNG illustration of a terracotta ceramic coffee mug
 * with handle, dark coffee rim, and rising steam on a warm cream surface.
 */
function renderCoffeeMugPngBase64(): string {
  const w = 240;
  const h = 240;
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(stride * h);

  const setPixel = (
    x: number,
    y: number,
    r: number,
    g: number,
    b: number
  ) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * stride + 1 + x * 4;
    raw[idx] = r;
    raw[idx + 1] = g;
    raw[idx + 2] = b;
    raw[idx + 3] = 255;
  };

  for (let y = 0; y < h; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x += 1) {
      // Warm cream tabletop background below y=160, lighter wall above
      if (y > 165) {
        setPixel(x, y, 224, 212, 194);
      } else {
        setPixel(x, y, 248, 244, 236);
      }
    }
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // Handle loop on right side
      const hx = (x - 160) / 26;
      const hy = (y - 128) / 28;
      const hd = Math.hypot(hx, hy);
      if (x >= 152 && hd >= 0.62 && hd <= 1.0) {
        setPixel(x, y, 168, 72, 46);
      }

      // Mug body (rounded cylinder x=68..156, y=82..178)
      if (x >= 68 && x <= 156 && y >= 84 && y <= 178) {
        const shade = x > 132 ? -18 : x < 84 ? 12 : 0;
        setPixel(x, y, 184 + shade, 82 + shade, 54 + shade);
      }

      // Mug bottom ellipse
      const bx = (x - 112) / 44;
      const by = (y - 178) / 11;
      if (bx * bx + by * by <= 1.0) {
        setPixel(x, y, 168, 72, 46);
      }

      // Mug rim & coffee ellipse
      const rx = (x - 112) / 44;
      const ry = (y - 84) / 13;
      const rd = rx * rx + ry * ry;
      if (rd <= 1.0) {
        if (rd > 0.72) {
          setPixel(x, y, 238, 228, 214);
        } else {
          setPixel(x, y, 68, 42, 26);
        }
      }

      // Soft steam wisps above rim
      const steam1X = 96 + Math.sin(y * 0.14) * 5;
      const steam2X = 124 + Math.cos(y * 0.14) * 5;
      if (y >= 32 && y <= 66) {
        if (Math.abs(x - steam1X) < 2.2 || Math.abs(x - steam2X) < 2.2) {
          setPixel(x, y, 195, 186, 174);
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return png.toString("base64");
}

test("getPublicStop strips verification secrets, hints, and propRevealNote while keeping public twists", () => {
  const hunt = resolveHunt("home-test");
  const stop0 = getPublicStop(hunt, 0);
  assert.ok(stop0);
  assert.equal(stop0.id, "mirror");
  assert.equal(stop0.challengeType, "action-combo");
  assert.ok(stop0.actionPrompt && stop0.actionPrompt.length > 0);
  assert.equal("verification" in stop0, false);
  assert.equal("nudgeHint" in stop0, false);
  assert.equal("successNote" in stop0, false);
  assert.equal("propRevealNote" in stop0, false);

  const stop3 = getPublicStop(hunt, 3);
  assert.ok(stop3);
  assert.equal(stop3.challengeType, "visual-crop");
  assert.equal(stop3.clueImage, "/clues/home-book-pages.svg");
});

test("HMAC progress tokens reject tampering", () => {
  process.env.SESSION_SECRET = "test-secret-for-angana-courtyard";
  const token = signProgressToken({
    v: 1,
    sessionId: "sess-1",
    playerName: "Aarav & Meera",
    huntId: "home-test",
    currentStopIndex: 0,
    completedStopIds: [],
    startedAt: new Date().toISOString()
  });

  const valid = verifyProgressToken(token);
  assert.ok(valid);
  assert.equal(valid.currentStopIndex, 0);

  // Tamper payload to jump to stop 5
  const [, sig] = token.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({
      ...valid,
      currentStopIndex: 5
    }),
    "utf8"
  ).toString("base64url");

  assert.equal(verifyProgressToken(`${forgedPayload}.${sig}`), null);
});

test("atomic first-5 winner lock handles 20 concurrent finishers cleanly", async () => {
  const tmpStore = path.join(
    os.tmpdir(),
    `scavenger-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  process.env.SCAVENGER_STORE_PATH = tmpStore;

  try {
    await resetHuntState("home-test");
    const startedAt = new Date(Date.now() - 120_000).toISOString();

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordFinisher({
          sessionId: `concurrent-guest-${i}`,
          playerName: `Guest ${i + 1}`,
          huntId: "home-test",
          claimPrefix: "HOM",
          startedAt,
          finishedAt: new Date().toISOString(),
          maxWinners: 5,
          nudgesUsed: i % 2
        })
      )
    );

    const winners = results.filter((r) => r.isPrizeWinner);
    const nonWinners = results.filter((r) => !r.isPrizeWinner);

    assert.equal(winners.length, 5);
    assert.equal(nonWinners.length, 15);
    assert.equal(
      results.filter((r) => r.pureSleuth).length,
      10
    );
    for (const r of results) {
      assert.equal(r.pureSleuth, (r.nudgesUsed ?? 0) === 0);
    }

    const ranks = new Set(results.map((r) => r.rank));
    assert.equal(ranks.size, 20);

    const codes = new Set(winners.map((w) => w.claimCode));
    assert.equal(codes.size, 5);
    for (const w of winners) {
      assert.match(w.claimCode ?? "", /^HOM-0[1-5]-[A-Z0-9]{4}$/);
    }
    for (const nw of nonWinners) {
      assert.equal(nw.claimCode, null);
    }

    // Re-recording an existing winner is strictly idempotent
    const replay = await recordFinisher({
      sessionId: winners[0].sessionId,
      playerName: winners[0].playerName,
      huntId: "home-test",
      claimPrefix: "HOM",
      startedAt,
      finishedAt: new Date().toISOString(),
      maxWinners: 5
    });
    assert.equal(replay.rank, winners[0].rank);
    assert.equal(replay.claimCode, winners[0].claimCode);

    const snapshot = await getLeaderboardState("home-test", 5);
    assert.equal(snapshot.prizesRemaining, 0);
    assert.equal(snapshot.finishers.length, 20);
  } finally {
    delete process.env.SCAVENGER_STORE_PATH;
    if (fs.existsSync(tmpStore)) {
      fs.unlinkSync(tmpStore);
    }
  }
});

test("live Gemini Vision API verifies matching coffee mug and rejects wrong stop", async (t) => {
  loadEnvLocalIfNeeded();
  if (!process.env.GEMINI_API_KEY) {
    t.skip("GEMINI_API_KEY not configured");
    return;
  }

  const hunt = resolveHunt("home-test");
  const mugStop = hunt.stops.find((s) => s.id === "vessel");
  const plantStop = hunt.stops.find((s) => s.id === "foliage");
  assert.ok(mugStop);
  assert.ok(plantStop);

  const mugPngBase64 = renderCoffeeMugPngBase64();

  const matchResult = await verifyStopPhoto({
    hunt,
    stop: mugStop,
    imageBase64: mugPngBase64,
    mimeType: "image/png",
    attemptNumber: 1
  });
  assert.equal(matchResult.matched, true, JSON.stringify(matchResult));
  assert.ok(matchResult.confidence >= 0.65);
  assert.ok(matchResult.feedback.length > 5);

  const mismatchResult = await verifyStopPhoto({
    hunt,
    stop: plantStop,
    imageBase64: mugPngBase64,
    mimeType: "image/png",
    attemptNumber: 1
  });
  assert.equal(mismatchResult.matched, false, JSON.stringify(mismatchResult));
  assert.ok(mismatchResult.feedback.length > 5);
});
