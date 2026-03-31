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
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type === 'text') return block.text;
  return '';
}

export async function analyzePostVision(
  screenshotBase64: string,
  caption: string,
  prompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
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
            text: `${prompt}\n\nCaption posta: "${caption}"`,
          },
        ],
      },
    ],
  });

  const block = response.content[0];
  if (block.type === 'text') return block.text;
  return '';
}

export function parseJsonResponse<T>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  return JSON.parse(cleaned);
}
