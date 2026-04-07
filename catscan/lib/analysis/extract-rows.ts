/**
 * Extract flattened BrandRow[] from scan_results for analysis.
 *
 * This is the single point where the raw JSON blob is parsed into
 * typed, normalized, analysis-ready rows.
 */

import type { BrandRow } from './types';
import {
  normalizeCities,
  normalizeDietTypes,
  priceTier,
  parsePostingFrequency,
  estimateSizeTier,
} from './normalize';

// Safe accessor helpers
function num(obj: unknown, ...path: string[]): number | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur === 'number' && !isNaN(cur)) return cur;
  if (typeof cur === 'string') {
    const n = parseFloat(cur);
    return isNaN(n) ? null : n;
  }
  return null;
}

function str(obj: unknown, ...path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'string' ? cur : null;
}

function arr(obj: unknown, ...path: string[]): unknown[] {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return [];
    cur = (cur as Record<string, unknown>)[key];
  }
  return Array.isArray(cur) ? cur : [];
}

function bool(obj: unknown, ...path: string[]): boolean {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur === true;
}

function obj(data: unknown, ...path: string[]): Record<string, unknown> | null {
  let cur: unknown = data;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur as Record<string, unknown> : null;
}

/**
 * Convert a single scan_results row (slug + JSON data) to a BrandRow.
 */
export function toBrandRow(
  slug: string,
  name: string,
  domain: string | null,
  data: Record<string, unknown>,
  sectorMedianPrice: number | null,
): BrandRow {
  const social = obj(data, 'social');
  const ig = obj(social, 'instagram');
  const tt = obj(social, 'tiktok');
  const fb = obj(social, 'facebook');
  const yt = obj(social, 'youtube');
  const igContent = obj(ig, 'content');
  const ttContent = obj(tt, 'content');
  const ads = obj(data, 'ads');
  const gads = obj(data, 'google_ads');
  const reviews = obj(data, 'reviews');
  const finance = obj(data, 'finance');
  const scorecard = obj(data, 'scorecard');
  const scores = obj(scorecard, 'scores');
  const pricing = obj(data, 'pricing');
  const menu = obj(data, 'menu');
  const delivery = obj(data, 'delivery');
  const messaging = obj(data, 'messaging');
  const differentiators = obj(data, 'differentiators');
  const visual = obj(data, 'visual');
  const seo = obj(data, 'seo');
  const ws = obj(data, 'website_structure');
  const infPress = obj(data, 'influencer_press');
  const infIg = obj(data, 'influencer_ig');

  // Pricing
  const cheapestDaily = num(pricing, 'cheapest_daily');
  const pricePremiumVal = (cheapestDaily != null && sectorMedianPrice != null && sectorMedianPrice > 0)
    ? parseFloat(((cheapestDaily - sectorMedianPrice) / sectorMedianPrice).toFixed(3))
    : null;

  // Social
  const igEngRate = num(ig, 'engagementRate');
  const ttEngRate = num(tt, 'engagementRate');
  const totalFollowers = num(social, 'totalFollowers');

  // Ads computed
  const metaCount = num(ads, 'activeAdsCount') ?? 0;
  const metaAvgDur = num(ads, 'avgAdDurationDays') ?? 0;
  const gadsCount = num(gads, 'totalAdsFound') ?? 0;
  const gadsAvgDur = num(gads, 'avgAdDurationDays') ?? 0;
  const adExposure = (metaCount * metaAvgDur) + (gadsCount * gadsAvgDur);

  // Reviews computed
  const gRating = num(reviews, 'google', 'rating');
  const gCount = num(reviews, 'google', 'reviewCount');
  const reviewQuality = (gRating != null && gCount != null && gCount > 0)
    ? parseFloat((gRating * Math.log10(gCount + 1)).toFixed(2))
    : null;

  // Finance
  const rev = num(finance, 'revenue');
  const revPrev = num(finance, 'revenuePrevious');
  const revSource = str(finance, 'revenue_source');
  const pplxConf = str(finance, 'perplexity_estimate', 'confidence');
  let revGrowth = num(finance, 'ratios', 'revenueGrowth');
  // Compute growth from Perplexity estimates if missing
  if (revGrowth == null && rev != null && revPrev != null && revPrev > 0) {
    revGrowth = parseFloat(((rev - revPrev) / revPrev).toFixed(4));
  }
  let reliability: BrandRow['revenueReliability'] = 'unavailable';
  if (revSource === 'krs' && rev != null) reliability = 'krs';
  else if (revSource === 'perplexity-estimate') {
    if (pplxConf === 'high') reliability = 'estimate-high';
    else if (pplxConf === 'medium') reliability = 'estimate-medium';
    else reliability = 'estimate-low';
  }

  // Influencers
  const pressPartnerships = arr(infPress, 'partnerships').length;
  const igInfluencers = num(infIg, 'unique_influencers') ?? 0;
  const igInflReach = num(infIg, 'total_reach_followers');

  // Diet types & cities
  const dietTypes = arr(menu, 'diet_types').map(String);
  const deliveryCities = arr(delivery, 'delivery_cities').map(String);

  // Scorecard signals
  const signals = arr(scorecard, 'signals')
    .map(s => str(s as Record<string, unknown>, 'type'))
    .filter((s): s is string => s != null);

  // Size tier
  const sizeTier = estimateSizeTier({
    totalFollowers,
    googleReviewCount: gCount,
    deliveryCityCount: deliveryCities.length,
    dietCount: dietTypes.length,
    metaAdsCount: metaCount,
    googleAdsCount: gadsCount,
  });

  return {
    slug,
    name,
    domain,
    cheapestDaily,
    mostExpensiveDaily: num(pricing, 'most_expensive_daily'),
    priceTier: priceTier(cheapestDaily),
    pricePremium: pricePremiumVal,
    igFollowers: num(ig, 'followers'),
    igEngagementRate: igEngRate,
    igEngagementTrend: str(igContent, 'engagementTrend'),
    igPostingFreqPerWeek: parsePostingFrequency(str(igContent, 'postingFrequency')),
    igContentMix: obj(igContent, 'contentMix') as Record<string, number> | null,
    igAvgLikesRecent: num(igContent, 'avgLikesRecent'),
    igAvgLikesHistorical: num(igContent, 'avgLikesHistorical'),
    ttFollowers: num(tt, 'followers'),
    ttEngagementRate: ttEngRate,
    ttEngagementTrend: str(ttContent, 'engagementTrend'),
    ttPostingFreqPerWeek: parsePostingFrequency(str(ttContent, 'postingFrequency')),
    ttAvgViewsRecent: num(ttContent, 'avgViewsRecent'),
    fbFollowers: num(fb, 'followers'),
    ytSubscribers: num(yt, 'subscribers'),
    totalFollowers,
    platformCount: num(social, 'platformCount'),
    metaAdsCount: metaCount,
    metaAdIntensity: str(ads, 'estimatedIntensity'),
    metaAvgAdDuration: metaAvgDur,
    googleAdsCount: gadsCount,
    googleAdIntensity: str(gads, 'estimatedIntensity'),
    adExposureScore: adExposure > 0 ? adExposure : null,
    googleRating: gRating,
    googleReviewCount: gCount,
    dietlyRating: num(reviews, 'dietly', 'rating'),
    dietlyReviewCount: num(reviews, 'dietly', 'reviewCount'),
    reviewSentiment: str(reviews, 'sentiment'),
    reviewQualityScore: reviewQuality,
    revenue: rev,
    revenuePrevious: revPrev,
    revenueGrowth: revGrowth,
    netIncome: num(finance, 'netIncome'),
    netMargin: num(finance, 'ratios', 'netMargin'),
    operatingMargin: num(finance, 'ratios', 'operatingMargin'),
    revenueSource: revSource,
    revenueReliability: reliability,
    influencerPartnerships: pressPartnerships + igInfluencers,
    influencerIgReach: igInflReach,
    influencerUniqueCount: igInfluencers,
    emotionalRegister: str(messaging, 'emotional_register'),
    competitiveAdvantage: str(differentiators, 'competitive_advantage_type'),
    nicheFocus: str(differentiators, 'niche_focus'),
    clicheScore: num(messaging, 'cliche_score'),
    dietTypes,
    dietTypesNormalized: normalizeDietTypes(dietTypes),
    dietCount: dietTypes.length,
    deliveryCities,
    deliveryCitiesNormalized: normalizeCities(deliveryCities),
    deliveryCityCount: deliveryCities.length,
    deliveryModel: str(delivery, 'delivery_model'),
    overallAesthetic: str(visual, 'overall_aesthetic'),
    visualQualityScore: num(visual, 'visual_quality_score'),
    contentStrategy: str(seo, 'content_strategy'),
    hasBlog: bool(ws, 'has_blog'),
    hasCalculator: bool(ws, 'has_calculator'),
    orderingUx: str(ws, 'ordering_ux'),
    scorecardOverall: num(scores, 'overall'),
    scorecardPriceCompetitiveness: num(scores, 'price_competitiveness'),
    scorecardSocialPresence: num(scores, 'social_presence'),
    scorecardAdIntensity: num(scores, 'ad_intensity'),
    scorecardReviewReputation: num(scores, 'review_reputation'),
    scorecardBrandAwareness: num(scores, 'brand_awareness'),
    scorecardFinancialHealth: num(scores, 'financial_health'),
    scorecardContentQuality: num(scores, 'content_quality'),
    scorecardInfluencerReach: num(scores, 'influencer_reach'),
    scorecardSegment: str(scorecard, 'segment'),
    scorecardSignals: signals,
    sizeTier,
  };
}
