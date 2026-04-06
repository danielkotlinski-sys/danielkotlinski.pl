/**
 * Phase: Scorecard — per-entity analysis and scoring.
 *
 * For each brand, generates:
 * - description: 2-3 sentence brand summary
 * - scores: normalized 0-100 in key dimensions
 * - tags: segment/positioning labels
 * - signals: notable patterns (fast_grower, zombie, etc.)
 * - strengths / weaknesses: top 3 each
 *
 * Requires pre-computed sector stats (medians, percentiles) passed as context.
 * Uses Claude Haiku for cost efficiency (~$0.001/entity).
 *
 * This replaces the old monolithic "interpret" phase.
 * Data stored on entity.data.scorecard — queryable, filterable, comparable.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectorStats {
  entityCount: number;
  pricing: {
    median: number | null;
    p25: number | null;
    p75: number | null;
    min: number | null;
    max: number | null;
  };
  social: {
    medianFollowers: number | null;
    p75Followers: number | null;
    platformCounts: Record<string, number>; // platform → how many brands have it
  };
  reviews: {
    medianRating: number | null;
    medianCount: number | null;
  };
  ads: {
    medianMetaAds: number | null;
    medianGoogleAds: number | null;
  };
  finance: {
    medianRevenue: number | null;
    entitiesWithData: number;
  };
  youtube: {
    medianReviewCount: number | null;
    medianSentiment: number | null;
  };
  influencers: {
    medianPartnerships: number | null;
    entitiesWithAny: number;
  };
}

export interface Scorecard {
  description: string;
  scores: {
    price_competitiveness: number | null;
    social_presence: number | null;
    ad_intensity: number | null;
    review_reputation: number | null;
    brand_awareness: number | null;
    financial_health: number | null;
    content_quality: number | null;
    influencer_reach: number | null;
    overall: number | null;
  };
  tags: string[];
  signals: Array<{
    type: string;
    description: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  segment: string;
  positioning: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Sector stats computation
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function extractNumber(val: unknown): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/[^\d.,]/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  return null;
}

export function computeSectorStats(entities: EntityRecord[]): SectorStats {
  const active = entities.filter(e => e.status !== 'failed');

  // Pricing
  const prices: number[] = [];
  for (const e of active) {
    const pricing = e.data.pricing as Record<string, unknown> | undefined;
    if (!pricing) continue;
    const cheapest = extractNumber(pricing.cheapest_daily);
    if (cheapest && cheapest > 0 && cheapest < 500) prices.push(cheapest);
  }
  prices.sort((a, b) => a - b);

  // Social
  const followerCounts: number[] = [];
  const platformPresence: Record<string, number> = {};
  for (const e of active) {
    const social = e.data.social as Record<string, unknown> | undefined;
    if (!social) continue;
    const total = extractNumber(social.totalFollowers);
    if (total !== null) followerCounts.push(total);
    const platforms = social.platforms as Array<Record<string, unknown>> | undefined;
    if (platforms) {
      for (const p of platforms) {
        const name = String(p.platform || '').toLowerCase();
        if (name) platformPresence[name] = (platformPresence[name] || 0) + 1;
      }
    }
  }
  followerCounts.sort((a, b) => a - b);

  // Reviews
  const ratings: number[] = [];
  const reviewCounts: number[] = [];
  for (const e of active) {
    const reviews = e.data.reviews as Record<string, Record<string, unknown>> | undefined;
    if (!reviews) continue;
    const gRating = extractNumber(reviews.google?.rating);
    if (gRating) ratings.push(gRating);
    const gCount = extractNumber(reviews.google?.count);
    if (gCount) reviewCounts.push(gCount);
  }
  ratings.sort((a, b) => a - b);
  reviewCounts.sort((a, b) => a - b);

  // Meta Ads
  const metaAdCounts: number[] = [];
  for (const e of active) {
    const ads = e.data.ads as Record<string, unknown> | undefined;
    if (!ads) continue;
    const count = extractNumber(ads.activeAdsCount);
    if (count !== null) metaAdCounts.push(count);
  }
  metaAdCounts.sort((a, b) => a - b);

  // Google Ads
  const googleAdCounts: number[] = [];
  for (const e of active) {
    const gads = e.data.google_ads as Record<string, unknown> | undefined;
    if (!gads || gads.skipped) continue;
    const count = extractNumber(gads.totalAdsFound);
    if (count !== null) googleAdCounts.push(count);
  }
  googleAdCounts.sort((a, b) => a - b);

  // Finance
  const revenues: number[] = [];
  for (const e of active) {
    const fin = e.data.finance as Record<string, unknown> | undefined;
    if (!fin || fin.skipped) continue;
    const rev = extractNumber(fin.revenue);
    if (rev !== null && rev > 0) revenues.push(rev);
  }
  revenues.sort((a, b) => a - b);

  // YouTube reviews
  const ytReviewCounts: number[] = [];
  const ytSentiments: number[] = [];
  for (const e of active) {
    const ytr = e.data.youtube_reviews as Record<string, unknown> | undefined;
    if (!ytr || ytr.skipped) continue;
    const count = extractNumber(ytr.reviews_analyzed);
    if (count !== null) ytReviewCounts.push(count);
    const sentiment = extractNumber(ytr.avg_sentiment);
    if (sentiment !== null) ytSentiments.push(sentiment);
  }
  ytReviewCounts.sort((a, b) => a - b);
  ytSentiments.sort((a, b) => a - b);

  // Influencers (combined press + IG)
  const partnershipCounts: number[] = [];
  let entitiesWithInfluencer = 0;
  for (const e of active) {
    let count = 0;
    const press = e.data.influencer_press as Record<string, unknown> | undefined;
    if (press) {
      const partnerships = press.partnerships as unknown[] | undefined;
      if (partnerships) count += partnerships.length;
    }
    const ig = e.data.influencer_ig as Record<string, unknown> | undefined;
    if (ig && !ig.skipped) {
      const uniqueInf = extractNumber(ig.unique_influencers);
      if (uniqueInf !== null) count += uniqueInf;
    }
    if (count > 0) {
      partnershipCounts.push(count);
      entitiesWithInfluencer++;
    }
  }
  partnershipCounts.sort((a, b) => a - b);

  return {
    entityCount: active.length,
    pricing: {
      median: percentile(prices, 50),
      p25: percentile(prices, 25),
      p75: percentile(prices, 75),
      min: prices[0] ?? null,
      max: prices[prices.length - 1] ?? null,
    },
    social: {
      medianFollowers: percentile(followerCounts, 50),
      p75Followers: percentile(followerCounts, 75),
      platformCounts: platformPresence,
    },
    reviews: {
      medianRating: percentile(ratings, 50),
      medianCount: percentile(reviewCounts, 50),
    },
    ads: {
      medianMetaAds: percentile(metaAdCounts, 50),
      medianGoogleAds: percentile(googleAdCounts, 50),
    },
    finance: {
      medianRevenue: percentile(revenues, 50),
      entitiesWithData: revenues.length,
    },
    youtube: {
      medianReviewCount: percentile(ytReviewCounts, 50),
      medianSentiment: percentile(ytSentiments, 50),
    },
    influencers: {
      medianPartnerships: percentile(partnershipCounts, 50),
      entitiesWithAny: entitiesWithInfluencer,
    },
  };
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

function buildScorecardPrompt(sectorStats: SectorStats): string {
  return `Jesteś analitykiem rynku cateringów dietetycznych w Polsce.
Otrzymujesz dane jednej marki + statystyki sektorowe (mediany, percentyle) z ${sectorStats.entityCount} firm.

Przygotuj SCORECARD tej marki. Odpowiedz WYŁĄCZNIE poprawnym JSON-em:

{
  "description": "2-3 zdania. Kim jest marka, jakie jest jej pozycjonowanie, czym się wyróżnia. Pisz konkretnie, nie ogólnikowo.",
  "scores": {
    "price_competitiveness": <0-100, null jeśli brak danych. 100 = najtańszy w sektorze>,
    "social_presence": <0-100, null jeśli brak. Uwzględnij followersów, liczbę platform, engagement>,
    "ad_intensity": <0-100, null jeśli brak. Meta + Google Ads łącznie>,
    "review_reputation": <0-100, null jeśli brak. Rating * ilość opinii vs sektor>,
    "brand_awareness": <0-100, null jeśli brak. YouTube recenzje + prasa + influencerzy>,
    "financial_health": <0-100, null jeśli brak. Revenue trend, rentowność>,
    "content_quality": <0-100, null jeśli brak. Strona, video, social content>,
    "influencer_reach": <0-100, null jeśli brak. Partnerstwa, zasięg influencerów>,
    "overall": <0-100, ważona średnia dostępnych wymiarów>
  },
  "tags": ["lista tagów, np. 'premium', 'vegan-friendly', 'Warsaw-only', 'celebrity-backed', 'budget', 'health-focused', 'keto', 'sport', 'rodzinny', 'corporate-catering'"],
  "signals": [
    {"type": "fast_grower | zombie | heavy_advertiser | underpriced | premium_outlier | hidden_gem | market_leader | newcomer | niche_player | declining", "description": "1 zdanie po polsku"}
  ],
  "strengths": ["top 3 mocne strony, po polsku, konkretnie np. 'Najniższa cena w segmencie budget (39 PLN/dzień)'"],
  "weaknesses": ["top 3 słabe strony, po polsku, konkretnie np. 'Brak obecności na Instagramie mimo młodej grupy docelowej'"],
  "segment": "nazwa segmentu rynkowego, np. 'Premium wellness', 'Budget masowy', 'Sport & fitness', 'Korporacyjny', 'Niszowy/specjalistyczny'",
  "positioning": "1 zdanie — jak marka pozycjonuje się na tle konkurencji"
}

STATYSTYKI SEKTOROWE (kontekst do scoringu):
${JSON.stringify(sectorStats, null, 2)}

WAŻNE:
- Scores to percentyle vs sektor (50 = mediana, 75 = powyżej 75% konkurencji)
- Null jeśli wymiar nie ma danych — nie zgaduj
- Overall: ważona średnia dostępnych scores (price 15%, social 15%, ads 10%, reviews 20%, awareness 10%, financial 15%, content 5%, influencer 10%)
- Tags: 3-8 tagów, konkretne i przydatne do filtrowania
- Signals: 1-3 najważniejsze, nie więcej
- Pisz po polsku, konkretnie, z liczbami gdzie możliwe`;
}

// ---------------------------------------------------------------------------
// LLM call (Haiku for cost efficiency)
// ---------------------------------------------------------------------------

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function callHaiku(prompt: string, entityData: string, apiKey: string): { text: string; inputTokens: number; outputTokens: number } | null {
  const requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\n--- DANE MARKI ---\n\n${entityData}`,
      },
    ],
  };

  const inputFile = `/tmp/scorecard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  let raw: string;
  try {
    raw = execSync(
      `curl -s -m 60 https://api.anthropic.com/v1/messages ` +
      `-H ${shellEscape('x-api-key: ' + apiKey)} ` +
      `-H 'anthropic-version: 2023-06-01' ` +
      `-H 'content-type: application/json' ` +
      `-d @${inputFile}`,
      { maxBuffer: 2 * 1024 * 1024, timeout: 65000 }
    ).toString('utf-8');
  } catch (err) {
    try { unlinkSync(inputFile); } catch { /* */ }
    console.error('[scorecard] curl error:', err instanceof Error ? err.message : err);
    return null;
  }

  try { unlinkSync(inputFile); } catch { /* */ }

  let response: Record<string, unknown>;
  try {
    response = JSON.parse(raw);
  } catch {
    console.error('[scorecard] invalid JSON response:', raw.slice(0, 200));
    return null;
  }

  if (response.error) {
    console.error('[scorecard] API error:', response.error);
    return null;
  }

  const content = response.content as Array<{ type: string; text: string }> | undefined;
  const text = content && content.length > 0 && content[0].type === 'text' ? content[0].text : '';
  const usage = response.usage as { input_tokens: number; output_tokens: number } | undefined;

  return {
    text,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Entity data preparation
// ---------------------------------------------------------------------------

function prepareEntityData(entity: EntityRecord): Record<string, unknown> {
  const data = { ...entity.data };
  // Remove internal metadata — LLM doesn't need it
  for (const key of Object.keys(data)) {
    if (key.startsWith('_')) delete data[key];
  }
  // Remove old scorecard if re-running
  delete data.scorecard;

  return {
    name: entity.name,
    url: entity.url,
    domain: entity.domain,
    nip: entity.nip,
    ...data,
    financials: entity.financials,
  };
}

// ---------------------------------------------------------------------------
// Main phase function
// ---------------------------------------------------------------------------

/**
 * Generate scorecard for a single entity.
 * sectorStats must be pre-computed and bound via closure before passing to runEntityPhase.
 */
export function createScorecardEnricher(sectorStats: SectorStats) {
  const prompt = buildScorecardPrompt(sectorStats);

  return async function enrichScorecard(entity: EntityRecord): Promise<EntityRecord> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ...entity,
        data: {
          ...entity.data,
          scorecard: { skipped: true, reason: 'ANTHROPIC_API_KEY not set' },
        },
      };
    }

    const entityData = prepareEntityData(entity);
    const entityJson = JSON.stringify(entityData, null, 2);

    const result = callHaiku(prompt, entityJson, apiKey);
    if (!result) {
      return {
        ...entity,
        data: {
          ...entity.data,
          scorecard: { skipped: true, reason: 'LLM call failed' },
        },
      };
    }

    // Parse JSON response
    let jsonStr = result.text;
    const jsonMatch = result.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    let scorecard: Scorecard;
    try {
      scorecard = JSON.parse(jsonStr.trim());
      scorecard.generatedAt = new Date().toISOString();
    } catch {
      return {
        ...entity,
        data: {
          ...entity.data,
          scorecard: { skipped: true, reason: 'JSON parse error', raw: result.text.slice(0, 500) },
        },
      };
    }

    // Haiku pricing: $0.80/1M input, $4/1M output
    const cost = (result.inputTokens * 0.80 + result.outputTokens * 4.0) / 1_000_000;

    return {
      ...entity,
      data: {
        ...entity.data,
        scorecard,
        _cost_scorecard: { usd: Math.round(cost * 10000) / 10000 },
      },
    };
  };
}
