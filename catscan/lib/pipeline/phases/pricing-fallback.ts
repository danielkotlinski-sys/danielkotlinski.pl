/**
 * Phase: Pricing Fallback — benchmark pricing via Dietly API + Perplexity.
 *
 * Strategy:
 *   1. Dietly brands (177/239): curl Dietly company page → extract diet structure
 *      from __NEXT_DATA__ → find "Wybór menu"/"Standard" diet → call Dietly's
 *      internal calculate-price API for exact per-kcal pricing (FREE, 100% accurate).
 *   2. Non-Dietly brands (62/239): generic Perplexity benchmark query.
 *   3. If extract already got prices, just compute benchmarks — no API calls.
 *
 * Also fills: calorie_options in menu dimension, price_range_pln fallback.
 *
 * Dietly brands: FREE (direct API). Non-Dietly: ~$0.005/brand via Perplexity.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';
import { db, stmts } from '@/lib/db/sqlite';

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
  benchmarkDietObj: DietlyDiet | null;  // Full diet object for API pricing
  calorieOptions: number[];         // All unique kcal options
  tierPricing: string;              // Human-readable tier min prices for Perplexity context
  cityId: number;                   // City ID from SSR query
  companySlug: string;              // Company slug for API calls
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

    // Find the company details query and extract cityId
    const queryKey = Object.keys(queries).find(k => k.includes('getApiCompanyFullDetails'));
    if (!queryKey) return null;

    // Parse cityId from query key: getApiCompanyFullDetails({"cityId":918123,...})
    let cityId = 918123; // default Warsaw
    const cityMatch = queryKey.match(/"cityId":(\d+)/);
    if (cityMatch) cityId = parseInt(cityMatch[1], 10);

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
      benchmarkDietObj: benchmarkDiet,
      calorieOptions: Array.from(allKcal).sort((a, b) => a - b),
      tierPricing,
      cityId,
      companySlug: dietlySlug,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 1b: Dietly calculate-price API — exact per-kcal pricing (FREE)
// ---------------------------------------------------------------------------

interface DietlyPriceResult {
  price_1500kcal: number | null;
  price_2000kcal: number | null;
  cheapest_daily: number | null;
  price_by_kcal: Record<number, number>;  // Full map: {1200: 65.99, 1500: 72.99, ...}
}

/**
 * Call Dietly's internal calculate-price API to get exact per-day price
 * for a specific calorie level. Returns the list price (totalDietWithoutSideOrdersCost).
 */
function getDietlyPrice(
  companySlug: string,
  cityId: number,
  dietCaloriesId: number,
  tierDietOptionId: string | undefined
): number | null {
  // Use a Monday date in the near future for the order
  const deliveryDate = getNextMonday();

  const body: Record<string, unknown> = {
    cityId,
    companyId: companySlug,
    loyaltyProgramPoints: 0,
    loyaltyProgramPointsGlobal: 0,
    promoCodes: [],
    simpleOrders: [{
      itemId: 'benchmark',
      customDeliveryMeals: {},
      deliveryDates: [deliveryDate],
      deliveryMeals: [],
      dietCaloriesId,
      paymentType: 'ONLINE',
      sideOrders: [],
      testOrder: false,
      ...(tierDietOptionId ? { tierDietOptionId } : {}),
    }],
  };

  const inputFile = `/tmp/dietly_price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(body));

  try {
    const raw = execSync(
      `curl -s -m 15 -X POST 'https://dietly.pl/api/dietly/open/shopping-cart/calculate-price' -H 'Content-Type: application/json' -H ${shellEscape('company-id: ' + companySlug)} -H 'x-guest-session: catscan-benchmark' -d @${inputFile}`,
      { maxBuffer: 1024 * 1024, timeout: 20000 }
    ).toString('utf-8');

    try { unlinkSync(inputFile); } catch { /* ignore */ }

    const response = JSON.parse(raw);
    const items = response?.items;
    if (!items || !Array.isArray(items) || items.length === 0) return null;

    const item = items[0] as Record<string, number>;
    // totalDietWithoutSideOrdersCost for 1 day = per-day list price
    return item.totalDietWithoutSideOrdersCost ?? null;
  } catch {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return null;
  }
}

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now.getTime() + daysUntilMonday * 86400000);
  return monday.toISOString().slice(0, 10);
}

/**
 * Find the dietCaloriesId for a specific kcal target in a benchmark diet.
 */
function findCaloriesId(diet: DietlyDiet, targetKcal: number): number | null {
  // Check tiers first (first tier = cheapest/basic)
  if (diet.dietTiers && diet.dietTiers.length > 0) {
    const firstTier = diet.dietTiers[0];
    for (const opt of (firstTier.dietOptions || [])) {
      for (const cal of (opt.dietCalories || [])) {
        if (cal.calories === targetKcal) return cal.dietCaloriesId;
      }
    }
  }
  // Check top-level options
  for (const opt of (diet.dietOptions || [])) {
    for (const cal of (opt.dietCalories || [])) {
      if (cal.calories === targetKcal) return cal.dietCaloriesId;
    }
  }
  return null;
}

/**
 * Build tierDietOptionId for the API: "tierId-dietOptionId" for tiered diets.
 */
function buildTierDietOptionId(diet: DietlyDiet): string | undefined {
  if (!diet.dietTiers || diet.dietTiers.length === 0) return undefined;
  const firstTier = diet.dietTiers[0];
  const firstOption = firstTier.dietOptions?.[0];
  if (!firstOption) return undefined;
  return `${firstTier.tierId}-${firstOption.dietOptionId}`;
}

/**
 * Get exact benchmark prices from Dietly's calculate-price API.
 * Returns full price map for all kcal variants, plus 1500/2000 shortcuts.
 */
function getDietlyBenchmarkPrices(extract: DietlyExtract): DietlyPriceResult {
  const result: DietlyPriceResult = { price_1500kcal: null, price_2000kcal: null, cheapest_daily: null, price_by_kcal: {} };
  if (!extract.benchmarkDietObj) return result;

  const diet = extract.benchmarkDietObj;
  const tierOptId = buildTierDietOptionId(diet);

  // Collect all unique kcal values available in the benchmark diet (first tier or top-level options)
  const benchmarkKcals: { calories: number; dietCaloriesId: number }[] = [];
  if (diet.dietTiers && diet.dietTiers.length > 0) {
    for (const opt of (diet.dietTiers[0].dietOptions || [])) {
      for (const cal of (opt.dietCalories || [])) {
        if (cal.calories >= 1000) benchmarkKcals.push(cal);
      }
    }
  }
  if (benchmarkKcals.length === 0) {
    for (const opt of (diet.dietOptions || [])) {
      for (const cal of (opt.dietCalories || [])) {
        if (cal.calories >= 1000) benchmarkKcals.push(cal);
      }
    }
  }

  // Deduplicate by calories value
  const uniqueKcals = Array.from(
    new Map(benchmarkKcals.map(c => [c.calories, c])).values()
  ).sort((a, b) => a.calories - b.calories);

  // Fetch price for every calorie variant
  for (const cal of uniqueKcals) {
    const price = getDietlyPrice(extract.companySlug, extract.cityId, cal.dietCaloriesId, tierOptId);
    if (price !== null) {
      result.price_by_kcal[cal.calories] = price;
    }
  }

  // Extract key benchmarks from the full map
  result.price_1500kcal = result.price_by_kcal[1500] ?? null;
  result.price_2000kcal = result.price_by_kcal[2000] ?? null;

  const allPrices = Object.values(result.price_by_kcal);
  if (allPrices.length > 0) {
    result.cheapest_daily = Math.min(...allPrices);
  }

  return result;
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
  // Note: apiKey is only needed for non-Dietly brands. Dietly brands use free API.

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
  let dietlyApiPrices: DietlyPriceResult | null = null;

  // -----------------------------------------------------------------------
  // Path A: Dietly brands — extract structure + direct API pricing (FREE)
  // -----------------------------------------------------------------------
  const entityDomain = entity.domain || (() => { try { return new URL(entity.url).hostname.replace('www.', ''); } catch { return ''; } })();
  const brandRow = stmts.getBrandByDomain.get(entityDomain, entityDomain) as Record<string, unknown> | undefined;
  const dietlySlug = (brandRow?.dietly_slug as string) || undefined;

  if (dietlySlug) {
    dietlyExtract = extractDietlyData(dietlySlug);

    if (dietlyExtract && dietlyExtract.benchmarkDietObj) {
      // Use Dietly's own calculate-price API for exact pricing (FREE!)
      dietlyApiPrices = getDietlyBenchmarkPrices(dietlyExtract);
      console.log(`[pricing] Dietly API prices for ${entity.name}: 1500=${dietlyApiPrices.price_1500kcal}, 2000=${dietlyApiPrices.price_2000kcal}, cheapest=${dietlyApiPrices.cheapest_daily}`);
    }
  }

  // -----------------------------------------------------------------------
  // Path B: Non-Dietly brands or Dietly API failed — Perplexity fallback
  // -----------------------------------------------------------------------
  if (!dietlyApiPrices?.price_1500kcal && !dietlyApiPrices?.price_2000kcal && apiKey) {
    if (dietlySlug && dietlyExtract?.benchmarkDiet) {
      // Dietly brand but API failed — use targeted Perplexity
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
    } else {
      // Non-Dietly brand — generic Perplexity query
      benchmarkResult = callPerplexity(
        BENCHMARK_PRICE_PROMPT_GENERIC(entity.name, entity.url),
        apiKey
      );
      pplxCalls++;
    }
  }

  // -----------------------------------------------------------------------
  // Merge results
  // -----------------------------------------------------------------------
  const mergedPricing: Record<string, unknown> = { ...existingPricing };

  if (dietlyApiPrices) {
    // Dietly API — exact prices, highest confidence
    if (typeof dietlyApiPrices.price_1500kcal === 'number') {
      mergedPricing.price_1500kcal = dietlyApiPrices.price_1500kcal;
    }
    if (typeof dietlyApiPrices.price_2000kcal === 'number') {
      mergedPricing.price_2000kcal = dietlyApiPrices.price_2000kcal;
    }
    if (typeof dietlyApiPrices.cheapest_daily === 'number') {
      mergedPricing.cheapest_daily = dietlyApiPrices.cheapest_daily;
    }
    if (Object.keys(dietlyApiPrices.price_by_kcal).length > 0) {
      mergedPricing.price_by_kcal = dietlyApiPrices.price_by_kcal;
    }
    if (dietlyExtract?.benchmarkDiet) {
      mergedPricing.benchmark_diet_name = dietlyExtract.benchmarkDiet;
    }
    mergedPricing.price_source = 'dietly-api';
    mergedPricing._fallback = 'dietly-api';
  } else if (benchmarkResult) {
    // Perplexity fallback
    if (typeof benchmarkResult.price_1500kcal === 'number') {
      mergedPricing.price_1500kcal = benchmarkResult.price_1500kcal;
    }
    if (typeof benchmarkResult.price_2000kcal === 'number') {
      mergedPricing.price_2000kcal = benchmarkResult.price_2000kcal;
    }
    if (benchmarkResult.benchmark_diet_name) {
      mergedPricing.benchmark_diet_name = benchmarkResult.benchmark_diet_name;
    }
    if (!mergedPricing.cheapest_daily && typeof benchmarkResult.cheapest_daily === 'number') {
      mergedPricing.cheapest_daily = benchmarkResult.cheapest_daily;
    }
    mergedPricing.price_source = benchmarkResult.source || mergedPricing.price_source || null;
    mergedPricing._fallback = dietlySlug ? 'dietly+perplexity' : 'perplexity';
  }

  // Fill price range from Dietly API prices or SSR
  if (!mergedPricing.price_range_pln) {
    if (dietlyApiPrices?.cheapest_daily && dietlyApiPrices?.price_2000kcal) {
      mergedPricing.price_range_pln = `${dietlyApiPrices.cheapest_daily}-${dietlyApiPrices.price_2000kcal} PLN/dzień`;
    } else if (dietlyExtract?.priceRange) {
      mergedPricing.price_range_pln = dietlyExtract.priceRange;
    }
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
    } else if (apiKey) {
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
        pricingMethod: dietlyApiPrices ? 'dietly-api' : 'perplexity',
      } : undefined,
      _cost_pricing: {
        usd: pplxCalls * 0.005,
        calls: pplxCalls,
        dietlyApiCalls: dietlyApiPrices ? Object.keys(dietlyApiPrices.price_by_kcal).length : 0,
        provider: dietlyApiPrices ? 'dietly-api' : (dietlySlug ? 'dietly+perplexity' : 'perplexity'),
      },
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
