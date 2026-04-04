/**
 * Phase: Social — fetch Instagram, Facebook, TikTok data via Apify actors.
 *
 * Per brief (sekcja 2.4, Faza 5):
 *   - apify/instagram-scraper (directUrls + resultsType: details)
 *   - apify/facebook-pages-scraper (startUrls + resultsLimit)
 *   - clockworks/free-tiktok-scraper (profiles + resultsPerPage)
 *
 * Requires APIFY_API_TOKEN. Without it, phase is skipped gracefully.
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

interface SocialProfile {
  platform: 'instagram' | 'facebook' | 'tiktok';
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
  totalFollowers: number;
  platformCount: number;
  fetchedAt: string;
  method: 'apify';
}

function extractSocialUrls(entity: EntityRecord): { instagram?: string; facebook?: string; tiktok?: string } {
  const socialUrls = (entity.data as Record<string, Record<string, string>>)?._social_urls;
  if (socialUrls) {
    return {
      instagram: socialUrls.instagram,
      facebook: socialUrls.facebook,
      tiktok: socialUrls.tiktok,
    };
  }
  return {};
}

function runApifyActor(actorId: string, input: Record<string, unknown>, apiToken: string): unknown[] {
  try {
    const inputJson = JSON.stringify(input);
    const result = execSync(
      `curl -s -m 180 -X POST 'https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d '${inputJson}'`,
      { maxBuffer: 20 * 1024 * 1024, timeout: 190000 }
    );
    return JSON.parse(result.toString('utf-8'));
  } catch {
    return [];
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

  // Instagram — profile details via apify/instagram-scraper
  if (socialUrls.instagram) {
    const handle = socialUrls.instagram.match(/instagram\.com\/([^/?]+)/)?.[1] || '';
    if (handle) {
      const profileItems = runApifyActor('apify/instagram-scraper', {
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: 'details',
        resultsLimit: 1,
      }, apiToken);

      if (profileItems.length > 0) {
        const data = profileItems[0] as Record<string, unknown>;
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

        // Compute engagement rate from recent posts if available
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
      } else {
        console.warn(`[social] Instagram actor returned empty data for handle: ${handle}`);
      }
    }
  }

  // Facebook — page data via apify/facebook-pages-scraper
  if (socialUrls.facebook) {
    const handle = socialUrls.facebook.match(/facebook\.com\/([^/?]+)/)?.[1] || '';
    const fbItems = runApifyActor('apify/facebook-pages-scraper', {
      startUrls: [{ url: socialUrls.facebook }],
      resultsLimit: 1,
    }, apiToken);

    if (fbItems.length > 0) {
      const data = fbItems[0] as Record<string, unknown>;
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
    } else {
      console.warn(`[social] Facebook actor returned empty data for: ${socialUrls.facebook}`);
    }
  }

  // TikTok — profile data via clockworks/free-tiktok-scraper
  if (socialUrls.tiktok) {
    const handle = socialUrls.tiktok.match(/tiktok\.com\/@([^/?]+)/)?.[1] || '';
    if (handle) {
      const ttItems = runApifyActor('clockworks/free-tiktok-scraper', {
        profiles: [handle],
        resultsPerPage: 1,
        shouldDownloadCovers: false,
      }, apiToken);

      if (ttItems.length > 0) {
        const data = ttItems[0] as Record<string, unknown>;
        const authorMeta = (data.authorMeta || {}) as Record<string, number>;

        const profile: SocialProfile = {
          platform: 'tiktok',
          url: socialUrls.tiktok,
          handle,
          followers: authorMeta.fans as number | undefined,
          posts: authorMeta.video as number | undefined,
        };

        socialData.tiktok = {
          ...profile,
          totalLikes: authorMeta.heart as number | undefined,
        };
        socialData.profiles.push(profile);
      } else {
        console.warn(`[social] TikTok actor returned empty data for handle: ${handle}`);
      }
    }
  }

  // Aggregate
  socialData.totalFollowers = socialData.profiles.reduce((sum, p) => sum + (p.followers || 0), 0);
  socialData.platformCount = socialData.profiles.length;

  return {
    ...entity,
    data: {
      ...entity.data,
      social: socialData,
    },
  };
}
