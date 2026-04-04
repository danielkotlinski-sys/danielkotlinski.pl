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

  let historical: typeof parsed = [];

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
  return matches ? [...new Set(matches.map(h => h.toLowerCase()))] : [];
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
  const topHashtags = [...hashtagCounts.entries()]
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
      }, apiToken);

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
          }, apiToken, 240000); // 4 min timeout for posts

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
    }, apiToken);

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
  // TikTok — profile data via Apify
  // -----------------------------------------------------------------------
  if (socialUrls.tiktok) {
    const handle = socialUrls.tiktok.match(/tiktok\.com\/@([^/?]+)/)?.[1] || '';
    if (handle) {
      const ttItems = runApifyActor('clockworks~free-tiktok-scraper', {
        profiles: [handle],
        resultsPerPage: 1,
        shouldDownloadCovers: false,
      }, apiToken);

      if (ttItems.length > 0) {
        const data = ttItems[0] as Record<string, unknown>;
        if (!data.error) {
          const authorMeta = (data.authorMeta || {}) as Record<string, number>;
          const profile: SocialProfile = {
            platform: 'tiktok',
            url: socialUrls.tiktok,
            handle,
            followers: authorMeta.fans as number | undefined,
            posts: authorMeta.video as number | undefined,
          };
          socialData.tiktok = { ...profile, totalLikes: authorMeta.heart as number | undefined };
          socialData.profiles.push(profile);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Perplexity fallback — if Instagram or Facebook returned nothing
  // -----------------------------------------------------------------------
  const igMissing = socialUrls.instagram && !socialData.instagram;
  const fbMissing = socialUrls.facebook && !socialData.facebook;

  if (igMissing || fbMissing) {
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

  return {
    ...entity,
    data: {
      ...entity.data,
      social: socialData,
    },
  };
}
