/**
 * Phase: Reviews — Google Maps reviews + Dietly ratings.
 *
 * Source 1: Apify Google Maps Scraper (compass/crawler-google-places)
 *           → Google rating, review count, address, location, review snippets
 * Source 2: Dietly data from brands.json (already seeded)
 *           → Dietly rating, review count, positive percent
 *
 * Requires APIFY_API_TOKEN. Without it, only Dietly data is used.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { EntityRecord } from '@/lib/db/store';

interface ReviewData {
  google: {
    rating: number | null;
    reviewCount: number | null;
    mapsUrl: string | null;
    address: string | null;
    category: string | null;
    snippets: string[];
  };
  dietly: {
    rating: number | null;
    reviewCount: number | null;
    positivePercent: number | null;
  };
  sentiment: 'very_positive' | 'positive' | 'mixed' | 'negative' | 'unknown';
  fetchedAt: string;
  method: 'apify' | 'dietly-only';
}

function estimateSentiment(
  googleRating: number | null,
  dietlyRating: number | null
): ReviewData['sentiment'] {
  const rating = googleRating || dietlyRating;
  if (rating === null) return 'unknown';
  if (rating >= 4.5) return 'very_positive';
  if (rating >= 4.0) return 'positive';
  if (rating >= 3.0) return 'mixed';
  return 'negative';
}

function getDietlyData(
  entityName: string,
  entityDomain: string | undefined
): ReviewData['dietly'] {
  const empty = { rating: null, reviewCount: null, positivePercent: null };

  try {
    const brandsPath = join(process.cwd(), 'data', 'brands.json');
    if (!existsSync(brandsPath)) return empty;

    const brands = JSON.parse(readFileSync(brandsPath, 'utf-8'));
    // Match by domain or name
    const brand = brands.find((b: Record<string, unknown>) => {
      if (entityDomain && b.domain === entityDomain) return true;
      if (b.name && typeof b.name === 'string' &&
        b.name.toLowerCase() === entityName.toLowerCase()) return true;
      return false;
    });

    if (!brand?.dietly) return empty;

    return {
      rating: brand.dietly.rating ?? null,
      reviewCount: brand.dietly.reviewCount ?? null,
      positivePercent: brand.dietly.positivePercent ?? null,
    };
  } catch {
    return empty;
  }
}

async function apifyGoogleMaps(
  companyName: string,
  apiToken: string
): Promise<ReviewData['google']> {
  const empty = {
    rating: null,
    reviewCount: null,
    mapsUrl: null,
    address: null,
    category: null,
    snippets: [],
  };

  const query = `${companyName} catering dietetyczny`;

  const input = {
    searchStringsArray: [query],
    maxCrawledPlacesPerSearch: 1,
    language: 'pl',
    maxReviews: 10,
    onePerQuery: true,
  };

  const inputFile = `/tmp/apify_gmaps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(input));

  try {
    const raw = execSync(
      `curl -s -m 180 -X POST 'https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 20 * 1024 * 1024, timeout: 200000 }
    ).toString('utf-8');

    // Clean up temp file
    try { unlinkSync(inputFile); } catch { /* ignore */ }

    let items: unknown[];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn(`[reviews] Invalid JSON from Google Maps API for "${companyName}"`);
      return empty;
    }
    if (items.length === 0) {
      console.warn(`[reviews] No Google Maps result for "${companyName}"`);
      return empty;
    }

    const place = items[0] as Record<string, unknown>;

    // Extract review snippets
    const rawReviews = Array.isArray(place.reviews) ? place.reviews : [];
    const snippets = rawReviews
      .slice(0, 10)
      .map((r: Record<string, unknown>) => {
        const text = String(r.text || r.textTranslated || '').slice(0, 200);
        return text;
      })
      .filter((s: string) => s.length > 10);

    return {
      rating: (place.totalScore ?? place.rating ?? null) as number | null,
      reviewCount: (place.reviewsCount ?? place.reviews_count ?? null) as number | null,
      mapsUrl: (place.url ?? place.placeUrl ?? null) as string | null,
      address: (place.address ?? place.street ?? null) as string | null,
      category: (place.categoryName ?? place.category ?? null) as string | null,
      snippets,
    };
  } catch (e) {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    console.warn(
      `[reviews] Apify Google Maps failed for "${companyName}":`,
      e instanceof Error ? e.message : e
    );
    return empty;
  }
}

export async function enrichReviews(entity: EntityRecord): Promise<EntityRecord> {
  const apiToken = process.env.APIFY_API_TOKEN;

  // Get Dietly data from brands.json
  const dietly = getDietlyData(entity.name, entity.domain);

  // Get Google Maps data via Apify
  let google: ReviewData['google'] = {
    rating: null,
    reviewCount: null,
    mapsUrl: null,
    address: null,
    category: null,
    snippets: [],
  };

  if (apiToken) {
    google = await apifyGoogleMaps(entity.name, apiToken);
    // Brief pause between API calls
    await new Promise(r => setTimeout(r, 1000));
  }

  const reviewData: ReviewData = {
    google,
    dietly,
    sentiment: estimateSentiment(google.rating, dietly.rating),
    fetchedAt: new Date().toISOString(),
    method: apiToken ? 'apify' : 'dietly-only',
  };

  return {
    ...entity,
    data: {
      ...entity.data,
      reviews: reviewData,
    },
  };
}
