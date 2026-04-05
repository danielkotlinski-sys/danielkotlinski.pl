/**
 * Phase: Pricing Fallback — benchmark pricing via Dietly SSR + Perplexity.
 *
 * Strategy:
 *   1. Dietly brands (177/239): curl Dietly page → extract diet structure from
 *      __NEXT_DATA__ → find "Wybór menu"/"Standard" diet → get calorie options →
 *      targeted Perplexity query for price at 1500 + 2000 kcal.
 *   2. Non-Dietly brands (62/239): generic Perplexity benchmark query.
 *   3. If extract already got prices, just compute benchmarks — no API calls.
 *
 * Also fills: calorie_options in menu dimension, price_range_pln fallback.
 *
 * Requires PERPLEXITY_API_KEY. ~$0.005-0.01/brand.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';
import { getBrands } from '@/lib/db/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DietPrice {
  diet_name: string;
  price_per_day_pln: number;
  kcal: string | null;
}

interface DietlyCalorie {
  dietCaloriesId: number;
  calories: number;
}

interface DietlyDietOption {
  dietOptionId: number;
  name: string;
  dietOptionTag: string;
  dietCalories: DietlyCalorie[];
}

interface DietlyTier {
  tierId: number;
  name: string;
  minPrice: string;
  dietOptions: DietlyDietOption[];
}

interface DietlyDiet {
  dietId: number;
  name: string;
  dietOptions: DietlyDietOption[];
  dietTiers: DietlyTier[];
}

interface DietlyExtract {
  diets: DietlyDiet[];
  priceRange: string | null;
  benchmarkDiet: string | null;    // Name of the chosen benchmark diet
  calorieOptions: number[];         // All unique kcal options
  tierPricing: string;              // Human-readable tier min prices for Perplexity context
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function getPricing(entity: EntityRecord): Record<string, unknown> {
  return (entity.data as Record<string, Record<string, unknown>>)?.pricing || {};
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

// ---------------------------------------------------------------------------
// Step 1: Extract diet structure from Dietly SSR
// ---------------------------------------------------------------------------

function extractDietlyData(dietlySlug: string): DietlyExtract | null {
  try {
    const url = `https://dietly.pl/catering-dietetyczny-firma/${dietlySlug}`;
    const html = execSync(
      `curl -sL -m 20 ${shellEscape(url)}`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 25000 }
    ).toString('utf-8');

    // Extract __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;

    const nextData = JSON.parse(nextDataMatch[1]);
    const queries = nextData?.props?.pageProps?.initialState?.dietlyApi?.queries;
    if (!queries) return null;

    // Find the company details query
    const queryKey = Object.keys(queries).find(k => k.includes('getApiCompanyFullDetails'));
    if (!queryKey) return null;

    const companyData = queries[queryKey]?.data;
    if (!companyData) return null;

    const diets = (companyData.companyDiets || []) as DietlyDiet[];
    const priceRange = companyData.contactDetails?.priceRangeInfo || null;

    // Collect all unique calorie options across all diets
    const allKcal = new Set<number>();
    for (const diet of diets) {
      // From tiers
      for (const tier of (diet.dietTiers || [])) {
        for (const opt of (tier.dietOptions || [])) {
          for (const cal of (opt.dietCalories || [])) {
            if (cal.calories) allKcal.add(cal.calories);
          }
        }
      }
      // From top-level options
      for (const opt of (diet.dietOptions || [])) {
        for (const cal of (opt.dietCalories || [])) {
          if (cal.calories) allKcal.add(cal.calories);
        }
      }
    }

    // Find the benchmark diet: prefer "Wybór menu", then "Standard", then "Klasyczna", then first
    const benchmarkPatterns = [
      /wyb[oó]r\s*menu/i,
      /standard/i,
      /klasyczn/i,
      /basic/i,
    ];

    let benchmarkDiet: DietlyDiet | null = null;
    for (const pattern of benchmarkPatterns) {
      benchmarkDiet = diets.find(d => pattern.test(d.name)) || null;
      if (!benchmarkDiet) {
        // Also check tier names
        for (const d of diets) {
          const matchingTier = d.dietTiers?.find(t => pattern.test(t.name));
          if (matchingTier) { benchmarkDiet = d; break; }
        }
      }
      if (benchmarkDiet) break;
    }
    if (!benchmarkDiet && diets.length > 0) benchmarkDiet = diets[0];

    // Build tier pricing info string for Perplexity context
    let tierPricing = '';
    if (benchmarkDiet) {
      const tiers = benchmarkDiet.dietTiers || [];
      if (tiers.length > 0) {
        const parts = tiers.map(t => `${t.name}: od ${t.minPrice}`);
        tierPricing = parts.join(', ');
      }
    }

    return {
      diets,
      priceRange,
      benchmarkDiet: benchmarkDiet?.name || null,
      calorieOptions: Array.from(allKcal).sort((a, b) => a - b),
      tierPricing,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 2: Perplexity prompts — targeted benchmark pricing
// ---------------------------------------------------------------------------

const BENCHMARK_PRICE_PROMPT_DIETLY = (
  name: string, dietlySlug: string, benchmarkDiet: string, kcalOptions: number[],
  tierInfo: string
) =>
  `${name} — catering dietetyczny, Polska. Dostępna na dietly.pl/catering-dietetyczny-firma/${dietlySlug}

Interesuje mnie TYLKO cena dziennej diety "${benchmarkDiet}" w wariancie 1500 kcal i 2000 kcal.
Firma oferuje warianty: ${kcalOptions.join(', ')} kcal.
${tierInfo ? `Znane ceny minimalne z Dietly (najniższa kaloryczność): ${tierInfo}` : ''}

Sprawdź aktualny cennik na dietly.pl lub stronie firmy. Ceny zależą od kaloryczności — wyższe kcal = wyższa cena.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown):
{
  "benchmark_diet_name": "${benchmarkDiet}",
  "price_1500kcal": number — cena PLN/dzień za 1500 kcal lub null,
  "price_2000kcal": number — cena PLN/dzień za 2000 kcal lub null,
  "price_range_pln": "string — ogólny zakres cenowy np. '49-89 PLN/dzień' lub null",
  "cheapest_daily": number — najtańsza dostępna dieta PLN/dzień lub null,
  "source": "string — skąd masz te dane"
}

WAŻNE: Podaj realne, aktualne ceny. Jeśli nie możesz znaleźć — wstaw null. NIE zgaduj.`;

const BENCHMARK_PRICE_PROMPT_GENERIC = (name: string, url: string) =>
  `${name} (${url}) — catering dietetyczny / dieta pudełkowa, Polska.

Interesuje mnie cena dziennej diety pudełkowej. Szukam:
- Cena najtańszej standardowej diety (np. "Dieta z wyborem menu", "Standard", "Klasyczna") w wariancie 1500 kcal
- Cena tej samej diety w wariancie 2000 kcal
- Ogólny zakres cenowy firmy (od-do PLN/dzień)

Sprawdź na ${url}, dietly.pl lub w wynikach wyszukiwania.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown):
{
  "benchmark_diet_name": "string — nazwa diety którą sprawdziłeś",
  "price_1500kcal": number — cena PLN/dzień za 1500 kcal lub null,
  "price_2000kcal": number — cena PLN/dzień za 2000 kcal lub null,
  "price_range_pln": "string — np. '45-89 PLN/dzień' lub null",
  "cheapest_daily": number — najtańsza dieta PLN/dzień lub null,
  "calorie_options": [1200, 1500, ...] — dostępne warianty kcal lub [],
  "source": "string — skąd masz te dane"
}

WAŻNE: Podaj realne ceny. Jeśli nie znajdziesz — null. NIE zgaduj.`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function enrichPricingFallback(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return entity;

  const existingPricing = getPricing(entity);
  const existingMenu = (entity.data as Record<string, Record<string, unknown>>)?.menu || {};

  // Already have benchmark prices? Just mark as done.
  if (existingPricing.price_1500kcal && existingPricing.price_2000kcal) {
    return {
      ...entity,
      data: {
        ...entity.data,
        pricing: { ...existingPricing, _pricing_fallback_done: new Date().toISOString() },
        _cost_pricing: { usd: 0, calls: 0, provider: 'none' },
      },
    };
  }

  let pplxCalls = 0;
  let benchmarkResult: Record<string, unknown> | null = null;
  let dietlyExtract: DietlyExtract | null = null;

  // -----------------------------------------------------------------------
  // Path A: Dietly brands — extract structure, then targeted query
  // -----------------------------------------------------------------------
  // Find dietlySlug from brands.json seed data
  const brands = getBrands();
  const entityDomain = entity.domain || (() => { try { return new URL(entity.url).hostname.replace('www.', ''); } catch { return ''; } })();
  const brandRecord = brands.find(b => {
    const bDomain = (b.domain || '');
    return bDomain === entityDomain || bDomain === `www.${entityDomain}`;
  });
  const dietlySlug = brandRecord?.dietlySlug as string | undefined;

  if (dietlySlug) {
    dietlyExtract = extractDietlyData(dietlySlug);

    if (dietlyExtract && dietlyExtract.benchmarkDiet) {
      benchmarkResult = callPerplexity(
        BENCHMARK_PRICE_PROMPT_DIETLY(
          entity.name,
          dietlySlug,
          dietlyExtract.benchmarkDiet,
          dietlyExtract.calorieOptions,
          dietlyExtract.tierPricing
        ),
        apiKey
      );
      pplxCalls++;
    }
  }

  // -----------------------------------------------------------------------
  // Path B: Non-Dietly brands or Dietly extraction failed — generic query
  // -----------------------------------------------------------------------
  if (!benchmarkResult) {
    benchmarkResult = callPerplexity(
      BENCHMARK_PRICE_PROMPT_GENERIC(entity.name, entity.url),
      apiKey
    );
    pplxCalls++;
  }

  // -----------------------------------------------------------------------
  // Merge results
  // -----------------------------------------------------------------------
  const mergedPricing: Record<string, unknown> = { ...existingPricing };

  if (benchmarkResult) {
    // Benchmark prices — the key output
    if (typeof benchmarkResult.price_1500kcal === 'number') {
      mergedPricing.price_1500kcal = benchmarkResult.price_1500kcal;
    }
    if (typeof benchmarkResult.price_2000kcal === 'number') {
      mergedPricing.price_2000kcal = benchmarkResult.price_2000kcal;
    }
    if (benchmarkResult.benchmark_diet_name) {
      mergedPricing.benchmark_diet_name = benchmarkResult.benchmark_diet_name;
    }

    // Fill basic pricing if missing
    if (!mergedPricing.price_range_pln && benchmarkResult.price_range_pln) {
      mergedPricing.price_range_pln = benchmarkResult.price_range_pln;
    }
    if (!mergedPricing.cheapest_daily && typeof benchmarkResult.cheapest_daily === 'number') {
      mergedPricing.cheapest_daily = benchmarkResult.cheapest_daily;
    }

    mergedPricing.price_source = benchmarkResult.source || mergedPricing.price_source || null;
    mergedPricing._fallback = dietlySlug ? 'dietly+perplexity' : 'perplexity';
  }

  // Fill Dietly price range from SSR if we have it
  if (!mergedPricing.price_range_pln && dietlyExtract?.priceRange) {
    mergedPricing.price_range_pln = dietlyExtract.priceRange;
  }

  mergedPricing._pricing_fallback_done = new Date().toISOString();

  // -----------------------------------------------------------------------
  // Calorie options — from Dietly structure (free) or Perplexity response
  // -----------------------------------------------------------------------
  let updatedMenu = { ...existingMenu };
  const hasCalorieOptions = Array.isArray(existingMenu.calorie_options) && (existingMenu.calorie_options as number[]).length > 0;

  if (!hasCalorieOptions) {
    if (dietlyExtract && dietlyExtract.calorieOptions.length > 0) {
      // Free from Dietly SSR — no API call needed
      updatedMenu.calorie_options = dietlyExtract.calorieOptions;
    } else if (benchmarkResult && Array.isArray(benchmarkResult.calorie_options) && (benchmarkResult.calorie_options as number[]).length > 0) {
      // From Perplexity generic response
      updatedMenu.calorie_options = benchmarkResult.calorie_options;
    } else {
      // Standalone calorie query as last resort
      const kcalResult = callPerplexity(CALORIE_OPTIONS_PROMPT(entity.name, entity.url), apiKey);
      pplxCalls++;
      if (kcalResult && Array.isArray(kcalResult.calorie_options) && (kcalResult.calorie_options as number[]).length > 0) {
        updatedMenu.calorie_options = kcalResult.calorie_options;
      }
    }
  }

  return {
    ...entity,
    data: {
      ...entity.data,
      pricing: mergedPricing,
      menu: updatedMenu,
      _dietly_extract: dietlyExtract ? {
        dietCount: dietlyExtract.diets.length,
        benchmarkDiet: dietlyExtract.benchmarkDiet,
        calorieOptions: dietlyExtract.calorieOptions,
        priceRange: dietlyExtract.priceRange,
        tierPricing: dietlyExtract.tierPricing || undefined,
      } : undefined,
      _cost_pricing: { usd: pplxCalls * 0.005, calls: pplxCalls, provider: dietlySlug ? 'dietly+perplexity' : 'perplexity' },
    },
  };
}

// Kept for backwards compat in calorie fallback
const CALORIE_OPTIONS_PROMPT = (name: string, url: string) =>
  `${name} (${url}) — catering dietetyczny / dieta pudełkowa, Polska.

Jakie warianty kaloryczne (kcal dziennie) oferuje ten catering? Sprawdź na stronie ${url} lub dietly.pl lub w wynikach wyszukiwania.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown):
{
  "calorie_options": [1200, 1500, 2000, 2500],
  "source": "string — skąd masz te dane"
}

WAŻNE: Podaj TYLKO warianty, które firma faktycznie oferuje. Nie zgaduj.
Typowe warianty to: 1200, 1500, 1800, 2000, 2500, 3000, 3500, 4000 kcal.`;
