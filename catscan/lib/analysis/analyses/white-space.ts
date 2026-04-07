/**
 * Analysis 4: Competitive White Space Radar
 *
 * Cross-references: delivery_cities × diet_types × price_tier × review quality
 * Target audience: CEO + Business Development
 */

import type { BrandRow, WhiteSpaceResult } from '../types';

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2));
}

function competitionLevel(count: number): WhiteSpaceResult['data']['cityDietMatrix'][0]['competitionLevel'] {
  if (count === 0) return 'empty';
  if (count <= 2) return 'low';
  if (count <= 5) return 'moderate';
  if (count <= 15) return 'high';
  return 'saturated';
}

export function analyzeWhiteSpace(brands: BrandRow[]): WhiteSpaceResult {
  // --- 1. City × Diet matrix ---
  // Use normalized cities & diets
  const matrix = new Map<string, { brands: Set<string>; ratings: number[] }>();

  for (const b of brands) {
    const cities = b.deliveryCitiesNormalized.length > 0 ? b.deliveryCitiesNormalized : ['unknown'];
    const diets = b.dietTypesNormalized.length > 0 ? b.dietTypesNormalized : ['unknown'];

    for (const city of cities) {
      for (const diet of diets) {
        const key = `${city}||${diet}`;
        if (!matrix.has(key)) matrix.set(key, { brands: new Set(), ratings: [] });
        const cell = matrix.get(key)!;
        cell.brands.add(b.slug);
        if (b.googleRating != null) cell.ratings.push(b.googleRating);
      }
    }
  }

  const cityDietMatrix = [...matrix.entries()]
    .map(([key, cell]) => {
      const [city, dietType] = key.split('||');
      return {
        city,
        dietType,
        priceTier: null as string | null,
        brandCount: cell.brands.size,
        brands: [...cell.brands],
        avgRating: avg(cell.ratings),
        competitionLevel: competitionLevel(cell.brands.size),
      };
    })
    .filter(c => c.city !== 'unknown')
    .sort((a, b) => a.brandCount - b.brandCount);

  // --- 2. Underserved niches (diet types with few players) ---
  const dietCounts = new Map<string, { brands: Set<string>; ratings: number[]; reviewVolume: number }>();
  for (const b of brands) {
    for (const diet of b.dietTypesNormalized) {
      if (!dietCounts.has(diet)) dietCounts.set(diet, { brands: new Set(), ratings: [], reviewVolume: 0 });
      const d = dietCounts.get(diet)!;
      d.brands.add(b.slug);
      if (b.googleRating != null) d.ratings.push(b.googleRating);
      d.reviewVolume += b.googleReviewCount ?? 0;
    }
  }

  const underservedNiches = [...dietCounts.entries()]
    .map(([diet, d]) => ({
      dietType: diet,
      brandCount: d.brands.size,
      avgRating: avg(d.ratings),
      demandProxy: Math.round(d.reviewVolume / Math.max(d.brands.size, 1)),
    }))
    .filter(n => n.brandCount <= 10 && n.dietType !== 'other' && n.dietType !== 'unknown')
    .sort((a, b) => a.brandCount - b.brandCount);

  // --- 3. City competition overview ---
  const cityMap = new Map<string, { brands: Set<string>; prices: number[]; diets: Map<string, number> }>();
  for (const b of brands) {
    for (const city of b.deliveryCitiesNormalized) {
      if (!cityMap.has(city)) cityMap.set(city, { brands: new Set(), prices: [], diets: new Map() });
      const c = cityMap.get(city)!;
      c.brands.add(b.slug);
      if (b.cheapestDaily != null) c.prices.push(b.cheapestDaily);
      for (const diet of b.dietTypesNormalized) {
        c.diets.set(diet, (c.diets.get(diet) ?? 0) + 1);
      }
    }
  }

  const maxBrandsInCity = Math.max(...[...cityMap.values()].map(c => c.brands.size), 1);

  const cityCompetition = [...cityMap.entries()]
    .map(([city, c]) => ({
      city,
      totalBrands: c.brands.size,
      avgPrice: avg(c.prices),
      topDiets: [...c.diets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d),
      saturationScore: Math.round((c.brands.size / maxBrandsInCity) * 100),
    }))
    .sort((a, b) => b.totalBrands - a.totalBrands);

  // --- 4. White spots — high opportunity areas ---
  const whiteSpots: WhiteSpaceResult['data']['whiteSpots'] = [];

  // Find city+diet combos with 0-2 players in cities with >=5 brands total
  const activeCities = new Set(
    cityCompetition.filter(c => c.totalBrands >= 5).map(c => c.city)
  );
  // Popular diets (offered by >=10% of brands)
  const popularDiets = new Set(
    [...dietCounts.entries()]
      .filter(([, d]) => d.brands.size >= brands.length * 0.1)
      .map(([diet]) => diet)
  );

  for (const entry of cityDietMatrix) {
    if (!activeCities.has(entry.city)) continue;
    if (!popularDiets.has(entry.dietType)) continue;
    if (entry.brandCount > 2) continue;

    // Opportunity = city size × diet popularity × inverse competition
    const citySize = cityMap.get(entry.city)?.brands.size ?? 0;
    const dietPopularity = dietCounts.get(entry.dietType)?.brands.size ?? 0;
    const opportunity = Math.round(
      (citySize / maxBrandsInCity) * (dietPopularity / brands.length) * (1 / Math.max(entry.brandCount, 0.5)) * 100
    );

    whiteSpots.push({
      city: entry.city,
      dietType: entry.dietType,
      priceTier: 'mid', // default recommendation
      reason: entry.brandCount === 0
        ? `Brak oferty ${entry.dietType} w ${entry.city} mimo ${citySize} graczy w mieście`
        : `Tylko ${entry.brandCount} gracz(e) ${entry.dietType} w ${entry.city} (${citySize} marek w mieście)`,
      opportunityScore: Math.min(opportunity, 100),
    });
  }

  whiteSpots.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return {
    id: 'white-space',
    name: 'Competitive White Space Radar',
    description: 'Mapa białych plam rynkowych: kombinacje miasto × dieta × cena z niską konkurencją. Identyfikacja niedoreprezentowanych nisz i miast.',
    generatedAt: new Date().toISOString(),
    brandCount: brands.length,
    data: {
      cityDietMatrix: cityDietMatrix.slice(0, 200), // cap output
      underservedNiches,
      cityCompetition: cityCompetition.slice(0, 50),
      whiteSpots: whiteSpots.slice(0, 50),
    },
  };
}
