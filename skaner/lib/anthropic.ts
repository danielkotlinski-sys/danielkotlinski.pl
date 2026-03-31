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
        content: prompt + '\n\nOdpowiedz WYŁĄCZNIE poprawnym JSON. Bez komentarzy, bez tekstu przed ani po JSON.',
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

export async function analyzePostVision(
  screenshotBase64: string,
  caption: string,
  prompt: string
): Promise<string> {
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
              media_type: 'image/png',
              data: screenshotBase64,
            },
          },
          {
            type: 'text',
            text: `${prompt}\n\nCaption posta: "${caption}"\n\nOdpowiedz WYŁĄCZNIE poprawnym JSON. Bez komentarzy, bez tekstu przed ani po JSON.`,
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
  // Strip markdown code fences
  let cleaned = text
    .replace(/^```json\s*/gm, '')
    .replace(/^```\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim();

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // Remove single-line comments
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');

  return JSON.parse(cleaned);
}
