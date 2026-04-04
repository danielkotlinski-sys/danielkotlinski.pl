/**
 * Phase: Reviews — scrape Google Reviews data.
 *
 * Two modes:
 * A) Apify Google Maps scraper (if APIFY_API_TOKEN set) — full reviews
 * B) Fallback: Google search scrape — rating + review count from search snippet
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

interface ReviewData {
  googleRating: number | null;
  googleReviewCount: number | null;
  googleMapsUrl: string | null;
  reviewSnippets: string[];
  sentimentEstimate: 'very_positive' | 'positive' | 'mixed' | 'negative' | 'unknown';
  otherSources: Array<{
    source: string;
    rating: number;
    count: number;
  }>;
  fetchedAt: string;
  method: 'apify' | 'search_scrape';
}

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 10 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' '${url}'`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 15000 }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

function estimateSentiment(rating: number | null): ReviewData['sentimentEstimate'] {
  if (rating === null) return 'unknown';
  if (rating >= 4.5) return 'very_positive';
  if (rating >= 4.0) return 'positive';
  if (rating >= 3.0) return 'mixed';
  return 'negative';
}

async function scrapeGoogleReviews(companyName: string, city?: string): Promise<ReviewData> {
  const query = encodeURIComponent(`${companyName} ${city || ''} opinie catering`);

  const result: ReviewData = {
    googleRating: null,
    googleReviewCount: null,
    googleMapsUrl: null,
    reviewSnippets: [],
    sentimentEstimate: 'unknown',
    otherSources: [],
    fetchedAt: new Date().toISOString(),
    method: 'search_scrape',
  };

  // Strategy 1: Google search for rating snippet
  const gHtml = curlFetch(`https://www.google.com/search?q=${query}&hl=pl`);
  if (gHtml) {
    // Google shows rating in search results as "4.5 ★ (123 opinions)"
    const ratingMatch = gHtml.match(/([\d.]+)\s*(?:★|⭐|gwiazdek|stars?)/i);
    if (ratingMatch) {
      result.googleRating = parseFloat(ratingMatch[1]);
    }

    const countMatch = gHtml.match(/\((\d[\d,.]*)\s*(?:opin|recenz|review|ocen)/i);
    if (countMatch) {
      result.googleReviewCount = parseInt(countMatch[1].replace(/[,.]/g, ''));
    }

    // Try to find Google Maps URL
    const mapsMatch = gHtml.match(/href=["'](https?:\/\/(?:www\.)?google\.[^"']*\/maps[^"']*)/i);
    if (mapsMatch) {
      result.googleMapsUrl = mapsMatch[1];
    }

    // Extract review snippets from search results
    const snippetRegex = /[""]([^""]{20,200})[""].*?(?:opini|recenzj)/gi;
    let snippetMatch: RegExpExecArray | null;
    while ((snippetMatch = snippetRegex.exec(gHtml)) !== null && result.reviewSnippets.length < 5) {
      result.reviewSnippets.push(snippetMatch[1].replace(/<[^>]+>/g, '').trim());
    }
  }

  // Strategy 2: Try DuckDuckGo as backup
  if (!result.googleRating) {
    const ddgHtml = curlFetch(`https://html.duckduckgo.com/html/?q=${query}`);
    if (ddgHtml) {
      const ratingMatch = ddgHtml.match(/([\d.]+)\s*\/\s*5/);
      if (ratingMatch) {
        result.googleRating = parseFloat(ratingMatch[1]);
      }
      const countMatch = ddgHtml.match(/(\d+)\s*(?:opin|recenz|review)/i);
      if (countMatch) {
        result.googleReviewCount = parseInt(countMatch[1]);
      }
    }
  }

  // Strategy 3: Check Dietly reviews if we have the URL
  const dietlyQuery = encodeURIComponent(`site:dietly.pl "${companyName}" opinie`);
  const dietlyHtml = curlFetch(`https://html.duckduckgo.com/html/?q=${dietlyQuery}`);
  if (dietlyHtml) {
    const dietlyRating = dietlyHtml.match(/([\d.]+)\s*\/\s*(?:5|6)/);
    if (dietlyRating) {
      result.otherSources.push({
        source: 'dietly.pl',
        rating: parseFloat(dietlyRating[1]),
        count: 0,
      });
    }
  }

  result.sentimentEstimate = estimateSentiment(result.googleRating);

  return result;
}

async function apifyGoogleReviews(companyName: string, city: string, apiToken: string): Promise<ReviewData> {
  const query = `${companyName} ${city} catering dietetyczny`;

  try {
    const input = JSON.stringify({
      searchStringsArray: [query],
      maxReviews: 10,
      language: 'pl',
    });

    const runResult = execSync(
      `curl -s -m 120 -X POST 'https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d '${input}'`,
      { maxBuffer: 20 * 1024 * 1024, timeout: 130000 }
    );

    const items = JSON.parse(runResult.toString('utf-8'));
    const place = items[0] || {};

    const reviews = (place.reviews || []).slice(0, 10);
    const snippets = reviews
      .map((r: Record<string, unknown>) => String(r.text || '').slice(0, 200))
      .filter((s: string) => s.length > 20);

    return {
      googleRating: place.totalScore || null,
      googleReviewCount: place.reviewsCount || null,
      googleMapsUrl: place.url || null,
      reviewSnippets: snippets,
      sentimentEstimate: estimateSentiment(place.totalScore),
      otherSources: [],
      fetchedAt: new Date().toISOString(),
      method: 'apify',
    };
  } catch {
    // Fallback to search scrape
    return scrapeGoogleReviews(companyName, city);
  }
}

export async function enrichReviews(entity: EntityRecord): Promise<EntityRecord> {
  const apiToken = process.env.APIFY_API_TOKEN;
  const city = (entity.data as Record<string, Record<string, string>>)?._seed?.city
    || (entity.data as Record<string, Record<string, string>>)?.contact?.city
    || '';

  let reviewData: ReviewData;

  if (apiToken) {
    reviewData = await apifyGoogleReviews(entity.name, city, apiToken);
  } else {
    reviewData = await scrapeGoogleReviews(entity.name, city);
  }

  // Brief pause
  execSync('sleep 1');

  return {
    ...entity,
    data: {
      ...entity.data,
      reviews: reviewData,
    },
  };
}
