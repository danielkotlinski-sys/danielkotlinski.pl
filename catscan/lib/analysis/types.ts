/**
 * Shared types for cross-analysis modules.
 */

// ---------------------------------------------------------------------------
// Brand data row — flattened from scan_results JSON for analysis
// ---------------------------------------------------------------------------

export interface BrandRow {
  slug: string;
  name: string;
  domain: string | null;

  // Pricing
  cheapestDaily: number | null;
  mostExpensiveDaily: number | null;
  priceTier: string | null;
  pricePremium: number | null; // deviation from sector median (-1 to +1)

  // Social
  igFollowers: number | null;
  igEngagementRate: number | null;
  igEngagementTrend: string | null;
  igPostingFreqPerWeek: number | null;
  igContentMix: Record<string, number> | null;
  igAvgLikesRecent: number | null;
  igAvgLikesHistorical: number | null;
  ttFollowers: number | null;
  ttEngagementRate: number | null;
  ttEngagementTrend: string | null;
  ttPostingFreqPerWeek: number | null;
  ttAvgViewsRecent: number | null;
  fbFollowers: number | null;
  ytSubscribers: number | null;
  totalFollowers: number | null;
  platformCount: number | null;

  // Ads
  metaAdsCount: number | null;
  metaAdIntensity: string | null;
  metaAvgAdDuration: number | null;
  googleAdsCount: number | null;
  googleAdIntensity: string | null;
  adExposureScore: number | null; // activeAds * avgDuration

  // Reviews
  googleRating: number | null;
  googleReviewCount: number | null;
  dietlyRating: number | null;
  dietlyReviewCount: number | null;
  reviewSentiment: string | null;
  reviewQualityScore: number | null; // rating * log(count)

  // Finance
  revenue: number | null;
  revenuePrevious: number | null;
  revenueGrowth: number | null;
  netIncome: number | null;
  netMargin: number | null;
  operatingMargin: number | null;
  revenueSource: string | null; // 'krs' | 'perplexity-estimate'
  revenueReliability: 'krs' | 'estimate-high' | 'estimate-medium' | 'estimate-low' | 'unavailable';

  // Influencers
  influencerPartnerships: number | null;
  influencerIgReach: number | null;
  influencerUniqueCount: number | null;

  // Brand identity
  emotionalRegister: string | null;
  competitiveAdvantage: string | null;
  nicheFocus: string | null;
  clicheScore: number | null;

  // Menu & delivery
  dietTypes: string[];
  dietTypesNormalized: string[];
  dietCount: number;
  deliveryCities: string[];
  deliveryCitiesNormalized: string[];
  deliveryCityCount: number;
  deliveryModel: string | null;

  // Visual
  overallAesthetic: string | null;
  visualQualityScore: number | null;

  // Website
  contentStrategy: string | null;
  hasBlog: boolean;
  hasCalculator: boolean;
  orderingUx: string | null;

  // Scorecard (LLM-generated)
  scorecardOverall: number | null;
  scorecardPriceCompetitiveness: number | null;
  scorecardSocialPresence: number | null;
  scorecardAdIntensity: number | null;
  scorecardReviewReputation: number | null;
  scorecardBrandAwareness: number | null;
  scorecardFinancialHealth: number | null;
  scorecardContentQuality: number | null;
  scorecardInfluencerReach: number | null;
  scorecardSegment: string | null;
  scorecardSignals: string[];

  // Computed
  sizeTier: string;
}

// ---------------------------------------------------------------------------
// Analysis result types
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  id: string;
  name: string;
  description: string;
  generatedAt: string;
  brandCount: number;
  data: unknown;
}

export interface ContentEfficiencyResult extends AnalysisResult {
  data: {
    platformBenchmarks: Array<{
      platform: string;
      avgEngagementRate: number | null;
      medianEngagementRate: number | null;
      avgPostingFreq: number | null;
      brandCount: number;
    }>;
    contentTypePerformance: Array<{
      platform: string;
      contentType: string;
      avgLikes: number;
      avgComments: number;
      postCount: number;
      brandCount: number;
    }>;
    hashtagEffectiveness: Array<{
      hashtag: string;
      avgLikes: number;
      avgEngagement: number;
      usedByBrands: number;
      totalPosts: number;
    }>;
    optimalFrequency: Array<{
      platform: string;
      frequencyBucket: string;
      avgEngagementRate: number;
      brandCount: number;
    }>;
    topPerformers: Array<{
      slug: string;
      name: string;
      platform: string;
      engagementRate: number;
      postingFreq: number | null;
      dominantContentType: string | null;
    }>;
    nicheBenchmarks: Array<{
      niche: string;
      avgIgEngagement: number | null;
      avgTtEngagement: number | null;
      avgPostingFreq: number | null;
      brandCount: number;
    }>;
  };
}

export interface WhiteSpaceResult extends AnalysisResult {
  data: {
    cityDietMatrix: Array<{
      city: string;
      dietType: string;
      priceTier: string | null;
      brandCount: number;
      brands: string[];
      avgRating: number | null;
      competitionLevel: 'empty' | 'low' | 'moderate' | 'high' | 'saturated';
    }>;
    underservedNiches: Array<{
      dietType: string;
      brandCount: number;
      avgRating: number | null;
      demandProxy: number; // based on review volume in adjacent segments
    }>;
    cityCompetition: Array<{
      city: string;
      totalBrands: number;
      avgPrice: number | null;
      topDiets: string[];
      saturationScore: number; // 0-100
    }>;
    whiteSpots: Array<{
      city: string;
      dietType: string;
      priceTier: string;
      reason: string;
      opportunityScore: number; // 0-100
    }>;
  };
}

export interface PricingPowerResult extends AnalysisResult {
  data: {
    sectorMedianPrice: number;
    priceTierDistribution: Record<string, number>;
    pricingPowerRanking: Array<{
      slug: string;
      name: string;
      cheapestDaily: number;
      pricePremium: number;
      reviewQualityScore: number | null;
      igEngagementRate: number | null;
      emotionalRegister: string | null;
      overallAesthetic: string | null;
      netMargin: number | null;
      pricingPowerIndex: number; // -100 to +100
    }>;
    premiumDrivers: Array<{
      factor: string;
      correlation: number; // -1 to +1
      premiumBrandAvg: number | null;
      budgetBrandAvg: number | null;
      description: string;
    }>;
    priceTraps: Array<{
      slug: string;
      name: string;
      cheapestDaily: number;
      netMargin: number | null;
      reviewRating: number | null;
      warning: string;
    }>;
  };
}

export interface MarketingRoiResult extends AnalysisResult {
  data: {
    adIntensityVsGrowth: Array<{
      slug: string;
      name: string;
      adExposureScore: number;
      metaAdsCount: number;
      googleAdsCount: number;
      revenueGrowth: number | null;
      revenue: number | null;
      sizeTier: string;
      revenueReliability: string;
    }>;
    channelEfficiency: Array<{
      channel: string;
      brandsUsing: number;
      avgGrowthUsers: number | null;
      avgGrowthNonUsers: number | null;
      liftPercent: number | null;
    }>;
    roiQuadrants: {
      efficient: string[];   // high growth, low ad spend
      investing: string[];   // high growth, high ad spend
      burning: string[];     // low growth, high ad spend
      dormant: string[];     // low growth, low ad spend
    };
    sampleSize: number;
    caveat: string;
  };
}

export interface BrandHealthResult extends AnalysisResult {
  data: {
    correlations: Array<{
      metric: string;
      vsRevenueGrowth: number | null;
      vsNetMargin: number | null;
      sampleSize: number;
    }>;
    leadingIndicators: string[];
    hiddenGems: Array<{
      slug: string;
      name: string;
      scorecardOverall: number | null;
      strongestDimension: string;
      revenue: number | null;
      sizeTier: string;
    }>;
    atRisk: Array<{
      slug: string;
      name: string;
      weakestDimension: string;
      trend: string;
      revenue: number | null;
    }>;
    sampleSize: number;
    caveat: string;
  };
}
