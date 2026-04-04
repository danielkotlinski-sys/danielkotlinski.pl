/**
 * Phase: Social — fetch Instagram, Facebook, TikTok data via Apify actors.
 * Falls back to Perplexity AI for social stats when Apify can't scrape.
 *
 * Requires APIFY_API_TOKEN. Optionally PERPLEXITY_API_KEY for fallback.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

interface SocialProfile {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube';
  url: string;
  handle: string;
  followers?: number;
  posts?: number;
  verified?: boolean;
}

interface SocialData {
  profiles: SocialProfile[];
  instagram?: SocialProfile & {
    bio?: string;
    avgLikes?: number;
    avgComments?: number;
    engagementRate?: number;
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

function runApifyActor(actorId: string, input: Record<string, unknown>, apiToken: string): unknown[] {
  const inputFile = `/tmp/apify_social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  try {
    writeFileSync(inputFile, JSON.stringify(input));
    const result = execSync(
      `curl -s -m 180 -X POST 'https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 20 * 1024 * 1024, timeout: 190000 }
    );
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    const parsed = JSON.parse(result.toString('utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return [];
  }
}

/**
 * Perplexity fallback: ask AI for social media stats when Apify can't scrape.
 * Returns partial data — followers, bio, post counts from AI knowledge.
 */
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

  // Instagram — profile details via Apify
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
        // Skip errored results
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

          socialData.instagram = { ...profile, bio: data.biography as string | undefined, avgLikes, avgComments, engagementRate };
          socialData.profiles.push(profile);
        }
      }
    }
  }

  // Facebook — page data via Apify
  if (socialUrls.facebook) {
    const handle = socialUrls.facebook.match(/facebook\.com\/([^/?]+)/)?.[1] || '';
    const fbItems = runApifyActor('apify~facebook-pages-scraper', {
      startUrls: [{ url: socialUrls.facebook }],
      resultsLimit: 1,
    }, apiToken);

    if (fbItems.length > 0) {
      const data = fbItems[0] as Record<string, unknown>;
      // Check for error responses (Facebook often blocks scraping)
      if (!data.error && (data.followersCount || data.likes || data.title)) {
        const followers = (data.followersCount ?? data.likes) as number | undefined;
        const profile: SocialProfile = {
          platform: 'facebook',
          url: socialUrls.facebook,
          handle: (data.title as string) || handle,
          followers,
        };
        socialData.facebook = { ...profile, likes: data.likes as number | undefined, rating: data.overallStarRating as number | undefined };
        socialData.profiles.push(profile);
      }
    }
  }

  // TikTok — profile data via Apify
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

  // Perplexity fallback — if Instagram or Facebook returned nothing
  const igMissing = socialUrls.instagram && !socialData.instagram;
  const fbMissing = socialUrls.facebook && !socialData.facebook;

  if (igMissing || fbMissing) {
    const pplxData = perplexitySocialFallback(entity.name, socialUrls);
    if (pplxData) {
      usedPerplexity = true;

      // Backfill Instagram
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

      // Backfill Facebook
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

      // YouTube from Perplexity if we have a URL
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

  // Aggregate
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
