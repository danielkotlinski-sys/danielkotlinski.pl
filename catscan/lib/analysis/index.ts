/**
 * Cross-Analysis Engine — entry point.
 *
 * 5 analyses for catering market intelligence:
 * 1. Marketing ROI (ads vs revenue growth)
 * 2. Pricing Power Index
 * 3. Content-to-Engagement Efficiency
 * 4. White Space Radar
 * 5. Brand Health vs Financial Performance
 *
 * Usage:
 *   import { runAllAnalyses, runAnalysis } from '@/lib/analysis';
 */

import { stmts } from '@/lib/db/sqlite';
import { toBrandRow } from './extract-rows';
import { analyzeContentEfficiency } from './analyses/content-efficiency';
import { analyzeWhiteSpace } from './analyses/white-space';
import { analyzePricingPower } from './analyses/pricing-power';
import { analyzeMarketingRoi } from './analyses/marketing-roi';
import { analyzeBrandHealth } from './analyses/brand-health';
import type { BrandRow, AnalysisResult } from './types';

// Re-export types
export type { BrandRow, AnalysisResult, ContentEfficiencyResult, WhiteSpaceResult, PricingPowerResult, MarketingRoiResult, BrandHealthResult } from './types';

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Load all scan results and convert to flattened BrandRow[]
 */
export function loadBrandRows(): BrandRow[] {
  const rows = stmts.getScannedBrands.all() as Array<Record<string, unknown>>;

  // Pre-compute sector median price for pricePremium
  const prices: number[] = [];
  for (const row of rows) {
    try {
      const data = JSON.parse((row.data as string) || '{}');
      const p = data?.pricing?.cheapest_daily;
      if (typeof p === 'number' && p > 0 && p < 500) prices.push(p);
    } catch { /* skip */ }
  }
  const sectorMedianPrice = median(prices);

  const brands: BrandRow[] = [];
  for (const row of rows) {
    try {
      const data = JSON.parse((row.data as string) || '{}');
      const brand = toBrandRow(
        row.slug as string,
        row.name as string,
        (row.domain as string) || null,
        data,
        sectorMedianPrice,
      );
      brands.push(brand);
    } catch {
      // Skip malformed rows
    }
  }

  return brands;
}

// ---------------------------------------------------------------------------
// Analysis runners
// ---------------------------------------------------------------------------

export type AnalysisId = 'content-efficiency' | 'white-space' | 'pricing-power' | 'marketing-roi' | 'brand-health';

const ANALYSES: Record<AnalysisId, (brands: BrandRow[]) => AnalysisResult> = {
  'content-efficiency': analyzeContentEfficiency,
  'white-space': analyzeWhiteSpace,
  'pricing-power': analyzePricingPower,
  'marketing-roi': analyzeMarketingRoi,
  'brand-health': analyzeBrandHealth,
};

export const ANALYSIS_LIST: Array<{ id: AnalysisId; name: string; description: string }> = [
  {
    id: 'content-efficiency',
    name: 'Content-to-Engagement Efficiency Matrix',
    description: 'Jaki content, na jakiej platformie, w jakiej częstotliwości daje najlepszy engagement?',
  },
  {
    id: 'white-space',
    name: 'Competitive White Space Radar',
    description: 'Białe plamy rynkowe: kombinacje miasto × dieta × cena z niską konkurencją.',
  },
  {
    id: 'pricing-power',
    name: 'Pricing Power Index',
    description: 'Co pozwala markom trzymać wyższe ceny? Korelacje ceny z jakością, social proof, estetyką.',
  },
  {
    id: 'marketing-roi',
    name: 'Marketing ROI — Ad Spend vs Growth',
    description: 'Efektywność kanałów marketingowych vs wzrost przychodów. Wymaga danych finansowych (~30-40 marek).',
  },
  {
    id: 'brand-health',
    name: 'Brand Health vs Financial Performance',
    description: 'Które metryki brandowe najlepiej przewidują wyniki finansowe? Leading indicators i hidden gems.',
  },
];

/**
 * Run a single analysis by ID.
 */
export function runAnalysis(id: AnalysisId): AnalysisResult {
  const fn = ANALYSES[id];
  if (!fn) throw new Error(`Unknown analysis: ${id}`);
  const brands = loadBrandRows();
  return fn(brands);
}

/**
 * Run all 5 analyses and return results.
 */
export function runAllAnalyses(): Record<AnalysisId, AnalysisResult> {
  const brands = loadBrandRows();
  const results: Record<string, AnalysisResult> = {};
  for (const [id, fn] of Object.entries(ANALYSES)) {
    results[id] = fn(brands);
  }
  return results as Record<AnalysisId, AnalysisResult>;
}

/**
 * Get flattened brand data for export/visualization.
 */
export function exportBrandRows(): BrandRow[] {
  return loadBrandRows();
}
