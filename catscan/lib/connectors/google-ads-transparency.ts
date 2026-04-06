/**
 * Google Ads Transparency Center connector — via Apify actor.
 *
 * Uses madeingermany/google-ads-scraper (pure HTTP, no browser, 400 ads/min).
 * Searches by advertiser domain/name for ads shown in Poland.
 *
 * Requires: APIFY_API_TOKEN (already used by social, reviews, visual phases)
 * Cost: pay-per-usage Apify credits, ~$0.01-0.05/brand
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleAdRecord {
  creativeId: string;
  advertiserId: string;
  advertiserName: string;
  format: 'text' | 'image' | 'video' | string;
  previewImageUrl: string | null;
  previewUrl: string | null;
  firstShown: string | null;
  lastShown: string | null;
  daysActive: number;
  verified: boolean;
}

export interface GoogleAdsResult {
  ads: GoogleAdRecord[];
  totalAdsFound: number;
  advertiserIds: string[];
}

// ---------------------------------------------------------------------------
// Apify actor call
// ---------------------------------------------------------------------------

function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
  timeoutMs = 120000,
): unknown[] {
  const curlTimeout = Math.floor(timeoutMs / 1000) - 10;
  const inputFile = `/tmp/apify_gads_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  try {
    writeFileSync(inputFile, JSON.stringify(input));
    const result = execSync(
      `curl -s -m ${curlTimeout} -X POST ` +
      `'https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}' ` +
      `-H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }
    );
    try { unlinkSync(inputFile); } catch { /* */ }
    const parsed = JSON.parse(result.toString('utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try { unlinkSync(inputFile); } catch { /* */ }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch Google Ads for a domain via Apify Google Ads Transparency scraper.
 */
export function fetchGoogleAds(
  domain: string,
  apiToken: string,
  opts?: { maxResults?: number; region?: string },
): GoogleAdsResult {
  const maxResults = opts?.maxResults ?? 100;
  const region = opts?.region ?? 'PL';

  const items = runApifyActor(
    'madeingermany~google-ads-scraper',
    {
      searchQuery: domain,
      region,
      maxResults,
    },
    apiToken,
    180000, // 3 min — scraper may take a while
  ) as Array<Record<string, unknown>>;

  if (items.length === 0) {
    return { ads: [], totalAdsFound: 0, advertiserIds: [] };
  }

  const now = new Date();
  const advertiserIds = new Set<string>();
  const ads: GoogleAdRecord[] = [];

  for (const item of items) {
    const advertiserId = String(item.advertiserId || item.advertiser_id || '');
    if (advertiserId) advertiserIds.add(advertiserId);

    // Parse first shown date
    const firstShown = (item.firstShown || item.first_shown || item.startDate || null) as string | null;
    let daysActive = 0;
    if (firstShown) {
      const start = new Date(firstShown);
      if (!isNaN(start.getTime())) {
        daysActive = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    ads.push({
      creativeId: String(item.creativeId || item.creative_id || item.id || ''),
      advertiserId,
      advertiserName: String(item.advertiserName || item.advertiser_name || item.title || ''),
      format: String(item.format || item.type || 'unknown').toLowerCase(),
      previewImageUrl: (item.previewImageUrl || item.preview_image_url || item.imageUrl || item.image || null) as string | null,
      previewUrl: (item.previewUrl || item.preview_url || item.url || null) as string | null,
      firstShown,
      lastShown: (item.lastShown || item.last_shown || item.endDate || null) as string | null,
      daysActive,
      verified: Boolean(item.verified),
    });
  }

  return {
    ads,
    totalAdsFound: ads.length,
    advertiserIds: Array.from(advertiserIds),
  };
}
