import sharp from 'sharp';

/**
 * Image preprocessing for Anthropic vision API.
 *
 * Anthropic's limit: no image dimension may exceed 8000 pixels.
 * Our screenshots come from Apify Playwright (full-page captures) which
 * routinely exceed this — a long homepage can be 15000+ px tall.
 *
 * Background: bug found 2026-04-07 — "Atomic analysis failed for Oral B:
 * image dimensions exceed max allowed size: 8000 pixels" for full-page
 * website screenshots. We now defensively resize ALL images before sending
 * them to Claude.
 */

/** Safe margin below Anthropic's hard limit — leaves headroom for edge cases */
const MAX_DIMENSION_PX = 7500;

/** Minimum useful image dimension — smaller than this, we skip (no useful content) */
const MIN_DIMENSION_PX = 32;

export interface ResizeResult {
  base64: string;
  /** Whether the image was actually resized */
  resized: boolean;
  /** Original dimensions (before resize) */
  originalWidth: number;
  originalHeight: number;
  /** Final dimensions (same as original if not resized) */
  width: number;
  height: number;
  /** Format detected by sharp (png, jpeg, webp, …) */
  format: string;
}

/**
 * Resize a base64-encoded image if any dimension exceeds MAX_DIMENSION_PX.
 * Preserves aspect ratio. Returns JPEG output for resized images (smaller
 * payload for Claude) and passes through the original base64 if no resize
 * was needed (keeps original format/quality).
 *
 * Throws only if the image is fundamentally unreadable — caller should
 * handle this gracefully (e.g. skip sending to Claude, continue with text).
 */
export async function resizeBase64IfTooLarge(base64: string): Promise<ResizeResult> {
  const buffer = Buffer.from(base64, 'base64');
  const image = sharp(buffer, { failOn: 'none' });
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;
  const format = metadata.format ?? 'unknown';

  // Unreadable image — sharp couldn't even parse dimensions
  if (!originalWidth || !originalHeight) {
    throw new Error(`unreadable image (format=${format}, buffer=${buffer.length}B)`);
  }

  // Too small to be useful — likely a corrupt or placeholder image
  if (originalWidth < MIN_DIMENSION_PX || originalHeight < MIN_DIMENSION_PX) {
    throw new Error(
      `image too small (${originalWidth}x${originalHeight}, min=${MIN_DIMENSION_PX})`
    );
  }

  // Fast path: within limits, no resize needed — return original untouched
  if (originalWidth <= MAX_DIMENSION_PX && originalHeight <= MAX_DIMENSION_PX) {
    return {
      base64,
      resized: false,
      originalWidth,
      originalHeight,
      width: originalWidth,
      height: originalHeight,
      format,
    };
  }

  // Resize path: scale longest dimension to MAX_DIMENSION_PX, preserve aspect
  const resizedBuffer = await sharp(buffer, { failOn: 'none' })
    .resize(MAX_DIMENSION_PX, MAX_DIMENSION_PX, {
      fit: 'inside',          // preserve aspect ratio, fit within bounds
      withoutEnlargement: true, // never upscale
    })
    // Convert to JPEG for smaller payload — OK for screenshots, we're sending
    // to vision model, not archiving. Quality 85 = good balance.
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const resizedMeta = await sharp(resizedBuffer).metadata();

  return {
    base64: resizedBuffer.toString('base64'),
    resized: true,
    originalWidth,
    originalHeight,
    width: resizedMeta.width ?? 0,
    height: resizedMeta.height ?? 0,
    format: 'jpeg',
  };
}
