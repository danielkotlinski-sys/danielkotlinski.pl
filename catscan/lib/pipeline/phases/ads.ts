/**
 * Phase: Ads — fetch active Meta ads via Ad Library API (FREE).
 *
 * Meta Ad Library API is free and returns all active ads for any page.
 * Requires a Facebook access token (from a Facebook app, not a paid API).
 *
 * What we get per brand:
 * - Number of active ads
 * - Ad creative texts (copy)
 * - Ad creative link titles
 * - Start dates (how long ads have been running)
 * - Platforms (Facebook, Instagram, Messenger, Audience Network)
 *
 * From this we derive:
 * - Active ad count → proxy for ad spend intensity
 * - Duration distribution → campaign maturity
 * - Platform mix → channel strategy
 * - Copy analysis → messaging patterns
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

const AD_LIBRARY_BASE = 'https://graph.facebook.com/v18.0/ads_archive';

interface AdRecord {
  id: string;
  adCreativeBody: string;
  adCreativeLinkTitle: string;
  startDate: string;
  stopDate: string | null;
  pageName: string;
  platforms: string[];
  daysActive: number;
}

interface AdsData {
  activeAdsCount: number;
  ads: AdRecord[];
  platforms: Record<string, number>; // platform → count
  avgAdDurationDays: number;
  longestRunningAdDays: number;
  adCopySnippets: string[]; // first 50 chars of each ad
  estimatedIntensity: 'none' | 'low' | 'medium' | 'high' | 'very_high';
  fetchedAt: string;
  method: 'meta_api' | 'ad_library_search';
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 15 ${shellEscape(url)}`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function estimateIntensity(count: number): AdsData['estimatedIntensity'] {
  if (count === 0) return 'none';
  if (count <= 3) return 'low';
  if (count <= 10) return 'medium';
  if (count <= 30) return 'high';
  return 'very_high';
}

async function fetchViaMetaApi(pageName: string, accessToken: string): Promise<AdsData> {
  const fields = 'id,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,page_name,publisher_platforms';
  const params = new URLSearchParams({
    access_token: accessToken,
    ad_reached_countries: '["PL"]',
    ad_type: 'ALL',
    search_terms: pageName,
    fields,
    limit: '100',
  });

  const url = `${AD_LIBRARY_BASE}?${params.toString()}`;
  const json = curlFetch(url);

  const result: AdsData = {
    activeAdsCount: 0,
    ads: [],
    platforms: {},
    avgAdDurationDays: 0,
    longestRunningAdDays: 0,
    adCopySnippets: [],
    estimatedIntensity: 'none',
    fetchedAt: new Date().toISOString(),
    method: 'meta_api',
  };

  if (!json) return result;

  try {
    const data = JSON.parse(json);
    const rawAds = data.data || [];

    for (const ad of rawAds) {
      const body = ad.ad_creative_bodies?.[0] || '';
      const title = ad.ad_creative_link_titles?.[0] || '';
      const startDate = ad.ad_delivery_start_time || '';
      const stopDate = ad.ad_delivery_stop_time || null;
      const platforms = ad.publisher_platforms || [];
      const days = startDate ? daysBetween(startDate) : 0;

      result.ads.push({
        id: ad.id || '',
        adCreativeBody: body.slice(0, 500),
        adCreativeLinkTitle: title,
        startDate,
        stopDate,
        pageName: ad.page_name || pageName,
        platforms,
        daysActive: days,
      });

      // Count platforms
      for (const p of platforms) {
        result.platforms[p] = (result.platforms[p] || 0) + 1;
      }

      // Snippets
      if (body) {
        result.adCopySnippets.push(body.slice(0, 80));
      }
    }

    result.activeAdsCount = result.ads.length;
    result.estimatedIntensity = estimateIntensity(result.activeAdsCount);

    if (result.ads.length > 0) {
      const durations = result.ads.map(a => a.daysActive).filter(d => d > 0);
      result.avgAdDurationDays = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
      result.longestRunningAdDays = Math.max(...durations, 0);
    }
  } catch {
    // JSON parse error
  }

  return result;
}

async function fetchViaAdLibrarySearch(brandName: string): Promise<AdsData> {
  // Fallback: scrape the public Ad Library website (no auth needed)
  const query = encodeURIComponent(brandName);
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=PL&q=${query}&media_type=all`;

  const html = curlFetch(url);

  const result: AdsData = {
    activeAdsCount: 0,
    ads: [],
    platforms: {},
    avgAdDurationDays: 0,
    longestRunningAdDays: 0,
    adCopySnippets: [],
    estimatedIntensity: 'none',
    fetchedAt: new Date().toISOString(),
    method: 'ad_library_search',
  };

  if (!html) return result;

  // Try to extract ad count from page
  const countMatch = html.match(/(\d+)\s*(?:ads?|reklam)/i);
  if (countMatch) {
    result.activeAdsCount = parseInt(countMatch[1]);
    result.estimatedIntensity = estimateIntensity(result.activeAdsCount);
  }

  return result;
}

export async function enrichAds(entity: EntityRecord): Promise<EntityRecord> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;

  // Try to get the Facebook page name from social data (more accurate than brand name)
  const socialData = (entity.data as Record<string, Record<string, unknown>>);
  const fbPageName = (socialData?.social as Record<string, Record<string, unknown>>)?.facebook?.handle as string | undefined;
  const searchName = fbPageName || entity.name;

  let adsData: AdsData;

  if (accessToken) {
    // Try with FB page name first, then brand name as fallback
    adsData = await fetchViaMetaApi(searchName, accessToken);
    if (adsData.activeAdsCount === 0 && fbPageName && fbPageName !== entity.name) {
      adsData = await fetchViaMetaApi(entity.name, accessToken);
    }
  } else {
    adsData = await fetchViaAdLibrarySearch(entity.name);
  }

  return {
    ...entity,
    data: {
      ...entity.data,
      ads: adsData,
    },
  };
}
