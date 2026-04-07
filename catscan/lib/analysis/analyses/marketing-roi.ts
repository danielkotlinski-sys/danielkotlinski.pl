/**
 * Analysis 1: Marketing ROI — Ad Spend vs Revenue Growth
 *
 * Cross-references: ads intensity × revenue growth × social followers × influencers
 * Target audience: CEO — "gdzie alokować budżet marketingowy?"
 *
 * CAVEAT: Financial data available for ~30-40 brands (KRS).
 * Uses sizeTier as proxy for remaining brands.
 */

import type { BrandRow, MarketingRoiResult } from '../types';

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(4));
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeMarketingRoi(brands: BrandRow[]): MarketingRoiResult {
  // Core dataset: brands with both ad data AND revenue growth
  const withFinance = brands.filter(b =>
    b.revenueGrowth != null &&
    (b.revenueReliability === 'krs' || b.revenueReliability === 'estimate-high')
  );

  // Extended dataset: all brands with ad data (use sizeTier as proxy)
  const withAds = brands.filter(b => b.adExposureScore != null && b.adExposureScore > 0);

  // --- 1. Ad intensity vs growth scatter data ---
  const adVsGrowth = withFinance.map(b => ({
    slug: b.slug,
    name: b.name,
    adExposureScore: b.adExposureScore ?? 0,
    metaAdsCount: b.metaAdsCount ?? 0,
    googleAdsCount: b.googleAdsCount ?? 0,
    revenueGrowth: b.revenueGrowth,
    revenue: b.revenue,
    sizeTier: b.sizeTier,
    revenueReliability: b.revenueReliability,
  })).sort((a, b) => (b.revenueGrowth ?? 0) - (a.revenueGrowth ?? 0));

  // --- 2. Channel efficiency ---
  const channels = [
    {
      channel: 'Meta Ads (FB/IG)',
      hasChannel: (b: BrandRow) => (b.metaAdsCount ?? 0) > 0,
    },
    {
      channel: 'Google Ads',
      hasChannel: (b: BrandRow) => (b.googleAdsCount ?? 0) > 0,
    },
    {
      channel: 'Influencer Marketing',
      hasChannel: (b: BrandRow) => (b.influencerPartnerships ?? 0) > 0,
    },
    {
      channel: 'Instagram (organic, >5k followers)',
      hasChannel: (b: BrandRow) => (b.igFollowers ?? 0) > 5000,
    },
    {
      channel: 'TikTok (any presence)',
      hasChannel: (b: BrandRow) => (b.ttFollowers ?? 0) > 0,
    },
    {
      channel: 'Content Marketing (regular blog)',
      hasChannel: (b: BrandRow) => b.contentStrategy === 'regular' || b.contentStrategy === 'aggressive',
    },
  ];

  const channelEfficiency = channels.map(({ channel, hasChannel }) => {
    const users = withFinance.filter(hasChannel);
    const nonUsers = withFinance.filter(b => !hasChannel(b));
    const userGrowth = avg(users.map(b => b.revenueGrowth!));
    const nonUserGrowth = avg(nonUsers.map(b => b.revenueGrowth!));
    const lift = (userGrowth != null && nonUserGrowth != null && nonUserGrowth !== 0)
      ? parseFloat(((userGrowth - nonUserGrowth) / Math.abs(nonUserGrowth) * 100).toFixed(1))
      : null;

    return {
      channel,
      brandsUsing: users.length,
      avgGrowthUsers: userGrowth,
      avgGrowthNonUsers: nonUserGrowth,
      liftPercent: lift,
    };
  });

  // --- 3. ROI quadrants ---
  const medianAdExposure = median(withFinance.map(b => b.adExposureScore ?? 0)) ?? 0;
  const medianGrowth = median(withFinance.map(b => b.revenueGrowth ?? 0)) ?? 0;

  const quadrants = {
    efficient: [] as string[],   // high growth, low spend
    investing: [] as string[],   // high growth, high spend
    burning: [] as string[],     // low growth, high spend
    dormant: [] as string[],     // low growth, low spend
  };

  for (const b of withFinance) {
    const highGrowth = (b.revenueGrowth ?? 0) > medianGrowth;
    const highSpend = (b.adExposureScore ?? 0) > medianAdExposure;

    if (highGrowth && !highSpend) quadrants.efficient.push(b.name);
    else if (highGrowth && highSpend) quadrants.investing.push(b.name);
    else if (!highGrowth && highSpend) quadrants.burning.push(b.name);
    else quadrants.dormant.push(b.name);
  }

  return {
    id: 'marketing-roi',
    name: 'Marketing ROI — Ad Spend vs Revenue Growth',
    description: 'Korelacja intensywności reklam z dynamiką przychodów. Efektywność kanałów marketingowych. Kwadranty ROI.',
    generatedAt: new Date().toISOString(),
    brandCount: brands.length,
    data: {
      adIntensityVsGrowth: adVsGrowth,
      channelEfficiency,
      roiQuadrants: quadrants,
      sampleSize: withFinance.length,
      caveat: `Analiza oparta na ${withFinance.length} markach z danymi finansowymi (${withFinance.filter(b => b.revenueReliability === 'krs').length} z KRS, ${withFinance.filter(b => b.revenueReliability === 'estimate-high').length} z szacunków Perplexity high-confidence). Dla pełniejszego obrazu rekomendujemy rozszerzenie bazy KRS.`,
    },
  };
}
