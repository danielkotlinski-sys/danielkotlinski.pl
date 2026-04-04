/** Phase: Extract — Claude Haiku structured extraction from crawled content */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

const EXTRACTION_PROMPT = `You are a market intelligence analyst extracting structured data about a Polish diet catering company from their website content.

Extract the following dimensions. Return ONLY valid JSON, no markdown, no explanation.

{
  "brand_identity": {
    "brand_name": "string — primary brand name",
    "tagline": "string or null",
    "positioning": "string — one sentence: who they target and what they promise",
    "emotional_register": "premium | friendly | clinical | motivational | neutral",
    "language": "pl | en | both"
  },
  "pricing": {
    "price_range_pln": "string — e.g. '45-89 PLN/dzień'",
    "cheapest_daily": "number or null — cheapest daily price in PLN",
    "most_expensive_daily": "number or null",
    "trial_offer": "string or null — description of trial/first order discount",
    "subscription_discount": "boolean or null"
  },
  "menu": {
    "diet_types": ["list of diet names offered, e.g. 'Standard', 'Keto', 'Vege'"],
    "calorie_options": ["list of kcal options, e.g. '1200', '1500', '2000'"],
    "cuisine_style": "string or null — Polish, Mediterranean, Asian, mixed",
    "dietary_restrictions": ["vegan", "gluten-free", "lactose-free", etc.]
  },
  "delivery": {
    "delivery_model": "own_fleet | courier | mixed | unknown",
    "delivery_cities": ["list of main cities or 'cała Polska'"],
    "delivery_time": "string or null — e.g. 'do 6:00 rano'",
    "weekend_delivery": "boolean or null"
  },
  "technology": {
    "has_online_ordering": true,
    "has_mobile_app": "boolean or null",
    "has_meal_customization": "boolean or null",
    "payment_methods": ["list or empty"]
  },
  "social_proof": {
    "testimonials_visible": "boolean",
    "media_mentions": ["list of media names or empty"],
    "certifications": ["list or empty"],
    "dietitian_team": "boolean or null"
  },
  "contact": {
    "city": "string or null — main HQ city",
    "phone": "string or null",
    "email": "string or null",
    "nip": "string or null — if visible on site"
  },
  "unique_differentiator": "string — one sentence: what makes this brand unique vs competitors"
}

Important:
- Use null for fields you cannot determine from the content
- For lists, use empty array [] if no data found
- Prices in PLN only
- All text fields in Polish if the source is Polish
- Be precise, don't hallucinate data not present in the source`;

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export async function extractEntity(entity: EntityRecord): Promise<EntityRecord> {
  if (!entity.rawHtml || entity.status === 'failed') {
    return entity;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ...entity,
      status: 'failed',
      errors: [...entity.errors, 'ANTHROPIC_API_KEY not set — cannot extract'],
    };
  }

  try {
    // Truncate HTML to avoid exceeding context window (~60K chars ≈ ~15K tokens)
    const truncatedContent = (entity.rawHtml || '').slice(0, 60000);

    const requestBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\n--- WEBSITE CONTENT FOR: ${entity.name} (${entity.url}) ---\n\n${truncatedContent}`,
        },
      ],
    };

    const inputFile = `/tmp/extract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
    writeFileSync(inputFile, JSON.stringify(requestBody));

    let raw: string;
    try {
      raw = execSync(
        `curl -s -m 120 https://api.anthropic.com/v1/messages -H ${shellEscape('x-api-key: ' + apiKey)} -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' -d @${inputFile}`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 130000 }
      ).toString('utf-8');
    } finally {
      try { unlinkSync(inputFile); } catch { /* ignore */ }
    }

    let response: Record<string, unknown>;
    try {
      response = JSON.parse(raw);
    } catch {
      return {
        ...entity,
        errors: [...entity.errors, `Extract: Invalid JSON from API: ${raw.slice(0, 200)}`],
      };
    }

    if (response.error) {
      const errObj = response.error as Record<string, string>;
      return {
        ...entity,
        errors: [...entity.errors, `Extract API error: ${errObj.message || JSON.stringify(errObj)}`],
      };
    }

    const content = response.content as Array<{ type: string; text: string }> | undefined;
    const text = content && content.length > 0 && content[0].type === 'text'
      ? content[0].text
      : '';

    // Try to parse JSON — handle markdown code blocks
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonStr.trim());
    } catch {
      return {
        ...entity,
        errors: [...entity.errors, `Extract JSON parse error. Raw response: ${text.slice(0, 200)}`],
      };
    }

    const usage = response.usage as { input_tokens: number; output_tokens: number } | undefined;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    // Haiku pricing: $0.80/1M input, $4/1M output
    const cost = (inputTokens * 0.80 + outputTokens * 4.0) / 1_000_000;

    return {
      ...entity,
      data: {
        ...entity.data,
        ...extracted,
        _extraction: {
          model: 'claude-haiku-4-5-20251001',
          inputTokens,
          outputTokens,
          costUsd: Math.round(cost * 10000) / 10000,
          extractedAt: new Date().toISOString(),
        },
      },
      status: 'extracted',
    };
  } catch (err) {
    return {
      ...entity,
      errors: [...entity.errors, `Extraction error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
