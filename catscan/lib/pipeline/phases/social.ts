/**
 * Phase: Social — fetch Instagram, Facebook, TikTok data via Apify actors.
 * Falls back to Perplexity AI for social stats when Apify can't scrape.
 *
 * Instagram scraping:
 *   Call #1: Profile details (followers, bio, engagement)
 *   Call #2: Posts (stratified sample: 6 recent + 14 spread over 6 months)
 *
 * Requires APIFY_API_TOKEN. Optionally PERPLEXITY_API_KEY for fallback.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SocialProfile {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube';
  url: string;
  handle: string;
  followers?: number;
  posts?: number;
  verified?: boolean;
}

interface IgPost {
  id: string;
  timestamp: string;
  type: 'Image' | 'Video' | 'Sidecar' | string;
  caption: string | null;
  hashtags: string[];
  likes: number;
  comments: number;
  url: string;
  sampleBucket: 'recent' | 'historical';
}

interface TtPost {
  id: string;
  timestamp: string;
  caption: string | null;
  hashtags: string[];
  views: number;
  likes: number;
  comments: number;
  shares: number;
  url: string;
  sampleBucket: 'recent' | 'historical';
}

interface IgContentAnalysis {
  sampleSize: number;
  recentPosts: number;       // posts from last ~2 weeks
  historicalPosts: number;   // posts spread over 6 months
  dateRange: { oldest: string; newest: string } | null;
  postingFrequency: string | null; // e.g. "4.2 posts/week"
  avgLikesRecent: number | null;
  avgLikesHistorical: number | null;
  avgCommentsRecent: number | null;
  avgCommentsHistorical: number | null;
  engagementTrend: 'rising' | 'stable' | 'declining' | 'insufficient_data';
  topHashtags: Array<{ tag: string; count: number }>;
  contentMix: Record<string, number>; // e.g. { Image: 5, Video: 8, Sidecar: 7 }
  posts: IgPost[];
}

interface TtContentAnalysis {
  sampleSize: number;
  recentPosts: number;
  historicalPosts: number;
  dateRange: { oldest: string; newest: string } | null;
  postingFrequency: string | null;
  avgViewsRecent: number | null;
  avgViewsHistorical: number | null;
  avgLikesRecent: number | null;
  avgLikesHistorical: number | null;
  engagementTrend: 'rising' | 'stable' | 'declining' | 'insufficient_data';
  topHashtags: Array<{ tag: string; count: number }>;
  posts: TtPost[];
}

interface SocialData {
  profiles: SocialProfile[];
  instagram?: SocialProfile & {
    bio?: string;
    avgLikes?: number;
    avgComments?: number;
    engagementRate?: number;
    content?: IgContentAnalysis;
  };
  facebook?: SocialProfile & {
    likes?: number;
    rating?: number;
    avgReactions?: number;
  };
  tiktok?: SocialProfile & {
    totalLikes?: number;
    avgViews?: number;
    content?: TtContentAnalysis;
  };
  youtube?: SocialProfile & {
    subscribers?: number;
    totalViews?: number;
  };
  totalFollowers: number;
  platformCount: number;
  fetchedAt: string;
  method: 'apify' | 'apify+perplexity' | 'perplexity';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSocialUrls(entity: EntityRecord): Record<string, string | undefined> {
  const socialUrls = (entity.data as Record<string, Record<string, string>>)?._social_urls;
  if (socialUrls) {
    return {
      instagram: socialUrls.instagram,
      facebook: socialUrls.facebook,
      tiktok: socialUrls.tiktok,
      youtube: socialUrls.youtube,
      linkedin: socialUrls.linkedin,
    };
  }
  return {};
}

function runApifyActor(actorId: string, input: Record<string, unknown>, apiToken: string, timeoutMs = 190000): unknown[] {
  const curlTimeout = Math.floor(timeoutMs / 1000) - 10;
  const inputFile = `/tmp/apify_social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  try {
    writeFileSync(inputFile, JSON.stringify(input));
    const result = execSync(
      `curl -s -m ${curlTimeout} -X POST 'https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }
    );
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    const parsed = JSON.parse(result.toString('utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Instagram post sampling
// ---------------------------------------------------------------------------

/**
 * Stratified sampling: 6 most recent + 14 spread across 6 months.
 * Input: raw posts from Apify (sorted newest first).
 * Goal: representative snapshot, not biased by campaigns or crises.
 */
function stratifySample(rawPosts: Array<Record<string, unknown>>): IgPost[] {
  if (rawPosts.length === 0) return [];

  // Parse and sort by date (newest first)
  const parsed = rawPosts
    .map(p => {
      const ts = (p.timestamp as string) || (p.takenAtTimestamp ? new Date((p.takenAtTimestamp as number) * 1000).toISOString() : '');
      return {
        id: String(p.id || p.shortCode || ''),
        timestamp: ts,
        type: String(p.type || p.productType || 'Image'),
        caption: typeof p.caption === 'string' ? p.caption.slice(0, 500) : null,
        hashtags: extractHashtags(typeof p.caption === 'string' ? p.caption : ''),
        likes: (p.likesCount as number) || 0,
        comments: (p.commentsCount as number) || 0,
        url: `https://www.instagram.com/p/${p.shortCode || p.id}/`,
        sampleBucket: 'recent' as const,
        _date: ts ? new Date(ts) : new Date(0),
      };
    })
    .filter(p => p._date.getTime() > 0)
    .sort((a, b) => b._date.getTime() - a._date.getTime());

  if (parsed.length === 0) return [];

  // Bucket 1: 6 most recent
  const RECENT_COUNT = 6;
  const recent = parsed.slice(0, RECENT_COUNT).map(p => ({ ...p, sampleBucket: 'recent' as const }));

  // Bucket 2: from remaining posts, pick 14 spread over 6 months
  const HISTORICAL_COUNT = 14;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const historicalPool = parsed
    .slice(RECENT_COUNT)
    .filter(p => p._date >= sixMonthsAgo);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let historical: any[] = [];

  if (historicalPool.length <= HISTORICAL_COUNT) {
    // Take all if we have fewer than 14
    historical = historicalPool;
  } else {
    // Spread evenly: divide the time range into 14 buckets, pick one from each
    const newest = historicalPool[0]._date.getTime();
    const oldest = historicalPool[historicalPool.length - 1]._date.getTime();
    const bucketSize = (newest - oldest) / HISTORICAL_COUNT;

    for (let i = 0; i < HISTORICAL_COUNT; i++) {
      const bucketStart = oldest + bucketSize * i;
      const bucketEnd = oldest + bucketSize * (i + 1);
      // Pick the post closest to bucket midpoint
      const mid = (bucketStart + bucketEnd) / 2;
      let best = historicalPool[0];
      let bestDist = Infinity;
      for (const p of historicalPool) {
        const dist = Math.abs(p._date.getTime() - mid);
        if (dist < bestDist && !historical.includes(p)) {
          bestDist = dist;
          best = p;
        }
      }
      if (!historical.includes(best)) {
        historical.push(best);
      }
    }
  }

  historical = historical.map(p => ({ ...p, sampleBucket: 'historical' as const }));

  // Combine and strip internal _date field
  const all = [...recent, ...historical];
  return all.map(({ _date, ...rest }) => rest);
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\w\u00C0-\u024Fа-яА-Я]+/g);
  return matches ? Array.from(new Set(matches.map(h => h.toLowerCase()))) : [];
}

/**
 * Analyze the stratified sample to produce content metrics.
 */
function analyzeContent(posts: IgPost[], followers: number | undefined): IgContentAnalysis {
  const recentPosts = posts.filter(p => p.sampleBucket === 'recent');
  const historicalPosts = posts.filter(p => p.sampleBucket === 'historical');

  // Posting frequency from all posts
  let postingFrequency: string | null = null;
  let dateRange: { oldest: string; newest: string } | null = null;

  if (posts.length >= 2) {
    const dates = posts.map(p => new Date(p.timestamp).getTime()).sort((a, b) => a - b);
    const oldest = new Date(dates[0]);
    const newest = new Date(dates[dates.length - 1]);
    dateRange = {
      oldest: oldest.toISOString().slice(0, 10),
      newest: newest.toISOString().slice(0, 10),
    };
    const weeks = (newest.getTime() - oldest.getTime()) / (7 * 24 * 60 * 60 * 1000);
    if (weeks > 0) {
      postingFrequency = (posts.length / weeks).toFixed(1) + ' posts/week';
    }
  }

  const avg = (arr: number[]): number | null =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  const avgLikesRecent = avg(recentPosts.map(p => p.likes));
  const avgLikesHistorical = avg(historicalPosts.map(p => p.likes));
  const avgCommentsRecent = avg(recentPosts.map(p => p.comments));
  const avgCommentsHistorical = avg(historicalPosts.map(p => p.comments));

  // Engagement trend: compare recent avg engagement vs historical
  let engagementTrend: 'rising' | 'stable' | 'declining' | 'insufficient_data' = 'insufficient_data';
  if (avgLikesRecent !== null && avgLikesHistorical !== null && avgLikesHistorical > 0) {
    const ratio = avgLikesRecent / avgLikesHistorical;
    if (ratio > 1.2) engagementTrend = 'rising';
    else if (ratio < 0.8) engagementTrend = 'declining';
    else engagementTrend = 'stable';
  }

  // Top hashtags across all posts
  const hashtagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.hashtags) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    }
  }
  const topHashtags = Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  // Content mix
  const contentMix: Record<string, number> = {};
  for (const post of posts) {
    const type = post.type || 'unknown';
    contentMix[type] = (contentMix[type] || 0) + 1;
  }

  return {
    sampleSize: posts.length,
    recentPosts: recentPosts.length,
    historicalPosts: historicalPosts.length,
    dateRange,
    postingFrequency,
    avgLikesRecent,
    avgLikesHistorical,
    avgCommentsRecent,
    avgCommentsHistorical,
    engagementTrend,
    topHashtags,
    contentMix,
    posts,
  };
}

// ---------------------------------------------------------------------------
// TikTok helpers
// ---------------------------------------------------------------------------

/**
 * Generate candidate TikTok handles from brand name and domain.
 * Example: "Kuchnia Vikinga" + "kuchniavikinga.pl" → ["kuchniavikinga", "kuchnia_vikinga", "kuchnia.vikinga"]
 */
function generateTikTokCandidates(brandName: string, domain?: string): string[] {
  const candidates: string[] = [];

  // From domain (most reliable — brands often use same handle)
  if (domain) {
    const slug = domain.replace(/^www\./, '').replace(/\.(pl|com|eu|com\.pl)$/, '');
    candidates.push(slug);
    candidates.push(slug.replace(/[-_.]/g, ''));
  }

  // From brand name
  const lower = brandName.toLowerCase();
  candidates.push(lower.replace(/\s+/g, ''));          // "kuchniavikinga"
  candidates.push(lower.replace(/\s+/g, '_'));          // "kuchnia_vikinga"
  candidates.push(lower.replace(/\s+/g, '.'));          // "kuchnia.vikinga"
  candidates.push(lower.replace(/\s+/g, '').replace(/[^a-z0-9._]/g, '')); // ascii only

  // Deduplicate and filter
  return Array.from(new Set(candidates)).filter(c => c.length >= 3 && /^[\w.]+$/.test(c));
}

/**
 * Try to find TikTok profile by testing candidate handles via Apify.
 * Returns { handle, items } if found, null if no profile exists.
 */
function discoverTikTokViaApify(
  brandName: string,
  domain: string | undefined,
  apiToken: string,
  resultsPerPage = 30
): { handle: string; items: unknown[] } | null {
  const candidates = generateTikTokCandidates(brandName, domain);

  for (const handle of candidates) {
    const items = runApifyActor('clockworks~free-tiktok-scraper', {
      profiles: [handle],
      resultsPerPage,
      shouldDownloadCovers: false,
    }, apiToken, 120000); // 2 min timeout per attempt

    if (items.length > 0) {
      const first = items[0] as Record<string, unknown>;
      // Verify it's a real profile (has authorMeta or valid post data)
      if (first.authorMeta || first.text !== undefined) {
        return { handle, items };
      }
    }
  }

  return null;
}

/**
 * Stratified sampling for TikTok: 4 most recent + 8 spread over 6 months = 12 posts.
 * Similar to Instagram sampling but adapted for TikTok's data structure.
 */
function stratifyTtSample(rawPosts: Array<Record<string, unknown>>): TtPost[] {
  if (rawPosts.length === 0) return [];

  const parsed = rawPosts
    .map(p => {
      const ts = (p.createTimeISO as string) || (p.createTime ? new Date((p.createTime as number) * 1000).toISOString() : '');
      const text = (p.text as string) || '';
      return {
        id: String(p.id || ''),
        timestamp: ts,
        caption: text ? text.slice(0, 500) : null,
        hashtags: extractHashtags(text),
        views: (p.playCount as number) || (p.viewCount as number) || 0,
        likes: (p.diggCount as number) || (p.likesCount as number) || 0,
        comments: (p.commentCount as number) || (p.commentsCount as number) || 0,
        shares: (p.shareCount as number) || 0,
        url: (p.webVideoUrl as string) || `https://www.tiktok.com/@/video/${p.id}`,
        sampleBucket: 'recent' as const,
        _date: ts ? new Date(ts) : new Date(0),
      };
    })
    .filter(p => p._date.getTime() > 0)
    .sort((a, b) => b._date.getTime() - a._date.getTime());

  if (parsed.length === 0) return [];

  // Recent: first 4 posts
  const recent = parsed.slice(0, 4).map(p => ({ ...p, sampleBucket: 'recent' as const }));

  // Historical: 8 evenly spread from the rest
  const remaining = parsed.slice(4);
  const historical: any[] = [];
  if (remaining.length > 0) {
    const step = Math.max(1, Math.floor(remaining.length / 8));
    for (let i = 0; i < remaining.length && historical.length < 8; i += step) {
      historical.push({ ...remaining[i], sampleBucket: 'historical' as const });
    }
  }

  // Strip internal _date field
  return [...recent, ...historical].map(({ _date, ...rest }) => rest);
}

/**
 * Analyze TikTok posts sample — engagement trends, hashtags, frequency.
 */
function analyzeTtContent(posts: TtPost[], followers: number | undefined): TtContentAnalysis {
  const recentPosts = posts.filter(p => p.sampleBucket === 'recent');
  const historicalPosts = posts.filter(p => p.sampleBucket === 'historical');

  // Date range
  const timestamps = posts.map(p => new Date(p.timestamp).getTime()).filter(t => t > 0);
  const dateRange = timestamps.length >= 2
    ? { oldest: new Date(Math.min(...timestamps)).toISOString().slice(0, 10), newest: new Date(Math.max(...timestamps)).toISOString().slice(0, 10) }
    : null;

  // Posting frequency
  let postingFrequency: string | null = null;
  if (dateRange && timestamps.length >= 2) {
    const rangeMs = Math.max(...timestamps) - Math.min(...timestamps);
    const weeks = rangeMs / (7 * 86400000);
    if (weeks > 0) postingFrequency = `${(posts.length / weeks).toFixed(1)} posts/week`;
  }

  // Averages
  const avgOf = (arr: TtPost[], key: 'views' | 'likes') =>
    arr.length > 0 ? Math.round(arr.reduce((s, p) => s + p[key], 0) / arr.length) : null;

  const avgViewsRecent = avgOf(recentPosts, 'views');
  const avgViewsHistorical = avgOf(historicalPosts, 'views');
  const avgLikesRecent = avgOf(recentPosts, 'likes');
  const avgLikesHistorical = avgOf(historicalPosts, 'likes');

  // Engagement trend (based on views)
  let engagementTrend: TtContentAnalysis['engagementTrend'] = 'insufficient_data';
  if (avgViewsRecent !== null && avgViewsHistorical !== null && avgViewsHistorical > 0) {
    const ratio = avgViewsRecent / avgViewsHistorical;
    engagementTrend = ratio > 1.2 ? 'rising' : ratio < 0.8 ? 'declining' : 'stable';
  }

  // Top hashtags
  const hashtagCounts = new Map<string, number>();
  for (const p of posts) {
    for (const tag of p.hashtags) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    }
  }
  const topHashtags = Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  return {
    sampleSize: posts.length,
    recentPosts: recentPosts.length,
    historicalPosts: historicalPosts.length,
    dateRange,
    postingFrequency,
    avgViewsRecent,
    avgViewsHistorical,
    avgLikesRecent,
    avgLikesHistorical,
    engagementTrend,
    topHashtags,
    posts,
  };
}

// ---------------------------------------------------------------------------
// Perplexity fallback
// ---------------------------------------------------------------------------

function perplexitySocialFallback(
  brandName: string,
  socialUrls: Record<string, string | undefined>
): Record<string, unknown> | null {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  const urlList = Object.entries(socialUrls)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `${brandName} — catering dietetyczny, Polska.
Profile social media:
${urlList}

Odpowiedz WYŁĄCZNIE poprawnym JSON:
{
  "instagram": { "handle": "string", "followers": number_or_null, "bio": "string_or_null", "posts": number_or_null },
  "facebook": { "handle": "string", "followers": number_or_null, "likes": number_or_null },
  "tiktok": { "handle": "string", "followers": number_or_null, "totalLikes": number_or_null },
  "youtube": { "handle": "string", "subscribers": number_or_null }
}

Podaj TYLKO platformy wymienione powyżej. Dane powinny być aktualne. Jeśli nie znasz — wstaw null.`;

  const requestBody = {
    model: 'sonar',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  };

  const inputFile = `/tmp/pplx_social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  try {
    const raw = execSync(
      `curl -s -m 60 'https://api.perplexity.ai/chat/completions' -H "Authorization: Bearer ${apiKey}" -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 70000 }
    ).toString('utf-8');

    try { unlinkSync(inputFile); } catch { /* ignore */ }

    const response = JSON.parse(raw);
    const content = response.choices?.[0]?.message?.content || '';
    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
    return JSON.parse(jsonStr.trim());
  } catch {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

export async function enrichSocial(entity: EntityRecord): Promise<EntityRecord> {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    return {
      ...entity,
      data: {
        ...entity.data,
        social: { skipped: true, reason: 'APIFY_API_TOKEN not set' },
      },
    };
  }

  const socialUrls = extractSocialUrls(entity);
  let apifyCalls = 0;
  let pplxCalls = 0;
  const socialData: SocialData = {
    profiles: [],
    totalFollowers: 0,
    platformCount: 0,
    fetchedAt: new Date().toISOString(),
    method: 'apify',
  };

  let usedPerplexity = false;

  // -----------------------------------------------------------------------
  // Instagram — Call #1: Profile details
  // -----------------------------------------------------------------------
  if (socialUrls.instagram) {
    const handle = socialUrls.instagram.match(/instagram\.com\/([^/?]+)/)?.[1] || '';
    if (handle) {
      const profileItems = runApifyActor('apify~instagram-scraper', {
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: 'details',
        resultsLimit: 1,
      }, apiToken); apifyCalls++;

      if (profileItems.length > 0) {
        const data = profileItems[0] as Record<string, unknown>;
        if (!data.error) {
          const followers = data.followersCount as number | undefined;
          const posts = data.postsCount as number | undefined;

          const profile: SocialProfile = {
            platform: 'instagram',
            url: socialUrls.instagram,
            handle: (data.username as string) || handle,
            followers,
            posts,
            verified: data.verified as boolean | undefined,
          };

          let avgLikes: number | undefined;
          let avgComments: number | undefined;
          let engagementRate: number | undefined;
          const latestPosts = data.latestPosts as Array<Record<string, number>> | undefined;
          if (latestPosts && latestPosts.length > 0 && followers && followers > 0) {
            avgLikes = Math.round(latestPosts.reduce((s, p) => s + (p.likesCount || 0), 0) / latestPosts.length);
            avgComments = Math.round(latestPosts.reduce((s, p) => s + (p.commentsCount || 0), 0) / latestPosts.length);
            engagementRate = parseFloat((((avgLikes + avgComments) / followers) * 100).toFixed(2));
          }

          socialData.instagram = {
            ...profile,
            bio: data.biography as string | undefined,
            avgLikes,
            avgComments,
            engagementRate,
          };
          socialData.profiles.push(profile);

          // -----------------------------------------------------------------
          // Instagram — Call #2: Posts (stratified sample)
          // Fetch ~50 posts to cover ~6 months, then sample 6+14=20
          // -----------------------------------------------------------------
          const postItems = runApifyActor('apify~instagram-scraper', {
            directUrls: [`https://www.instagram.com/${handle}/`],
            resultsType: 'posts',
            resultsLimit: 50,
          }, apiToken, 240000); apifyCalls++; // 4 min timeout for posts

          if (postItems.length > 0) {
            const sample = stratifySample(postItems as Array<Record<string, unknown>>);
            const contentAnalysis = analyzeContent(sample, followers);
            socialData.instagram.content = contentAnalysis;
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Facebook — page data via Apify
  // -----------------------------------------------------------------------
  if (socialUrls.facebook) {
    const handle = socialUrls.facebook.match(/facebook\.com\/([^/?]+)/)?.[1] || '';
    const fbItems = runApifyActor('apify~facebook-pages-scraper', {
      startUrls: [{ url: socialUrls.facebook }],
      resultsLimit: 1,
    }, apiToken); apifyCalls++;

    if (fbItems.length > 0) {
      const data = fbItems[0] as Record<string, unknown>;
      if (!data.error && (data.followersCount || data.likes || data.title)) {
        const followers = (data.followersCount ?? data.likes) as number | undefined;
        const profile: SocialProfile = {
          platform: 'facebook',
          url: socialUrls.facebook,
          handle: (data.title as string) || handle,
          followers,
        };
        socialData.facebook = {
          ...profile,
          likes: data.likes as number | undefined,
          rating: data.overallStarRating as number | undefined,
        };
        socialData.profiles.push(profile);
      }
    }
  }

  // -----------------------------------------------------------------------
  // TikTok — discovery + profile + posts via Apify
  // -----------------------------------------------------------------------
  {
    let ttHandle: string | undefined;
    let ttItems: unknown[] = [];

    if (socialUrls.tiktok) {
      // URL known from crawl — use it directly
      ttHandle = socialUrls.tiktok.match(/tiktok\.com\/@([^/?]+)/)?.[1];
      if (ttHandle) {
        ttItems = runApifyActor('clockworks~free-tiktok-scraper', {
          profiles: [ttHandle],
          resultsPerPage: 30,
          shouldDownloadCovers: false,
        }, apiToken, 120000); apifyCalls++;
      }
    } else {
      // No TikTok URL from crawl — try slug-based discovery via Apify
      const entityDomain = (() => { try { return new URL(entity.url).hostname.replace('www.', ''); } catch { return undefined; } })();
      const discovered = discoverTikTokViaApify(entity.name, entityDomain, apiToken);
      if (discovered) {
        ttHandle = discovered.handle;
        ttItems = discovered.items;
        socialUrls.tiktok = `https://www.tiktok.com/@${ttHandle}`;
        console.log(`[social] TikTok discovered for ${entity.name}: @${ttHandle}`);
      }
      apifyCalls++; // Count the discovery attempt(s)
    }

    if (ttHandle && ttItems.length > 0) {
      // Extract profile data from authorMeta
      const profileItem = ttItems.find(item => (item as Record<string, unknown>).authorMeta) as Record<string, unknown> | undefined;
      const authorMeta = (profileItem?.authorMeta || {}) as Record<string, number>;
      const followers = authorMeta.fans as number | undefined;

      const profile: SocialProfile = {
        platform: 'tiktok',
        url: socialUrls.tiktok || `https://www.tiktok.com/@${ttHandle}`,
        handle: ttHandle,
        followers,
        posts: authorMeta.video as number | undefined,
      };
      const totalLikes = authorMeta.heart as number | undefined;

      // Parse posts for content analysis (stratified sample: 4 recent + 8 historical = 12)
      const postItems = ttItems.filter(item => {
        const i = item as Record<string, unknown>;
        return i.id && (i.text !== undefined || i.playCount !== undefined);
      }) as Array<Record<string, unknown>>;

      let ttContent: TtContentAnalysis | undefined;
      if (postItems.length > 0) {
        const sample = stratifyTtSample(postItems);
        ttContent = analyzeTtContent(sample, followers);
        console.log(`[social] TikTok @${ttHandle}: ${followers || '?'} followers, ${postItems.length} raw → ${sample.length} sampled posts`);
      }

      socialData.tiktok = {
        ...profile,
        totalLikes,
        avgViews: ttContent?.avgViewsRecent ?? undefined,
        content: ttContent,
      };
      socialData.profiles.push(profile);
    }
  }

  // -----------------------------------------------------------------------
  // Perplexity fallback — if Instagram or Facebook returned nothing
  // -----------------------------------------------------------------------
  const igMissing = socialUrls.instagram && !socialData.instagram;
  const fbMissing = socialUrls.facebook && !socialData.facebook;

  if (igMissing || fbMissing) {
    pplxCalls++;
    const pplxData = perplexitySocialFallback(entity.name, socialUrls);
    if (pplxData) {
      usedPerplexity = true;

      if (igMissing && pplxData.instagram) {
        const ig = pplxData.instagram as Record<string, unknown>;
        const handle = socialUrls.instagram!.match(/instagram\.com\/([^/?]+)/)?.[1] || '';
        const followers = typeof ig.followers === 'number' ? ig.followers : undefined;
        const profile: SocialProfile = {
          platform: 'instagram',
          url: socialUrls.instagram!,
          handle: (ig.handle as string) || handle,
          followers,
          posts: typeof ig.posts === 'number' ? ig.posts : undefined,
        };
        socialData.instagram = { ...profile, bio: (ig.bio as string) || undefined };
        socialData.profiles.push(profile);
      }

      if (fbMissing && pplxData.facebook) {
        const fb = pplxData.facebook as Record<string, unknown>;
        const handle = socialUrls.facebook!.match(/facebook\.com\/([^/?]+)/)?.[1] || '';
        const followers = typeof fb.followers === 'number' ? fb.followers : undefined;
        const profile: SocialProfile = {
          platform: 'facebook',
          url: socialUrls.facebook!,
          handle: (fb.handle as string) || handle,
          followers,
        };
        socialData.facebook = { ...profile, likes: typeof fb.likes === 'number' ? fb.likes : undefined };
        socialData.profiles.push(profile);
      }

      if (socialUrls.youtube && pplxData.youtube) {
        const yt = pplxData.youtube as Record<string, unknown>;
        const subscribers = typeof yt.subscribers === 'number' ? yt.subscribers : undefined;
        const profile: SocialProfile = {
          platform: 'youtube',
          url: socialUrls.youtube,
          handle: (yt.handle as string) || '',
          followers: subscribers,
        };
        socialData.youtube = { ...profile, subscribers, totalViews: typeof yt.totalViews === 'number' ? yt.totalViews : undefined };
        socialData.profiles.push(profile);
      }
    }
  }

  // YouTube from Perplexity even if no other fallback needed
  if (socialUrls.youtube && !socialData.youtube && !usedPerplexity) {
    pplxCalls++;
    const pplxData = perplexitySocialFallback(entity.name, { youtube: socialUrls.youtube });
    if (pplxData?.youtube) {
      usedPerplexity = true;
      const yt = pplxData.youtube as Record<string, unknown>;
      const subscribers = typeof yt.subscribers === 'number' ? yt.subscribers : undefined;
      const profile: SocialProfile = {
        platform: 'youtube',
        url: socialUrls.youtube,
        handle: (yt.handle as string) || '',
        followers: subscribers,
      };
      socialData.youtube = { ...profile, subscribers };
      socialData.profiles.push(profile);
    }
  }

  // -----------------------------------------------------------------------
  // Aggregate
  // -----------------------------------------------------------------------
  socialData.totalFollowers = socialData.profiles.reduce((sum, p) => sum + (p.followers || 0), 0);
  socialData.platformCount = socialData.profiles.length;
  socialData.method = usedPerplexity
    ? (socialData.profiles.some(p => p.platform === 'instagram' && socialData.instagram?.avgLikes) ? 'apify+perplexity' : 'perplexity')
    : 'apify';

  // Apify cost: ~$0.04 per actor run (compute units vary by scraper)
  const apifyCostUsd = apifyCalls * 0.04;
  const pplxCostUsd = pplxCalls * 0.005;

  return {
    ...entity,
    data: {
      ...entity.data,
      social: socialData,
      _cost_social: { usd: apifyCostUsd + pplxCostUsd, apifyCalls, pplxCalls, provider: 'apify+perplexity' },
    },
  };
}
