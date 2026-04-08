import Anthropic from '@anthropic-ai/sdk';
import type { ScanCostTracker } from './costs';
import { resizeBase64IfTooLarge } from './image';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type ClaudeModel = 'claude-sonnet-4-5' | 'claude-opus-4-5' | 'claude-haiku-4-5-20251001';

function resolveModel(requested: ClaudeModel): ClaudeModel {
  if (process.env.SCAN_MODE === 'test') return 'claude-haiku-4-5-20251001';
  return requested;
}

export async function runPrompt(
  prompt: string,
  model: 'claude-sonnet-4-5' | 'claude-opus-4-5' | 'claude-haiku-4-5-20251001' = 'claude-sonnet-4-5',
  costTracker?: ScanCostTracker,
  operationLabel?: string
): Promise<string> {
  const effectiveModel = resolveModel(model);
  const response = await anthropic.messages.create({
    model: effectiveModel,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: prompt + '\n\nWAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnych komentarzy (//), żadnego tekstu przed ani po JSON. Żadnych trailing commas. NIE używaj polskich cudzysłowów „" — jeśli cytujesz, użyj pojedynczych cudzysłowów lub apostrofów. Tylko czysty, parsable JSON.',
      },
      {
        role: 'assistant',
        content: '{',
      },
    ],
  });

  if (costTracker && response.usage) {
    costTracker.trackAnthropic(
      effectiveModel,
      operationLabel || 'prompt',
      response.usage.input_tokens,
      response.usage.output_tokens
    );
  }

  const block = response.content[0];
  if (block.type === 'text') return '{' + block.text;
  return '';
}

function detectMediaType(base64: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lG')) return 'image/gif';
  if (base64.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg'; // default
}

export async function analyzePostVision(
  screenshotBase64: string,
  caption: string,
  prompt: string,
  costTracker?: ScanCostTracker,
  operationLabel?: string
): Promise<string> {
  // Defensive resize — Anthropic rejects images with any dimension > 8000 px.
  // Apify Playwright full-page screenshots routinely exceed this (15000+ px tall).
  // We resize to ≤ 7500 px per dimension (headroom for safety) preserving aspect.
  // If the image is fundamentally unreadable, we skip the image input entirely
  // and let Claude answer from prompt text alone — better than throwing 400.
  let processedBase64 = screenshotBase64;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = detectMediaType(screenshotBase64);
  let imageAvailable = true;

  try {
    const result = await resizeBase64IfTooLarge(screenshotBase64);
    processedBase64 = result.base64;
    if (result.resized) {
      console.log(
        `[vision] resized image for "${operationLabel || 'vision'}": ` +
        `${result.originalWidth}x${result.originalHeight} → ${result.width}x${result.height} (${result.format})`
      );
      // Resized output is always JPEG
      mediaType = 'image/jpeg';
    }
  } catch (err) {
    // Image unreadable / too small / corrupt — proceed WITHOUT image.
    // The analysis will be less accurate but the scan won't fail.
    imageAvailable = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[vision] skipping unreadable image for "${operationLabel || 'vision'}": ${msg}`);
  }

  const effectiveModel = resolveModel('claude-sonnet-4-5');
  const textContent = imageAvailable
    ? `${prompt}\n\nCaption posta: "${caption}"\n\nWAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnych komentarzy (//), żadnego tekstu. Tylko czysty JSON.`
    : `${prompt}\n\nCaption posta: "${caption}"\n\nUWAGA: Obraz nie był dostępny do analizy — oprzyj odpowiedź wyłącznie na captionie i opisie zadania. Dla pól wymagających obserwacji wizualnych zwróć neutralny opis oparty na captionie.\n\nWAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnych komentarzy (//), żadnego tekstu. Tylko czysty JSON.`;

  const userContent: Anthropic.MessageParam['content'] = imageAvailable
    ? [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: processedBase64,
          },
        },
        { type: 'text', text: textContent },
      ]
    : [{ type: 'text', text: textContent }];

  const response = await anthropic.messages.create({
    model: effectiveModel,
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
      {
        role: 'assistant',
        content: '{',
      },
    ],
  });

  if (costTracker && response.usage) {
    costTracker.trackAnthropic(
      effectiveModel,
      operationLabel || 'vision',
      response.usage.input_tokens,
      response.usage.output_tokens
    );
  }

  const block = response.content[0];
  if (block.type === 'text') return '{' + block.text;
  return '';
}

export function parseJsonResponse<T>(text: string): T {
  let cleaned = text;

  // Strip everything before first { and after last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // Replace ALL typographic/smart quotes with plain single quotes.
  // Single quotes are valid inside JSON string values and don't interfere with JSON syntax.
  // Covers: „ " " « » ' ' ″ (all Unicode quote variants)
  cleaned = cleaned.replace(/[\u201E\u201C\u201D\u00AB\u00BB\u2018\u2019\u2033]/g, "'");

  // Remove single-line comments (// ...) but not inside strings
  cleaned = cleaned.replace(/(?<!["\w:\/])\/\/[^\n]*/g, '');

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // Remove any remaining markdown artifacts
  cleaned = cleaned.replace(/```/g, '');

  // Remove control characters
  cleaned = cleaned.replace(/[\x00-\x1F]/g, (ch) => ch === '\n' || ch === '\t' ? ch : ' ');

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Aggressive cleanup: remove comment lines, fix trailing commas
    cleaned = cleaned
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

    try {
      return JSON.parse(cleaned);
    } catch {
      console.error('JSON parse failed after all cleanup attempts. First 500 chars:', cleaned.slice(0, 500));
      throw firstError;
    }
  }
}
