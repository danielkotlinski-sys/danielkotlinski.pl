/**
 * DataForSEO connector — Google Ads Transparency Center API.
 *
 * Searches for all ads run by a given domain/advertiser in Poland.
 * Uses ads_search endpoint (live/advanced mode).
 *
 * Authentication: Basic HTTP (login:password from DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)
 * Cost: $0.002 per 40 results (live mode), $0.0006 per 40 (standard queue)
 * Docs: https://docs.dataforseo.com/v3/serp-google-ads_search-live-advanced/
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

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
  costUsd: number;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

const POLAND_LOCATION_CODE = 2616;

/**
 * Fetch Google Ads for a domain from DataForSEO Ads Transparency API.
 */
export function fetchGoogleAds(
  domain: string,
  login: string,
  password: string,
  opts?: { platform?: string; format?: string; depth?: number },
): GoogleAdsResult {
  const depth = opts?.depth ?? 120;
  const platform = opts?.platform ?? 'all';
  const format = opts?.format ?? 'all';

  const credential = Buffer.from(`${login}:${password}`).toString('base64');

  const requestBody = JSON.stringify([{
    target: domain,
    location_code: POLAND_LOCATION_CODE,
    platform,
    format,
    depth,
  }]);

  const tmpFile = `/tmp/dataforseo-${randomUUID()}.json`;

  try {
    writeFileSync(tmpFile, requestBody);

    const result = execSync(
      `curl -s -X POST ` +
      `"https://api.dataforseo.com/v3/serp/google/ads_search/live/advanced" ` +
      `-H "Authorization: Basic ${credential}" ` +
      `-H "Content-Type: application/json" ` +
      `-d @${tmpFile}`,
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* */ }

    const parsed = JSON.parse(result);

    // Check for API errors
    const task = parsed?.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      const errMsg = task?.status_message || 'unknown error';
      console.error(`[dataforseo] ads_search error for ${domain}: ${errMsg}`);
      return { ads: [], totalAdsFound: 0, advertiserIds: [], costUsd: 0 };
    }

    const resultData = task.result?.[0];
    if (!resultData || !resultData.items) {
      return { ads: [], totalAdsFound: 0, advertiserIds: [], costUsd: task.cost || 0 };
    }

    const now = new Date();
    const advertiserIds = new Set<string>();
    const ads: GoogleAdRecord[] = [];

    for (const item of resultData.items) {
      const advertiserId = item.advertiser_id || '';
      if (advertiserId) advertiserIds.add(advertiserId);

      const firstShown = item.first_shown || null;
      let daysActive = 0;
      if (firstShown) {
        const start = new Date(firstShown);
        daysActive = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }

      ads.push({
        creativeId: item.creative_id || '',
        advertiserId,
        advertiserName: item.title || '',
        format: item.format || 'unknown',
        previewImageUrl: item.preview_image?.url || null,
        previewUrl: item.preview_url || null,
        firstShown,
        lastShown: item.last_shown || null,
        daysActive,
        verified: item.verified ?? false,
      });
    }

    return {
      ads,
      totalAdsFound: resultData.total_count || ads.length,
      advertiserIds: Array.from(advertiserIds),
      costUsd: task.cost || 0,
    };
  } catch (err) {
    try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* */ }
    console.error(`[dataforseo] fetch failed for ${domain}:`, err);
    return { ads: [], totalAdsFound: 0, advertiserIds: [], costUsd: 0 };
  }
}
