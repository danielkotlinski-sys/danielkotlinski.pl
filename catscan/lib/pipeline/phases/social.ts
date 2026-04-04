/**
 * Phase: Social — fetch Instagram, Facebook, TikTok data via Apify actors.
 *
 * Per brief (sekcja 2.4, Faza 5):
 *   - Apify instagram-profile-scraper + instagram-post-scraper
 *   - Apify facebook-pages-scraper
 *   - Apify tiktok-scraper
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
      `curl -s -m 120 -X POST 'https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d '${inputJson}'`,
      { maxBuffer: 20 * 1024 * 1024, timeout: 130000 }
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

  // Instagram — profile + recent posts
  if (socialUrls.instagram) {
    const handle = socialUrls.instagram.match(/instagram\.com\/([^/?]+)/)?.[1] || '';
    if (handle) {
      const profileItems = runApifyActor('apify/instagram-profile-scraper', {
        usernames: [handle],
        resultsLimit: 1,
      }, apiToken);

      const data = (profileItems[0] || {}) as Record<string, unknown>;
      const profile: SocialProfile = {
        platform: 'instagram',
        url: socialUrls.instagram,
        handle,
        followers: data.followersCount as number | undefined,
        posts: data.postsCount as number | undefined,
        verified: data.verified as boolean | undefined,
      };

      socialData.instagram = {
        ...profile,
        bio: data.biography as string | undefined,
        avgLikes: data.avgLikes as number | undefined,
        avgComments: data.avgComments as number | undefined,
        engagementRate: data.engagementRate as number | undefined,
      };
      socialData.profiles.push(profile);
    }
  }

  // Facebook — page data + recent posts
  if (socialUrls.facebook) {
    const handle = socialUrls.facebook.match(/facebook\.com\/([^/?]+)/)?.[1] || '';
    const fbItems = runApifyActor('apify/facebook-pages-scraper', {
      startUrls: [{ url: socialUrls.facebook }],
      maxPages: 1,
    }, apiToken);

    const data = (fbItems[0] || {}) as Record<string, unknown>;
    const profile: SocialProfile = {
      platform: 'facebook',
      url: socialUrls.facebook,
      handle,
      followers: (data.followers || data.likes) as number | undefined,
    };

    socialData.facebook = {
      ...profile,
      likes: data.likes as number | undefined,
      rating: data.overallStarRating as number | undefined,
      avgReactions: data.avgReactions as number | undefined,
    };
    socialData.profiles.push(profile);
  }

  // TikTok — profile data
  if (socialUrls.tiktok) {
    const handle = socialUrls.tiktok.match(/tiktok\.com\/@([^/?]+)/)?.[1] || '';
    if (handle) {
      const ttItems = runApifyActor('clockworks/free-tiktok-scraper', {
        profiles: [handle],
        resultsPerPage: 1,
      }, apiToken);

      const data = (ttItems[0] || {}) as Record<string, unknown>;
      const authorStats = (data.authorStats || {}) as Record<string, number>;

      const profile: SocialProfile = {
        platform: 'tiktok',
        url: socialUrls.tiktok,
        handle,
        followers: authorStats.followerCount || (data.followers as number | undefined),
        posts: authorStats.videoCount || (data.videoCount as number | undefined),
      };

      socialData.tiktok = {
        ...profile,
        totalLikes: authorStats.heartCount || (data.likes as number | undefined),
        avgViews: data.avgViews as number | undefined,
      };
      socialData.profiles.push(profile);
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
