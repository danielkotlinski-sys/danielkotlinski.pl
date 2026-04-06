/**
 * Phase: Google Ads — fetch active Google ads via DataForSEO Ads Transparency API.
 *
 * Queries Google Ads Transparency Center for all ads run by each brand's domain
 * in Poland. Complements the existing Meta Ads phase (ads.ts).
 *
 * What we get per brand:
 * - Active ads from Google Search, YouTube, Shopping, Maps, Display
 * - Ad creative format (text/image/video)
 * - Ad preview images and URLs
 * - Date range (first shown / last shown → days active)
 * - Advertiser verification status
 *
 * From this we derive:
 * - Active ad count → Google ad spend intensity
 * - Format mix → channel strategy (Search text vs YouTube video vs Shopping)
 * - Duration distribution → campaign maturity
 * - Comparison with Meta ads → cross-platform ad strategy
 *
 * Requires: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 * Cost: ~$0.002/brand (120 results max), ~$0.50 for 239 brands
 */

import type { EntityRecord } from '@/lib/db/store';
import { fetchGoogleAds, type GoogleAdRecord } from '@/lib/connectors/dataforseo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleAdsData {
  totalAdsFound: number;
  ads: Array<{
    creativeId: string;
    format: string;
    previewImageUrl: string | null;
    firstShown: string | null;
    lastShown: string | null;
    daysActive: number;
  }>;
  formats: Record<string, number>;       // format → count
  longestRunningAdDays: number;
  avgAdDurationDays: number;
  advertiserIds: string[];
  advertiserVerified: boolean;
  estimatedIntensity: 'none' | 'low' | 'medium' | 'high' | 'very_high';
  cost_usd: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateIntensity(count: number): GoogleAdsData['estimatedIntensity'] {
  if (count === 0) return 'none';
  if (count <= 3) return 'low';
  if (count <= 10) return 'medium';
  if (count <= 30) return 'high';
  return 'very_high';
}

function extractDomain(entity: EntityRecord): string | null {
  const url = entity.url || entity.domain || '';
  if (!url) return null;

  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim() || null;
}

// ---------------------------------------------------------------------------
// Main phase function
// ---------------------------------------------------------------------------

export async function enrichGoogleAds(entity: EntityRecord): Promise<EntityRecord> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    return {
      ...entity,
      data: {
        ...entity.data,
        google_ads: { skipped: true, reason: 'DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD not set' },
      },
    };
  }

  const domain = extractDomain(entity);
  if (!domain) {
    return {
      ...entity,
      data: {
        ...entity.data,
        google_ads: { skipped: true, reason: 'No domain available' },
      },
    };
  }

  // Fetch ads from DataForSEO
  const result = fetchGoogleAds(domain, login, password, {
    platform: 'all',
    format: 'all',
    depth: 120,
  });

  // Build format distribution
  const formats: Record<string, number> = {};
  for (const ad of result.ads) {
    formats[ad.format] = (formats[ad.format] || 0) + 1;
  }

  // Calculate durations
  const durations = result.ads
    .filter(a => a.daysActive > 0)
    .map(a => a.daysActive);

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 0;

  const longestRunning = durations.length > 0
    ? Math.max(...durations)
    : 0;

  // Check verification
  const anyVerified = result.ads.some(a => a.verified);

  const googleAdsData: GoogleAdsData = {
    totalAdsFound: result.totalAdsFound,
    ads: result.ads.map(a => ({
      creativeId: a.creativeId,
      format: a.format,
      previewImageUrl: a.previewImageUrl,
      firstShown: a.firstShown,
      lastShown: a.lastShown,
      daysActive: a.daysActive,
    })),
    formats,
    longestRunningAdDays: longestRunning,
    avgAdDurationDays: avgDuration,
    advertiserIds: result.advertiserIds,
    advertiserVerified: anyVerified,
    estimatedIntensity: estimateIntensity(result.totalAdsFound),
    cost_usd: result.costUsd,
    fetchedAt: new Date().toISOString(),
  };

  return {
    ...entity,
    data: {
      ...entity.data,
      google_ads: googleAdsData,
      _cost_google_ads: { usd: result.costUsd },
    },
  };
}
