/**
 * Phase: Pricing Fallback — use Perplexity to fill missing pricing data.
 *
 * Runs after extract. Two cases:
 *   1. No prices at all (JS-rendered sites) → full pricing query
 *   2. Has min/max but no diet_prices breakdown → kcal pricing query
 *
 * Also computes normalized benchmark prices: price_1500kcal, price_2000kcal
 *
 * Requires PERPLEXITY_API_KEY. ~$0.005/query.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

interface DietPrice {
  diet_name: string;
  price_per_day_pln: number;
  kcal: string | null;
}

function getPricing(entity: EntityRecord): Record<string, unknown> {
  return (entity.data as Record<string, Record<string, unknown>>)?.pricing || {};
}

function hasPricing(entity: EntityRecord): boolean {
  const p = getPricing(entity);
  return !!(p.cheapest_daily || p.price_range_pln);
}

function hasDietPrices(entity: EntityRecord): boolean {
  const p = getPricing(entity);
  return Array.isArray(p.diet_prices) && p.diet_prices.length > 0;
}

function callPerplexity(prompt: string, apiKey: string): Record<string, unknown> | null {
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
    if (response.error) return null;

    const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];

    return JSON.parse(jsonStr.trim());
  } catch {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return null;
  }
}

const FULL_PRICING_PROMPT = (name: string, url: string) =>
  `${name} (${url}) — catering dietetyczny / dieta pudełkowa, Polska.

Ile kosztuje dzienna dieta? Sprawdź aktualny cennik na stronie ${url} lub w wynikach wyszukiwania.

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

WAŻNE: W diet_prices podaj KAŻDĄ dostępną dietę z ceną i wariantem kalorycznym.
Jeśli firma oferuje np. 1200/1500/2000/2500 kcal — wymień każdą osobno z ceną.
Podaj realne ceny, nie zgaduj. Jeśli nie możesz znaleźć — wstaw null.`;

const DIET_PRICES_PROMPT = (name: string, url: string) =>
  `${name} (${url}) — catering dietetyczny, Polska.

Podaj szczegółowy cennik diet pudełkowych z rozbiciem na warianty kaloryczne.
Sprawdź aktualny cennik na stronie ${url}.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown):
{
  "diet_prices": [
    {"diet_name": "string — nazwa diety", "price_per_day_pln": number, "kcal": "string — np. '1500'"}
  ],
  "price_source": "string — url źródła"
}

WAŻNE: Wymień KAŻDY wariant kaloryczny osobno (1200, 1500, 1800, 2000, 2500, 3000 kcal itd.)
z odpowiadającą ceną za dzień. Jeśli firma ma kilka typów diet (Standard, Vege, Sport) —
wymień każdy z cenami. Podaj realne ceny.`;

/**
 * Compute normalized benchmark prices from diet_prices array.
 * Finds closest match to 1500 and 2000 kcal.
 */
function computeBenchmarkPrices(dietPrices: DietPrice[]): {
  price_1500kcal: number | null;
  price_2000kcal: number | null;
} {
  if (!dietPrices || dietPrices.length === 0) {
    return { price_1500kcal: null, price_2000kcal: null };
  }

  function findClosest(targetKcal: number): number | null {
    let bestPrice: number | null = null;
    let bestDist = Infinity;

    for (const dp of dietPrices) {
      if (!dp.kcal || !dp.price_per_day_pln) continue;
      // Parse kcal — handle "1500", "1200-1500", "ok. 1500" etc.
      const kcalMatch = dp.kcal.match(/(\d{3,4})/);
      if (!kcalMatch) continue;
      const kcal = parseInt(kcalMatch[1], 10);
      const dist = Math.abs(kcal - targetKcal);
      // Only accept if within 300 kcal
      if (dist < bestDist && dist <= 300) {
        bestDist = dist;
        bestPrice = dp.price_per_day_pln;
      }
    }

    return bestPrice;
  }

  return {
    price_1500kcal: findClosest(1500),
    price_2000kcal: findClosest(2000),
  };
}

export async function enrichPricingFallback(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return entity;

  const existingPricing = getPricing(entity);
  const needsFullPricing = !hasPricing(entity);
  const needsDietPrices = !hasDietPrices(entity);

  // If we have everything, just compute benchmarks from existing data
  if (!needsFullPricing && !needsDietPrices) {
    const dietPrices = existingPricing.diet_prices as DietPrice[];
    const benchmarks = computeBenchmarkPrices(dietPrices);
    return {
      ...entity,
      data: {
        ...entity.data,
        pricing: { ...existingPricing, ...benchmarks, _pricing_fallback_done: new Date().toISOString() },
      },
    };
  }

  let parsed: Record<string, unknown> | null = null;

  if (needsFullPricing) {
    // Case 1: No prices at all — get everything
    parsed = callPerplexity(FULL_PRICING_PROMPT(entity.name, entity.url), apiKey);
  } else if (needsDietPrices) {
    // Case 2: Has min/max but no diet breakdown — just get diet_prices
    parsed = callPerplexity(DIET_PRICES_PROMPT(entity.name, entity.url), apiKey);
  }

  if (!parsed) return entity;

  // Build diet_prices from response
  const newDietPrices = Array.isArray(parsed.diet_prices) ? parsed.diet_prices as DietPrice[] : [];

  // Compute benchmark prices
  const benchmarks = computeBenchmarkPrices(newDietPrices);

  // Merge
  const mergedPricing: Record<string, unknown> = {
    ...existingPricing,
    diet_prices: newDietPrices.length > 0 ? newDietPrices : (existingPricing.diet_prices || []),
    ...benchmarks,
  };

  if (needsFullPricing && parsed) {
    mergedPricing.price_range_pln = existingPricing.price_range_pln || parsed.price_range_pln || null;
    mergedPricing.cheapest_daily = existingPricing.cheapest_daily || (typeof parsed.cheapest_daily === 'number' ? parsed.cheapest_daily : null);
    mergedPricing.most_expensive_daily = existingPricing.most_expensive_daily || (typeof parsed.most_expensive_daily === 'number' ? parsed.most_expensive_daily : null);
    mergedPricing.trial_offer = existingPricing.trial_offer || parsed.trial_offer || null;
    mergedPricing.subscription_discount = existingPricing.subscription_discount ?? parsed.subscription_discount ?? null;
    mergedPricing._fallback = 'perplexity';
  }

  if (parsed.price_source) {
    mergedPricing.price_source = parsed.price_source;
  }

  mergedPricing._pricing_fallback_done = new Date().toISOString();

  return {
    ...entity,
    data: {
      ...entity.data,
      pricing: mergedPricing,
    },
  };
}
