/**
 * Shared Gemini video utilities — download via yt-dlp, upload to Gemini File API,
 * wait for processing, analyze with Gemini Flash.
 *
 * Used by:
 *   - phases/video.ts (IG Reels + TikTok brand content)
 *   - phases/youtube-reviews.ts (YouTube review videos)
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const TMP_DIR = '/tmp/catscan-video';

// ---------------------------------------------------------------------------
// Temp dir + file cleanup
// ---------------------------------------------------------------------------

export function ensureTmpDir() {
  execSync(`mkdir -p ${TMP_DIR}`);
}

export function cleanupFile(path: string) {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// yt-dlp download
// ---------------------------------------------------------------------------

export function downloadVideo(url: string, maxFilesize = '50M', timeout = 60000): string | null {
  const filename = `${randomUUID()}.mp4`;
  const outPath = join(TMP_DIR, filename);

  try {
    execSync(
      `yt-dlp --no-playlist --max-filesize ${maxFilesize} --socket-timeout 30 ` +
      `-f "best[ext=mp4][filesize<${maxFilesize}]/best[ext=mp4]/best" ` +
      `-o "${outPath}" "${url}" 2>/dev/null`,
      { timeout }
    );

    if (existsSync(outPath) && statSync(outPath).size > 0) {
      return outPath;
    }
    return null;
  } catch {
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch { /* ignore */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini File API — resumable upload
// ---------------------------------------------------------------------------

export function uploadToGemini(filePath: string, apiKey: string): string | null {
  try {
    const fileSize = statSync(filePath).size;
    const mimeType = 'video/mp4';

    // Start resumable upload
    const initResult = execSync(
      `curl -s -X POST ` +
      `"https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}" ` +
      `-H "X-Goog-Upload-Protocol: resumable" ` +
      `-H "X-Goog-Upload-Command: start" ` +
      `-H "X-Goog-Upload-Header-Content-Length: ${fileSize}" ` +
      `-H "X-Goog-Upload-Header-Content-Type: ${mimeType}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"file": {"display_name": "${filePath.split('/').pop()}"}}' ` +
      `-D -`,
      { timeout: 30000 }
    ).toString();

    const uploadUrlMatch = initResult.match(/x-goog-upload-url:\s*(.+)/i);
    if (!uploadUrlMatch) return null;
    const uploadUrl = uploadUrlMatch[1].trim();

    const uploadResult = execSync(
      `curl -s -X POST "${uploadUrl}" ` +
      `-H "Content-Length: ${fileSize}" ` +
      `-H "X-Goog-Upload-Offset: 0" ` +
      `-H "X-Goog-Upload-Command: upload, finalize" ` +
      `--data-binary "@${filePath}"`,
      { timeout: 120000 }
    ).toString();

    const parsed = JSON.parse(uploadResult);
    return parsed?.file?.uri || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini — wait for video processing
// ---------------------------------------------------------------------------

export function waitForGeminiProcessing(fileUri: string, apiKey: string, maxPolls = 30): boolean {
  const fileName = fileUri.split('/').pop();
  for (let i = 0; i < maxPolls; i++) {
    try {
      const result = execSync(
        `curl -s "https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}"`,
        { timeout: 15000 }
      ).toString();
      const parsed = JSON.parse(result);
      if (parsed.state === 'ACTIVE') return true;
      if (parsed.state === 'FAILED') return false;
      execSync('sleep 2');
    } catch {
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gemini Flash — analyze video with custom prompt
// ---------------------------------------------------------------------------

export function analyzeWithGemini(
  fileUri: string,
  apiKey: string,
  prompt: string,
  opts?: { maxOutputTokens?: number; temperature?: number },
): Record<string, unknown> | null {
  const maxTokens = opts?.maxOutputTokens ?? 800;
  const temperature = opts?.temperature ?? 0.1;

  try {
    const body = JSON.stringify({
      contents: [{
        parts: [
          { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    });

    const tmpBody = join(TMP_DIR, `req-${randomUUID()}.json`);
    writeFileSync(tmpBody, body);

    const result = execSync(
      `curl -s -X POST ` +
      `"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}" ` +
      `-H "Content-Type: application/json" ` +
      `-d @${tmpBody}`,
      { timeout: 90000 }
    ).toString();

    cleanupFile(tmpBody);

    const parsed = JSON.parse(result);
    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sonnet aggregation helper
// ---------------------------------------------------------------------------

export function callSonnet(
  prompt: string,
  apiKey: string,
  maxTokens = 1500,
): Record<string, unknown> | null {
  try {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const tmpBody = join(TMP_DIR, `sonnet-${randomUUID()}.json`);
    writeFileSync(tmpBody, body);

    const result = execSync(
      `curl -s -X POST https://api.anthropic.com/v1/messages ` +
      `-H "Content-Type: application/json" ` +
      `-H "x-api-key: ${apiKey}" ` +
      `-H "anthropic-version: 2023-06-01" ` +
      `-d @${tmpBody}`,
      { timeout: 60000 }
    ).toString();

    cleanupFile(tmpBody);

    const parsed = JSON.parse(result);
    const text = parsed?.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
}
