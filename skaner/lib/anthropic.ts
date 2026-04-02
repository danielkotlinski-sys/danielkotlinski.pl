import Anthropic from '@anthropic-ai/sdk';
import type { ScanCostTracker } from './costs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runPrompt(
  prompt: string,
  model: 'claude-sonnet-4-5' | 'claude-opus-4-5' = 'claude-sonnet-4-5',
  costTracker?: ScanCostTracker,
  operationLabel?: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model,
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
      model,
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
  const mediaType = detectMediaType(screenshotBase64);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: screenshotBase64,
            },
          },
          {
            type: 'text',
            text: `${prompt}\n\nCaption posta: "${caption}"\n\nWAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnych komentarzy (//), żadnego tekstu. Tylko czysty JSON.`,
          },
        ],
      },
      {
        role: 'assistant',
        content: '{',
      },
    ],
  });

  if (costTracker && response.usage) {
    costTracker.trackAnthropic(
      'claude-sonnet-4-5',
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

  // Replace Polish/typographic quotes with safe alternatives BEFORE parsing
  // „ (U+201E), " (U+201D), " (U+201C) → «» or just remove
  cleaned = cleaned.replace(/\u201E/g, '«');  // „ → «
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '»');  // " " → »

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
