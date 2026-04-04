/**
 * Phase: Pricing Fallback — use Perplexity to fill missing pricing data.
 *
 * Runs after extract. For entities where extract couldn't find prices
 * (JS-rendered pages, dynamic pricing), asks Perplexity for current pricing.
 *
 * Requires PERPLEXITY_API_KEY.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

function hasPricing(entity: EntityRecord): boolean {
  const pricing = (entity.data as Record<string, Record<string, unknown>>)?.pricing;
  return !!(pricing?.cheapest_daily || pricing?.price_range_pln);
}

export async function enrichPricingFallback(entity: EntityRecord): Promise<EntityRecord> {
  // Skip if we already have pricing data
  if (hasPricing(entity)) {
    return entity;
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return entity;

  const prompt = `${entity.name} (${entity.url}) — catering dietetyczny / dieta pudełkowa, Polska.

Ile kosztuje dzienna dieta? Sprawdź aktualny cennik na stronie ${entity.url} lub w wynikach wyszukiwania.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown):
{
  "price_range_pln": "string — np. '45-89 PLN/dzień'",
  "cheapest_daily": number — najtańsza dzienna cena w PLN lub null,
  "most_expensive_daily": number — najdroższa dzienna cena w PLN lub null,
  "trial_offer": "string — opis oferty próbnej/rabatu na start lub null",
  "subscription_discount": true/false — czy są zniżki za dłuższe zamówienie,
  "price_source": "string — skąd masz te dane (url lub 'AI knowledge')",
  "diet_prices": [
    {"diet_name": "string", "price_per_day_pln": number, "kcal": "string or null"}
  ]
}

WAŻNE: Podaj realne ceny, nie zgaduj. Jeśli nie możesz znaleźć — wstaw null.`;

  const requestBody = {
    model: 'sonar',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  };

  const inputFile = `/tmp/pplx_pricing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  try {
    const raw = execSync(
      `curl -s -m 60 'https://api.perplexity.ai/chat/completions' -H "Authorization: Bearer ${apiKey}" -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 70000 }
    ).toString('utf-8');

    try { unlinkSync(inputFile); } catch { /* ignore */ }

    const response = JSON.parse(raw);
    if (response.error) return entity;

    const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];

    const parsed = JSON.parse(jsonStr.trim());

    // Merge with existing pricing (keep what extract found, fill gaps)
    const existingPricing = (entity.data as Record<string, Record<string, unknown>>)?.pricing || {};
    const mergedPricing = {
      ...existingPricing,
      price_range_pln: existingPricing.price_range_pln || parsed.price_range_pln || null,
      cheapest_daily: existingPricing.cheapest_daily || (typeof parsed.cheapest_daily === 'number' ? parsed.cheapest_daily : null),
      most_expensive_daily: existingPricing.most_expensive_daily || (typeof parsed.most_expensive_daily === 'number' ? parsed.most_expensive_daily : null),
      trial_offer: existingPricing.trial_offer || parsed.trial_offer || null,
      subscription_discount: existingPricing.subscription_discount ?? parsed.subscription_discount ?? null,
      price_source: parsed.price_source || 'perplexity',
      diet_prices: Array.isArray(parsed.diet_prices) ? parsed.diet_prices : [],
      _fallback: 'perplexity',
    };

    return {
      ...entity,
      data: {
        ...entity.data,
        pricing: mergedPricing,
      },
    };
  } catch {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return entity;
  }
}
