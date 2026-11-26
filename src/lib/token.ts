import crypto from "node:crypto";
import type { ProgressTokenPayload } from "@/lib/types";

const globalForSecret = globalThis as typeof globalThis & {
  __scavengerDevSecret?: string;
};

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;

  if (!globalForSecret.__scavengerDevSecret) {
    globalForSecret.__scavengerDevSecret = crypto.randomBytes(32).toString("hex");
  }
  return globalForSecret.__scavengerDevSecret;
}

function signData(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function signProgressToken(payload: ProgressTokenPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = signData(encodedPayload, getSessionSecret());
  return `${encodedPayload}.${signature}`;
}

export function verifyProgressToken(token: string): ProgressTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signData(encodedPayload, getSessionSecret());
  const sigBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expectedSignature, "utf8");

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as ProgressTokenPayload;

    if (
      parsed.v !== 1 ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.playerName !== "string" ||
      typeof parsed.huntId !== "string" ||
      typeof parsed.currentStopIndex !== "number" ||
      !Array.isArray(parsed.completedStopIds) ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function verifyAdminPin(candidate: string | null): boolean {
  const expected = process.env.ADMIN_PIN?.trim() || "2026";
  if (!candidate) return false;

  const a = Buffer.from(candidate.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
