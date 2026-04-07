/**
 * Analysis 2: Pricing Power Index
 *
 * Cross-references: price × reviews × engagement × visual aesthetic × emotional register
 * Target audience: CEO — "co pozwala trzymać wyższą cenę?"
 */

import type { BrandRow, PricingPowerResult } from '../types';

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2));
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pearson correlation coefficient between two number arrays.
 * Returns null if insufficient data.
 */
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

export function analyzePricingPower(brands: BrandRow[]): PricingPowerResult {
  const withPrice = brands.filter(b => b.cheapestDaily != null && b.cheapestDaily > 0);
  const prices = withPrice.map(b => b.cheapestDaily!);
  const sectorMedian = median(prices);

  // --- Price tier distribution ---
  const tierDist: Record<string, number> = {};
  for (const b of withPrice) {
    const tier = b.priceTier || 'unknown';
    tierDist[tier] = (tierDist[tier] || 0) + 1;
  }

  // --- Pricing Power Index per brand ---
  // PPI = weighted(pricePremium, reviewQuality, engagement, visualQuality)
  // Positive PPI = justified premium (high price + high quality signals)
  // Negative PPI = unjustified premium OR underpriced

  // Normalize review quality to 0-1
  const rqScores = withPrice.map(b => b.reviewQualityScore).filter((v): v is number => v != null);
  const rqMax = Math.max(...rqScores, 1);

  const pricingRanking = withPrice.map(b => {
    const premium = b.pricePremium ?? 0;
    const rqNorm = b.reviewQualityScore != null ? b.reviewQualityScore / rqMax : 0;
    const engNorm = Math.min((b.igEngagementRate ?? 0) / 5, 1); // cap at 5%
    const visualNorm = (b.visualQualityScore ?? 5) / 10;

    // PPI: if price is high AND quality signals are strong → positive
    // if price is high BUT quality signals are weak → negative (overpriced)
    // if price is low AND quality signals are strong → negative (underpriced opportunity)
    const qualitySignal = (rqNorm * 0.4 + engNorm * 0.3 + visualNorm * 0.3);
    const ppi = Math.round((premium * 50 + (qualitySignal - 0.5) * 100) * 100) / 100;

    return {
      slug: b.slug,
      name: b.name,
      cheapestDaily: b.cheapestDaily!,
      pricePremium: premium,
      reviewQualityScore: b.reviewQualityScore,
      igEngagementRate: b.igEngagementRate,
      emotionalRegister: b.emotionalRegister,
      overallAesthetic: b.overallAesthetic,
      netMargin: b.netMargin,
      pricingPowerIndex: Math.max(-100, Math.min(100, ppi)),
    };
  }).sort((a, b) => b.pricingPowerIndex - a.pricingPowerIndex);

  // --- Premium drivers: what correlates with higher price? ---
  const premiumBrands = withPrice.filter(b => (b.pricePremium ?? 0) > 0.1);
  const budgetBrands = withPrice.filter(b => (b.pricePremium ?? 0) < -0.1);

  const drivers: PricingPowerResult['data']['premiumDrivers'] = [];

  // Review quality vs price
  const priceArr = withPrice.map(b => b.cheapestDaily!);
  const rqArr = withPrice.map(b => b.reviewQualityScore ?? 0);
  const rqCorr = pearson(priceArr, rqArr);
  drivers.push({
    factor: 'Review Quality Score',
    correlation: rqCorr ?? 0,
    premiumBrandAvg: avg(premiumBrands.map(b => b.reviewQualityScore).filter((v): v is number => v != null)),
    budgetBrandAvg: avg(budgetBrands.map(b => b.reviewQualityScore).filter((v): v is number => v != null)),
    description: 'Jakość recenzji (rating × log ilości) — czy dobre opinie uzasadniają wyższą cenę',
  });

  // IG Engagement vs price
  const engArr = withPrice.map(b => b.igEngagementRate ?? 0);
  const engCorr = pearson(priceArr, engArr);
  drivers.push({
    factor: 'Instagram Engagement Rate',
    correlation: engCorr ?? 0,
    premiumBrandAvg: avg(premiumBrands.map(b => b.igEngagementRate).filter((v): v is number => v != null)),
    budgetBrandAvg: avg(budgetBrands.map(b => b.igEngagementRate).filter((v): v is number => v != null)),
    description: 'Zaangażowanie społeczności na IG — silna społeczność = większa lojalność cenowa',
  });

  // Visual quality vs price
  const visArr = withPrice.map(b => b.visualQualityScore ?? 5);
  const visCorr = pearson(priceArr, visArr);
  drivers.push({
    factor: 'Visual Quality Score',
    correlation: visCorr ?? 0,
    premiumBrandAvg: avg(premiumBrands.map(b => b.visualQualityScore).filter((v): v is number => v != null)),
    budgetBrandAvg: avg(budgetBrands.map(b => b.visualQualityScore).filter((v): v is number => v != null)),
    description: 'Jakość wizualna strony — premium estetyka wspiera wyższe ceny',
  });

  // Diet count vs price
  const dietArr = withPrice.map(b => b.dietCount);
  const dietCorr = pearson(priceArr, dietArr);
  drivers.push({
    factor: 'Diet Variety (count)',
    correlation: dietCorr ?? 0,
    premiumBrandAvg: avg(premiumBrands.map(b => b.dietCount)),
    budgetBrandAvg: avg(budgetBrands.map(b => b.dietCount)),
    description: 'Szerokość oferty dietetycznej — więcej wariantów = uzasadnienie wyższej ceny?',
  });

  // Delivery city count vs price
  const cityArr = withPrice.map(b => b.deliveryCityCount);
  const cityCorr = pearson(priceArr, cityArr);
  drivers.push({
    factor: 'Delivery Reach (cities)',
    correlation: cityCorr ?? 0,
    premiumBrandAvg: avg(premiumBrands.map(b => b.deliveryCityCount)),
    budgetBrandAvg: avg(budgetBrands.map(b => b.deliveryCityCount)),
    description: 'Zasięg dostawy — skala operacji vs cena',
  });

  // Cliche score (inverse) vs price
  const clicheArr = withPrice.map(b => b.clicheScore ?? 5);
  const clicheCorr = pearson(priceArr, clicheArr);
  drivers.push({
    factor: 'Messaging Originality (inv. cliché)',
    correlation: clicheCorr ?? 0,
    premiumBrandAvg: avg(premiumBrands.map(b => b.clicheScore).filter((v): v is number => v != null)),
    budgetBrandAvg: avg(budgetBrands.map(b => b.clicheScore).filter((v): v is number => v != null)),
    description: 'Oryginalność komunikacji (0=oryginalna, 10=generyczna) — czy oryginalne marki biorą więcej?',
  });

  drivers.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // --- Price traps: low price AND low margin AND low reviews ---
  const priceTraps = withPrice
    .filter(b => {
      const isLowPrice = (b.pricePremium ?? 0) < -0.15;
      const isLowMargin = b.netMargin != null && b.netMargin < 0.03;
      const isLowReview = b.googleRating != null && b.googleRating < 4.0;
      return isLowPrice && (isLowMargin || isLowReview);
    })
    .map(b => ({
      slug: b.slug,
      name: b.name,
      cheapestDaily: b.cheapestDaily!,
      netMargin: b.netMargin,
      reviewRating: b.googleRating,
      warning: [
        b.netMargin != null && b.netMargin < 0.03 ? `Marża netto ${(b.netMargin * 100).toFixed(1)}%` : null,
        b.googleRating != null && b.googleRating < 4.0 ? `Rating Google ${b.googleRating}` : null,
        `Cena ${((b.pricePremium ?? 0) * 100).toFixed(0)}% poniżej mediany`,
      ].filter(Boolean).join(', '),
    }))
    .slice(0, 20);

  return {
    id: 'pricing-power',
    name: 'Pricing Power Index',
    description: 'Analiza zdolności cenowej: które czynniki pozwalają markom trzymać wyższe ceny. Ranking PPI, korelacje, price traps.',
    generatedAt: new Date().toISOString(),
    brandCount: withPrice.length,
    data: {
      sectorMedianPrice: sectorMedian,
      priceTierDistribution: tierDist,
      pricingPowerRanking: pricingRanking,
      premiumDrivers: drivers,
      priceTraps,
    },
  };
}
