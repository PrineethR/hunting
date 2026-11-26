export interface CompressedImageResult {
  base64: string;
  mimeType: "image/jpeg";
  previewUrl: string;
  byteLength: number;
  width: number;
  height: number;
}

/**
 * Resizes mobile camera images (often 6-12 MB) down to <= 1024px JPEG
 * (~80-160 KB) so uploads remain snappy on courtyard cellular data.
 */
export async function compressImageForUpload(
  file: File,
  maxDimension = 1024,
  quality = 0.82
): Promise<CompressedImageResult> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("Could not read the selected image."));
      element.src = objectUrl;
    });

    const scale = Math.min(
      1,
      maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
    );
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Browser canvas context is unavailable.");
    }
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.split(",")[1] ?? "";
    const byteLength = Math.floor((base64.length * 3) / 4);

    return {
      base64,
      mimeType: "image/jpeg",
      previewUrl: dataUrl,
      byteLength,
      width,
      height
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
