export interface KeepsakeShot {
  stopId: string;
  chapterTitle: string;
  locationLabel: string;
  dataUrl: string;
}

/**
 * Downscales a verified preview image to a compact thumbnail so 6-7 shots fit
 * comfortably inside browser localStorage.
 */
export async function createThumbnailDataUrl(
  sourceDataUrl: string,
  maxDimension = 360,
  quality = 0.74
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load verified photo."));
    el.src = sourceDataUrl;
  });

  const scale = Math.min(
    1,
    maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
  );
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;

  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const srcRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const dstRatio = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (srcRatio > dstRatio) {
    sw = img.naturalHeight * dstRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Composes an editorial 2-column warm-paper keepsake photo strip PNG in the browser.
 */
export async function renderKeepsakeStripPng(params: {
  title: string;
  venueName: string;
  city: string;
  playerName: string;
  rank: number;
  pureSleuth?: boolean;
  shots: KeepsakeShot[];
}): Promise<string> {
  const width = 900;
  const padX = 48;
  const headerH = 164;
  const footerH = 72;
  const gap = 24;
  const cols = 2;
  const cardW = (width - padX * 2 - gap) / cols;
  const imgH = 260;
  const captionH = 54;
  const cardH = imgH + captionH;
  const rows = Math.max(1, Math.ceil(params.shots.length / cols));
  const height = headerH + rows * cardH + Math.max(0, rows - 1) * gap + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  // Warm cotton paper ground
  ctx.fillStyle = "#faf6ef";
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural outer hairline
  ctx.strokeStyle = "#ddd3c3";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Header
  ctx.fillStyle = "#8a5a44";
  ctx.font = "500 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(
    `${params.venueName.toUpperCase()} · ${params.city.toUpperCase()}`,
    padX,
    66
  );

  ctx.fillStyle = "#2b2019";
  ctx.font = "400 38px Georgia, serif";
  ctx.fillText(params.title, padX, 108);

  const badgeParts = [
    params.playerName,
    `Finisher #${params.rank}`,
    params.pureSleuth ? "No-Hint Sleuth" : null
  ]
    .filter(Boolean)
    .join("   ·   ");
  ctx.fillStyle = "#6c5d51";
  ctx.font = "500 18px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(badgeParts, padX, 140);

  // Divider
  ctx.strokeStyle = "#ddd3c3";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, 154);
  ctx.lineTo(width - padX, 154);
  ctx.stroke();

  // Render shots
  for (let i = 0; i < params.shots.length; i += 1) {
    const shot = params.shots[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cardW + gap);
    const y = headerH + 14 + row * (cardH + gap);

    ctx.fillStyle = "#fffdf9";
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = "#dfd5c6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, cardW, cardH);

    try {
      const img = await loadImage(shot.dataUrl);
      drawCoverImage(ctx, img, x + 8, y + 8, cardW - 16, imgH - 12);
    } catch {
      ctx.fillStyle = "#efe8dc";
      ctx.fillRect(x + 8, y + 8, cardW - 16, imgH - 12);
    }

    ctx.fillStyle = "#b05136";
    ctx.font = "500 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(shot.chapterTitle.toUpperCase(), x + 12, y + imgH + 18);

    ctx.fillStyle = "#2b2019";
    ctx.font = "500 16px Georgia, serif";
    ctx.fillText(shot.locationLabel, x + 12, y + imgH + 40);
  }

  // Footer
  ctx.fillStyle = "#7a6c5e";
  ctx.font = "400 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(
    `Trail Keepsake · ${new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    })}`,
    padX,
    height - 34
  );

  return canvas.toDataURL("image/png");
}
