/**
 * Claude API connector — used for LLM extraction and interpretation
 * Haiku for extraction (~$0.005/brand), Sonnet for interpretation
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient() {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

function safeText(response: Anthropic.Message): string {
  if (response.content.length === 0) return '';
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function extract(params: {
  content: string;
  prompt: string;
  model?: string;
}): Promise<unknown> {
  const response = await getClient().messages.create({
    model: params.model || 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `${params.prompt}\n\n---\n\nContent to analyze:\n${params.content}\n\n---\n\nRespond with valid JSON only.`,
      },
    ],
  });

  const text = safeText(response);
  // Handle markdown code blocks
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  return JSON.parse(jsonStr.trim());
}

export async function interpret(params: {
  data: unknown;
  question: string;
}): Promise<string> {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `You are a market intelligence analyst. Based on the following dataset, answer the question.\n\nDataset:\n${JSON.stringify(params.data, null, 2)}\n\nQuestion: ${params.question}`,
      },
    ],
  });

  return safeText(response);
}
