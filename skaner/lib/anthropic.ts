import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runPrompt(
  prompt: string,
  model: 'claude-sonnet-4-5' | 'claude-opus-4-5' = 'claude-sonnet-4-5'
): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: prompt + '\n\nWAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnych komentarzy (//), żadnego tekstu przed ani po JSON. Żadnych trailing commas. Tylko czysty, parsable JSON.',
      },
      {
        role: 'assistant',
        content: '{',
      },
    ],
  });

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
  prompt: string
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

  // Remove single-line comments (// ...) but not inside strings
  cleaned = cleaned.replace(/(?<!["\w:\/])\/\/[^\n]*/g, '');

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // Remove any remaining markdown artifacts
  cleaned = cleaned.replace(/```/g, '');

  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: try even more aggressive cleanup
    // Remove all lines that look like comments
    cleaned = cleaned
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    // Remove trailing commas again after line removal
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

    return JSON.parse(cleaned);
  }
}
