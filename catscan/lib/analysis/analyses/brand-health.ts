/**
 * Analysis 5: Brand Health vs Financial Performance
 *
 * Cross-references: scorecard dimensions × revenue × growth × margins
 * Target audience: CEO/Board — "które metryki brandowe przewidują wyniki?"
 *
 * CAVEAT: Limited to ~30-40 brands with financial data.
 */

import type { BrandRow, BrandHealthResult } from '../types';

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 5 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return null;
  return parseFloat((num / denom).toFixed(3));
}

const SCORECARD_DIMS = [
  { key: 'scorecardPriceCompetitiveness' as keyof BrandRow, label: 'Price Competitiveness' },
  { key: 'scorecardSocialPresence' as keyof BrandRow, label: 'Social Presence' },
  { key: 'scorecardAdIntensity' as keyof BrandRow, label: 'Ad Intensity' },
  { key: 'scorecardReviewReputation' as keyof BrandRow, label: 'Review Reputation' },
  { key: 'scorecardBrandAwareness' as keyof BrandRow, label: 'Brand Awareness' },
  { key: 'scorecardContentQuality' as keyof BrandRow, label: 'Content Quality' },
  { key: 'scorecardInfluencerReach' as keyof BrandRow, label: 'Influencer Reach' },
  { key: 'scorecardOverall' as keyof BrandRow, label: 'Overall Score' },
];

/** Safe accessor for dynamic BrandRow keys */
function getNum(b: BrandRow, key: keyof BrandRow): number | null {
  const val = b[key];
  return typeof val === 'number' ? val : null;
}

export function analyzeBrandHealth(brands: BrandRow[]): BrandHealthResult {
  // Brands with financial data + scorecard
  const withBoth = brands.filter(b =>
    b.scorecardOverall != null &&
    b.revenueGrowth != null &&
    (b.revenueReliability === 'krs' || b.revenueReliability === 'estimate-high')
  );

  const withMargin = withBoth.filter(b => b.netMargin != null);

  // --- 1. Correlations: each scorecard dimension vs revenue growth & net margin ---
  const correlations = SCORECARD_DIMS.map(({ key, label }) => {
    const validGrowth = withBoth.filter(b => getNum(b, key) != null);
    const validMargin = withMargin.filter(b => getNum(b, key) != null);

    return {
      metric: label,
      vsRevenueGrowth: pearson(
        validGrowth.map(b => getNum(b, key)!),
        validGrowth.map(b => b.revenueGrowth!),
      ),
      vsNetMargin: pearson(
        validMargin.map(b => getNum(b, key)!),
        validMargin.map(b => b.netMargin!),
      ),
      sampleSize: validGrowth.length,
    };
  });

  // Also add computed metrics (not from LLM scorecard)
  const computedMetrics: Array<{ key: keyof BrandRow; label: string }> = [
    { key: 'igEngagementRate', label: 'IG Engagement Rate (computed)' },
    { key: 'reviewQualityScore', label: 'Review Quality Score (computed)' },
    { key: 'adExposureScore', label: 'Ad Exposure Score (computed)' },
    { key: 'totalFollowers', label: 'Total Social Followers (computed)' },
    { key: 'visualQualityScore', label: 'Visual Quality Score' },
  ];

  for (const { key, label } of computedMetrics) {
    const validGrowth = withBoth.filter(b => getNum(b, key) != null);
    const validMargin = withMargin.filter(b => getNum(b, key) != null);

    if (validGrowth.length >= 5) {
      correlations.push({
        metric: label,
        vsRevenueGrowth: pearson(
          validGrowth.map(b => getNum(b, key)!),
          validGrowth.map(b => b.revenueGrowth!),
        ),
        vsNetMargin: validMargin.length >= 5 ? pearson(
          validMargin.map(b => getNum(b, key)!),
          validMargin.map(b => b.netMargin!),
        ) : null,
        sampleSize: validGrowth.length,
      });
    }
  }

  // Sort by strongest correlation with growth
  correlations.sort((a, b) =>
    Math.abs(b.vsRevenueGrowth ?? 0) - Math.abs(a.vsRevenueGrowth ?? 0)
  );

  // --- 2. Leading indicators (top 3 by |correlation with growth|) ---
  const leadingIndicators = correlations
    .filter(c => c.vsRevenueGrowth != null && Math.abs(c.vsRevenueGrowth) > 0.15)
    .slice(0, 3)
    .map(c => `${c.metric} (r=${c.vsRevenueGrowth!.toFixed(2)} vs growth, N=${c.sampleSize})`);

  // --- 3. Hidden gems: high brand score but low revenue/small size ---
  const allWithScorecard = brands.filter(b => b.scorecardOverall != null);
  const scorecardMedian = (() => {
    const sorted = allWithScorecard.map(b => b.scorecardOverall!).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 50;
  })();

  const hiddenGems = allWithScorecard
    .filter(b => {
      const highScore = b.scorecardOverall! > scorecardMedian + 10;
      const smallSize = b.sizeTier === 'micro' || b.sizeTier === 'small';
      const lowRevenue = b.revenue == null || b.revenue < 5_000_000;
      return highScore && (smallSize || lowRevenue);
    })
    .map(b => {
      // Find strongest dimension
      const dims = SCORECARD_DIMS.slice(0, -1); // exclude overall
      let strongest = 'unknown';
      let maxScore = -1;
      for (const { key, label } of dims) {
        const val = getNum(b, key);
        if (val != null && val > maxScore) {
          maxScore = val;
          strongest = label;
        }
      }
      return {
        slug: b.slug,
        name: b.name,
        scorecardOverall: b.scorecardOverall,
        strongestDimension: strongest,
        revenue: b.revenue,
        sizeTier: b.sizeTier,
      };
    })
    .sort((a, b) => (b.scorecardOverall ?? 0) - (a.scorecardOverall ?? 0))
    .slice(0, 15);

  // --- 4. At risk: declining engagement + still decent revenue ---
  const atRisk = brands
    .filter(b => {
      const hasRevenue = b.revenue != null && b.revenue > 2_000_000;
      const declining = b.igEngagementTrend === 'declining' || b.ttEngagementTrend === 'declining';
      const lowScore = b.scorecardOverall != null && b.scorecardOverall < scorecardMedian - 5;
      return hasRevenue && (declining || lowScore);
    })
    .map(b => {
      // Find weakest dimension
      const dims = SCORECARD_DIMS.slice(0, -1);
      let weakest = 'unknown';
      let minScore = 101;
      for (const { key, label } of dims) {
        const val = getNum(b, key);
        if (val != null && val < minScore) {
          minScore = val;
          weakest = label;
        }
      }
      const trend = b.igEngagementTrend === 'declining' ? 'IG engagement declining'
        : b.ttEngagementTrend === 'declining' ? 'TT engagement declining'
        : `Scorecard ${b.scorecardOverall}/100`;
      return {
        slug: b.slug,
        name: b.name,
        weakestDimension: weakest,
        trend,
        revenue: b.revenue,
      };
    })
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    .slice(0, 15);

  return {
    id: 'brand-health',
    name: 'Brand Health vs Financial Performance',
    description: 'Korelacje między metrykami brandowymi a wynikami finansowymi. Leading indicators, hidden gems, marki at-risk.',
    generatedAt: new Date().toISOString(),
    brandCount: brands.length,
    data: {
      correlations,
      leadingIndicators,
      hiddenGems,
      atRisk,
      sampleSize: withBoth.length,
      caveat: `Korelacje oparte na ${withBoth.length} markach z danymi finansowymi i scorecardem. Przy N<40 interpretuj ostrożnie — to kierunki, nie dowody statystyczne. Silniejsze wnioski po rozszerzeniu bazy KRS.`,
    },
  };
}
