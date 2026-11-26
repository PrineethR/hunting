import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import type { HuntConfig, HuntStop, VisionVerdict } from "@/lib/types";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic"
]);

export function getConfidenceThreshold(
  stop: HuntStop,
  attemptNumber: number
): number {
  const base = stop.verification.minConfidence ?? 0.65;
  if (attemptNumber >= 3) {
    return Math.max(0.55, Number((base - 0.08).toFixed(2)));
  }
  return base;
}

export function buildGeminiVerifyPrompt(params: {
  hunt: HuntConfig;
  stop: HuntStop;
  attemptNumber: number;
  hasReferenceImages: boolean;
}): string {
  const { hunt, stop, attemptNumber, hasReferenceImages } = params;

  return [
    `You are the warm, attentive host of a celebratory wedding scavenger hunt at "${hunt.venueName}" in ${hunt.city}.`,
    `A guest is on "${stop.chapterTitle}: ${stop.locationLabel}".`,
    `The riddle they were given is: "${stop.riddle}"`,
    ``,
    `TARGET TO VERIFY:`,
    `- Primary target: ${stop.verification.targetDescription}`,
    `- Accept generously: ${stop.verification.acceptNotes}`,
    stop.verification.rejectNotes
      ? `- Reject if: ${stop.verification.rejectNotes}`
      : null,
    hasReferenceImages
      ? `- Reference venue images are attached before the guest's photo. Judge whether the guest photographed the same real-world object or courtyard spot from any angle or lighting.`
      : null,
    ``,
    `JUDGING RULES:`,
    `1. Real wedding/home phone photos often have warm evening lighting, motion blur, or unusual angles—be generous when the target object or landmark is genuinely present.`,
    `2. Do NOT pass pitch-black frames, unrelated objects, or obvious photos of another screen unless the target itself is genuinely present.`,
    `3. Current guest attempt number on this stop: ${attemptNumber}.`,
    `4. Keep "feedback" to 1-2 short, warm sentences:`,
    `   - If matched: celebrate briefly with a specific detail you spotted in their photo.`,
    `   - If NOT matched: playfully describe what you see in their photo and give a spoiler-free nudge without naming the exact answer.`
  ]
    .filter(Boolean)
    .join("\n");
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function loadReferenceParts(
  filenames?: string[]
): Promise<Array<{ inlineData: { data: string; mimeType: string } }>> {
  if (!filenames?.length) return [];
  const parts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
  const refsDir = path.join(process.cwd(), "src", "data", "references");

  for (const rawName of filenames) {
    const safeName = path.basename(rawName);
    if (safeName !== rawName) continue;
    const fullPath = path.join(refsDir, safeName);
    try {
      const buf = await fs.readFile(fullPath);
      parts.push({
        inlineData: {
          data: buf.toString("base64"),
          mimeType: mimeFromFilename(safeName)
        }
      });
    } catch {
      // Optional reference image not yet added by venue host
    }
  }
  return parts;
}

export async function verifyStopPhoto(params: {
  hunt: HuntConfig;
  stop: HuntStop;
  imageBase64: string;
  mimeType: string;
  attemptNumber: number;
}): Promise<VisionVerdict & { threshold: number }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const normalizedMime = params.mimeType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`Unsupported image MIME type: ${params.mimeType}`);
  }

  // IMPORTANT: Do NOT set vertexai: true — AQ.* keys here target generativelanguage.googleapis.com
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  const referenceParts = await loadReferenceParts(
    params.stop.verification.referenceImages
  );
  const promptText = buildGeminiVerifyPrompt({
    hunt: params.hunt,
    stop: params.stop,
    attemptNumber: params.attemptNumber,
    hasReferenceImages: referenceParts.length > 0
  });

  const parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  > = [{ text: promptText }];

  for (const refPart of referenceParts) {
    parts.push({ text: "Reference photo of the target:" });
    parts.push(refPart);
  }

  if (referenceParts.length > 0) {
    parts.push({ text: "Guest's submitted photo to verify:" });
  }

  parts.push({
    inlineData: {
      data: params.imageBase64,
      mimeType: normalizedMime
    }
  });

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matched: {
            type: Type.BOOLEAN,
            description: "True if the guest photo genuinely shows the target."
          },
          confidence: {
            type: Type.NUMBER,
            description: "Confidence from 0.0 to 1.0."
          },
          observed: {
            type: Type.STRING,
            description: "Brief neutral description of what appears in the image."
          },
          feedback: {
            type: Type.STRING,
            description:
              "Short warm 1-2 sentence remark for the guest without spoiling the answer if unmatched."
          }
        },
        required: ["matched", "confidence", "observed", "feedback"]
      }
    }
  });

  const rawText = response.text?.trim() ?? "";
  let parsed: VisionVerdict;
  try {
    parsed = JSON.parse(rawText) as VisionVerdict;
  } catch {
    throw new Error(`Gemini returned non-JSON verification response: ${rawText}`);
  }

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
  const threshold = getConfidenceThreshold(params.stop, params.attemptNumber);
  const passed = Boolean(parsed.matched) && confidence >= threshold;

  return {
    matched: passed,
    confidence,
    observed: String(parsed.observed ?? "").trim(),
    feedback: String(parsed.feedback ?? "").trim(),
    rawModel: model,
    threshold
  };
}
