/**
 * Phase: Interpret — Claude Sonnet analyzes the full dataset and generates
 * sector-level insights: rankings, segments, anomalies, trends.
 *
 * This runs ONCE after all entities are processed, not per-entity.
 * Output is a structured report stored on the scan record.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { EntityRecord } from '@/lib/db/store';

const INTERPRETATION_PROMPT = `Jesteś analitykiem rynku cateringów dietetycznych w Polsce.
Otrzymujesz kompletny dataset ${'{COUNT}'} firm z branży — z danymi o komunikacji, cenach, social media, reklamach, opiniach i finansach.

Przygotuj raport sektorowy. Odpowiedz WYŁĄCZNIE poprawnym JSON-em:

{
  "sector_summary": {
    "total_brands": number,
    "avg_daily_price_pln": number or null,
    "price_range": "string — np. '35-120 PLN/dzień'",
    "dominant_positioning": "string — najczęstszy typ pozycjonowania",
    "market_maturity": "emerging | growing | mature | saturated"
  },
  "rankings": {
    "by_price_cheapest": [{"name": "string", "price": "string"}],
    "by_price_premium": [{"name": "string", "price": "string"}],
    "by_social_followers": [{"name": "string", "followers": number}],
    "by_ad_intensity": [{"name": "string", "active_ads": number}],
    "by_review_rating": [{"name": "string", "rating": number, "count": number}]
  },
  "segments": [
    {
      "name": "string — segment name, np. 'Budget dla studentów', 'Premium wellness'",
      "brands": ["list of brand names"],
      "characteristics": "string — 1-2 sentences describing the segment",
      "avg_price": "string or null"
    }
  ],
  "anomalies": [
    {
      "brand": "string",
      "type": "zombie | fast_grower | overadvertised | underpriced | premium_outlier | hidden_gem",
      "description": "string — 1 sentence explaining the anomaly"
    }
  ],
  "trends": [
    "string — each is 1 sentence about an observed market trend"
  ],
  "competitive_gaps": [
    "string — each is 1 sentence about an underserved niche or opportunity"
  ],
  "data_quality": {
    "entities_with_pricing": number,
    "entities_with_social": number,
    "entities_with_reviews": number,
    "entities_with_ads": number,
    "entities_with_financials": number,
    "overall_completeness_pct": number
  }
}

WAŻNE:
- Rankings: top 5 w każdej kategorii (lub mniej jeśli nie ma danych)
- Segmenty: 3-6 segmentów
- Anomalie: 3-8 najciekawszych
- Trendy: 3-5
- Luki konkurencyjne: 2-4
- Jeśli brakuje danych w jakimś wymiarze — pomiń ranking, nie zgaduj`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface InterpretationResult {
  report: Record<string, unknown>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  generatedAt: string;
}

export async function interpretDataset(entities: EntityRecord[]): Promise<InterpretationResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  // Prepare clean entity data for the LLM
  const cleanEntities = entities
    .filter(e => e.status !== 'failed')
    .map(e => {
      const data = { ...e.data };
      // Remove internal metadata
      delete (data as Record<string, unknown>)._meta;
      delete (data as Record<string, unknown>)._extraction;
      delete (data as Record<string, unknown>)._finance;
      delete (data as Record<string, unknown>)._seed;
      delete (data as Record<string, unknown>)._discovery;
      return {
        name: e.name,
        url: e.url,
        domain: e.domain,
        nip: e.nip,
        ...data,
        financials: e.financials,
      };
    });

  if (cleanEntities.length === 0) {
    return null;
  }

  const prompt = INTERPRETATION_PROMPT.replace('{COUNT}', String(cleanEntities.length));

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\n--- DATASET (${cleanEntities.length} firms) ---\n\n${JSON.stringify(cleanEntities, null, 2)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON — handle markdown code blocks
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(jsonStr.trim());
  } catch {
    report = { raw_response: text, parse_error: true };
  }

  // Sonnet pricing: $3/1M input, $15/1M output
  const cost = (response.usage.input_tokens * 3.0 + response.usage.output_tokens * 15.0) / 1_000_000;

  return {
    report,
    model: 'claude-sonnet-4-6',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd: Math.round(cost * 10000) / 10000,
    generatedAt: new Date().toISOString(),
  };
}
