/**
 * YouTube Data API v3 connector — search for review videos of diet catering brands.
 *
 * Uses YouTube Data API v3 (free tier: 10,000 units/day).
 * - search.list costs 100 units per call
 * - videos.list costs 1 unit per call
 *
 * Requires: YOUTUBE_API_KEY
 */

import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export interface YouTubeVideoDetails {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  duration: string;         // ISO 8601 (PT10M30S)
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  categoryId: string;
  defaultLanguage?: string;
  paidProductPlacement: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse ISO 8601 duration (PT1H2M30S) to seconds */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function ytApiFetch(endpoint: string, params: Record<string, string>, apiKey: string): unknown {
  const qs = new URLSearchParams({ ...params, key: apiKey }).toString();
  const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`;

  const result = execSync(
    `curl -s "${url}"`,
    { timeout: 15000 }
  ).toString();

  return JSON.parse(result);
}

// ---------------------------------------------------------------------------
// Search for review videos
// ---------------------------------------------------------------------------

/**
 * Search YouTube for review/opinion videos about a brand.
 * Tries multiple Polish query variants, deduplicates results.
 */
export function searchReviewVideos(
  brandName: string,
  apiKey: string,
  opts?: { maxResults?: number; publishedAfter?: string },
): YouTubeSearchResult[] {
  const maxResults = opts?.maxResults ?? 10;

  // Polish search queries for catering reviews
  const queries = [
    `${brandName} recenzja catering`,
    `${brandName} opinia catering dietetyczny`,
    `${brandName} test catering`,
  ];

  const seen = new Set<string>();
  const results: YouTubeSearchResult[] = [];

  for (const query of queries) {
    if (results.length >= maxResults) break;

    try {
      const params: Record<string, string> = {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: String(Math.min(maxResults - results.length, 10)),
        order: 'relevance',
        regionCode: 'PL',
        relevanceLanguage: 'pl',
        videoDuration: 'medium', // 4-20 min — filters out shorts and very long vlogs
      };

      if (opts?.publishedAfter) {
        params.publishedAfter = opts.publishedAfter;
      }

      const data = ytApiFetch('search', params, apiKey) as {
        items?: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            channelId: string;
            channelTitle: string;
            description: string;
            publishedAt: string;
            thumbnails?: { medium?: { url: string } };
          };
        }>;
        error?: { message: string };
      };

      if (data.error) {
        console.error(`[youtube] search error: ${data.error.message}`);
        continue;
      }

      for (const item of data.items || []) {
        const videoId = item.id.videoId;
        if (seen.has(videoId)) continue;
        seen.add(videoId);

        results.push({
          videoId,
          title: item.snippet.title,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnailUrl: item.snippet.thumbnails?.medium?.url || '',
        });
      }
    } catch (err) {
      console.error(`[youtube] search failed for "${query}":`, err);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Get video details (duration, views, likes, etc.)
// ---------------------------------------------------------------------------

/**
 * Fetch detailed stats for a batch of video IDs (max 50 per call, 1 unit/call).
 */
export function getVideoDetails(
  videoIds: string[],
  apiKey: string,
): YouTubeVideoDetails[] {
  if (videoIds.length === 0) return [];

  // YouTube allows up to 50 IDs per videos.list call
  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  const results: YouTubeVideoDetails[] = [];

  for (const batch of batches) {
    try {
      const data = ytApiFetch('videos', {
        part: 'snippet,contentDetails,statistics,status',
        id: batch.join(','),
      }, apiKey) as {
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            channelId: string;
            channelTitle: string;
            description: string;
            publishedAt: string;
            tags?: string[];
            categoryId: string;
            defaultLanguage?: string;
          };
          contentDetails: { duration: string };
          statistics: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
          };
          status?: {
            madeForKids?: boolean;
            selfDeclaredMadeForKids?: boolean;
          };
          paidProductPlacementDetails?: {
            hasPaidProductPlacement?: boolean;
          };
        }>;
        error?: { message: string };
      };

      if (data.error) {
        console.error(`[youtube] videos.list error: ${data.error.message}`);
        continue;
      }

      for (const item of data.items || []) {
        const durationSec = parseDuration(item.contentDetails.duration);

        results.push({
          videoId: item.id,
          title: item.snippet.title,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          duration: item.contentDetails.duration,
          durationSeconds: durationSec,
          viewCount: parseInt(item.statistics.viewCount || '0', 10),
          likeCount: parseInt(item.statistics.likeCount || '0', 10),
          commentCount: parseInt(item.statistics.commentCount || '0', 10),
          tags: item.snippet.tags || [],
          paidProductPlacement: item.paidProductPlacementDetails?.hasPaidProductPlacement ?? false,
          categoryId: item.snippet.categoryId,
          defaultLanguage: item.snippet.defaultLanguage,
        });
      }
    } catch (err) {
      console.error('[youtube] videos.list failed:', err);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Filter: exclude brand's own channel, enforce min views & max duration
// ---------------------------------------------------------------------------

export function filterReviewVideos(
  videos: YouTubeVideoDetails[],
  opts?: {
    brandChannelIds?: string[];   // exclude brand's own uploads
    minViews?: number;
    maxDurationSeconds?: number;
  },
): YouTubeVideoDetails[] {
  const brandChannels = new Set(opts?.brandChannelIds || []);
  const minViews = opts?.minViews ?? 500;
  const maxDuration = opts?.maxDurationSeconds ?? 1800; // 30 min

  return videos.filter(v => {
    if (brandChannels.has(v.channelId)) return false;
    if (v.viewCount < minViews) return false;
    if (v.durationSeconds > maxDuration) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sponsorship detection from video metadata (no download needed)
// ---------------------------------------------------------------------------

const SPONSORSHIP_MARKERS_PL = [
  '#ad', '#reklama', '#współpraca', '#wspolpraca', '#materiałsponsorowany',
  '#materialreklamowy', '#paid', '#sponsored',
  'materiał sponsorowany', 'materiał reklamowy', 'współpraca reklamowa',
  'partnerem odcinka', 'partnerem tego odcinka', 'partnerem filmu',
  'sponsorem odcinka', 'we współpracy z', 'w współpracy z',
  'powstał we współpracy', 'materiał powstał we współpracy',
];

/**
 * Detect sponsorship signals from video metadata (title, description, tags, paid placement flag).
 * Returns confidence score 0-1 and matched signals.
 */
export function detectSponsorship(video: YouTubeVideoDetails): {
  isSponsored: boolean;
  confidence: number;
  signals: string[];
} {
  const signals: string[] = [];

  // Signal 1: YouTube's official paidProductPlacement flag (strongest)
  if (video.paidProductPlacement) {
    signals.push('paidProductPlacement flag');
  }

  // Signal 2: Sponsorship markers in description
  const descLower = video.description.toLowerCase();
  for (const marker of SPONSORSHIP_MARKERS_PL) {
    if (descLower.includes(marker.toLowerCase())) {
      signals.push(`description: "${marker}"`);
      break; // one match is enough
    }
  }

  // Signal 3: Sponsorship markers in title
  const titleLower = video.title.toLowerCase();
  for (const marker of SPONSORSHIP_MARKERS_PL) {
    if (titleLower.includes(marker.toLowerCase())) {
      signals.push(`title: "${marker}"`);
      break;
    }
  }

  // Signal 4: Tags containing ad markers
  const tagStr = video.tags.join(' ').toLowerCase();
  if (tagStr.includes('#ad') || tagStr.includes('sponsored') || tagStr.includes('reklama') || tagStr.includes('współpraca')) {
    signals.push('tags contain ad markers');
  }

  const confidence = Math.min(signals.length / 2, 1); // 2+ signals = high confidence
  return {
    isSponsored: signals.length > 0,
    confidence,
    signals,
  };
}
