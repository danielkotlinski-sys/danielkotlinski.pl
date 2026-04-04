/**
 * Phase: Social — scrape Instagram, Facebook, TikTok profiles.
 *
 * Two modes:
 * A) Apify actors (if APIFY_API_TOKEN set) — full data: posts, engagement, followers
 * B) Fallback: curl-based discovery — find social URLs, get basic public data
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
  instagram?: SocialProfile & { bio?: string; avgLikes?: number };
  facebook?: SocialProfile & { likes?: number; rating?: number };
  tiktok?: SocialProfile & { likes?: number };
  totalFollowers: number;
  platformCount: number;
  fetchedAt: string;
  method: 'apify' | 'crawl';
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

function extractSocialUrls(entity: EntityRecord): { instagram?: string; facebook?: string; tiktok?: string } {
  const result: { instagram?: string; facebook?: string; tiktok?: string } = {};

  // Check crawled HTML data for social links
  const rawHtml = entity.rawHtml || '';
  const data = entity.data as Record<string, unknown>;

  // Also check the domain directly
  const domain = entity.domain || entity.url.replace(/https?:\/\//, '').replace(/\/.*/, '');
  const pageHtml = rawHtml || curlFetch(`https://${domain}`) || '';

  // Instagram
  const igMatch = pageHtml.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/([^"'/?]+))/i);
  if (igMatch) {
    result.instagram = igMatch[1];
  }

  // Facebook
  const fbMatch = pageHtml.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/([^"'/?]+))/i);
  if (fbMatch) {
    result.facebook = fbMatch[1];
  }

  // TikTok
  const ttMatch = pageHtml.match(/href=["'](https?:\/\/(?:www\.)?tiktok\.com\/@([^"'/?]+))/i);
  if (ttMatch) {
    result.tiktok = ttMatch[1];
  }

  return result;
}

function parseFollowerCount(text: string): number | undefined {
  // Parse strings like "12.5K", "1.2M", "45,678"
  const match = text.match(/([\d,.]+)\s*([KkMm])?/);
  if (!match) return undefined;

  let num = parseFloat(match[1].replace(',', '.'));
  if (match[2]?.toLowerCase() === 'k') num *= 1000;
  if (match[2]?.toLowerCase() === 'm') num *= 1000000;
  return Math.round(num);
}

async function scrapeInstagram(url: string): Promise<Partial<SocialProfile> & { bio?: string; avgLikes?: number }> {
  const handle = url.match(/instagram\.com\/([^/?]+)/)?.[1] || '';
  const result: Partial<SocialProfile> & { bio?: string; avgLikes?: number } = {
    platform: 'instagram',
    url,
    handle,
  };

  // Try to get public profile data
  const html = curlFetch(url);
  if (html) {
    // Extract from meta tags / JSON-LD
    const followersMatch = html.match(/(\d[\d,.]*[KkMm]?)\s*(?:Followers|obserwuj)/i)
      || html.match(/"edge_followed_by":\{"count":(\d+)/);
    if (followersMatch) {
      result.followers = parseFollowerCount(followersMatch[1]);
    }

    const postsMatch = html.match(/(\d[\d,.]*)\s*(?:Posts|postów|posty)/i)
      || html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
    if (postsMatch) {
      result.posts = parseFollowerCount(postsMatch[1]);
    }

    const bioMatch = html.match(/<meta[^>]*(?:name|property)=["'](?:og:)?description["'][^>]*content=["'](.*?)["']/i);
    if (bioMatch) {
      result.bio = bioMatch[1].slice(0, 300);
    }

    result.verified = /verified/i.test(html);
  }

  return result;
}

async function scrapeFacebook(url: string): Promise<Partial<SocialProfile> & { likes?: number; rating?: number }> {
  const handle = url.match(/facebook\.com\/([^/?]+)/)?.[1] || '';
  const result: Partial<SocialProfile> & { likes?: number; rating?: number } = {
    platform: 'facebook',
    url,
    handle,
  };

  const html = curlFetch(url);
  if (html) {
    const likesMatch = html.match(/(\d[\d,.]*[KkMm]?)\s*(?:likes|osób lubi|polubień)/i);
    if (likesMatch) {
      result.likes = parseFollowerCount(likesMatch[1]);
      result.followers = result.likes;
    }

    const followersMatch = html.match(/(\d[\d,.]*[KkMm]?)\s*(?:followers|obserwujących)/i);
    if (followersMatch) {
      result.followers = parseFollowerCount(followersMatch[1]);
    }

    const ratingMatch = html.match(/([\d.]+)\s*(?:out of 5|\/\s*5|★)/);
    if (ratingMatch) {
      result.rating = parseFloat(ratingMatch[1]);
    }
  }

  return result;
}

async function scrapeTikTok(url: string): Promise<Partial<SocialProfile> & { likes?: number }> {
  const handle = url.match(/tiktok\.com\/@([^/?]+)/)?.[1] || '';
  const result: Partial<SocialProfile> & { likes?: number } = {
    platform: 'tiktok',
    url,
    handle,
  };

  const html = curlFetch(url);
  if (html) {
    const followersMatch = html.match(/(\d[\d,.]*[KkMm]?)\s*(?:Followers|Obserwujący)/i);
    if (followersMatch) {
      result.followers = parseFollowerCount(followersMatch[1]);
    }

    const likesMatch = html.match(/(\d[\d,.]*[KkMm]?)\s*(?:Likes|Polubienia)/i);
    if (likesMatch) {
      result.likes = parseFollowerCount(likesMatch[1]);
    }
  }

  return result;
}

// --- Apify mode ---

async function runApifyActor(actorId: string, input: Record<string, unknown>, apiToken: string): Promise<unknown[]> {
  try {
    const runResult = execSync(
      `curl -s -m 120 -X POST 'https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d '${JSON.stringify(input)}'`,
      { maxBuffer: 20 * 1024 * 1024, timeout: 130000 }
    );
    return JSON.parse(runResult.toString('utf-8'));
  } catch {
    return [];
  }
}

async function apifyInstagram(handle: string, apiToken: string): Promise<Record<string, unknown>> {
  const items = await runApifyActor('apify/instagram-profile-scraper', {
    usernames: [handle],
    resultsLimit: 1,
  }, apiToken);
  return (items[0] || {}) as Record<string, unknown>;
}

async function apifyFacebook(url: string, apiToken: string): Promise<Record<string, unknown>> {
  const items = await runApifyActor('apify/facebook-pages-scraper', {
    startUrls: [{ url }],
    maxPages: 1,
  }, apiToken);
  return (items[0] || {}) as Record<string, unknown>;
}

export async function enrichSocial(entity: EntityRecord): Promise<EntityRecord> {
  const socialUrls = extractSocialUrls(entity);
  const apiToken = process.env.APIFY_API_TOKEN;
  const useApify = !!apiToken;

  const socialData: SocialData = {
    profiles: [],
    totalFollowers: 0,
    platformCount: 0,
    fetchedAt: new Date().toISOString(),
    method: useApify ? 'apify' : 'crawl',
  };

  // Instagram
  if (socialUrls.instagram) {
    if (useApify) {
      const handle = socialUrls.instagram.match(/instagram\.com\/([^/?]+)/)?.[1] || '';
      const data = await apifyInstagram(handle, apiToken);
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
      };
      socialData.profiles.push(profile);
    } else {
      const data = await scrapeInstagram(socialUrls.instagram);
      const profile: SocialProfile = {
        platform: 'instagram',
        url: socialUrls.instagram,
        handle: data.handle || '',
        followers: data.followers,
        posts: data.posts,
        verified: data.verified,
      };
      socialData.instagram = { ...profile, bio: data.bio, avgLikes: data.avgLikes };
      socialData.profiles.push(profile);
    }
  }

  // Facebook
  if (socialUrls.facebook) {
    if (useApify) {
      const data = await apifyFacebook(socialUrls.facebook, apiToken);
      const profile: SocialProfile = {
        platform: 'facebook',
        url: socialUrls.facebook,
        handle: socialUrls.facebook.match(/facebook\.com\/([^/?]+)/)?.[1] || '',
        followers: data.likes as number | undefined,
      };
      socialData.facebook = {
        ...profile,
        likes: data.likes as number | undefined,
        rating: data.overallStarRating as number | undefined,
      };
      socialData.profiles.push(profile);
    } else {
      const data = await scrapeFacebook(socialUrls.facebook);
      const profile: SocialProfile = {
        platform: 'facebook',
        url: socialUrls.facebook,
        handle: data.handle || '',
        followers: data.followers,
      };
      socialData.facebook = { ...profile, likes: data.likes, rating: data.rating };
      socialData.profiles.push(profile);
    }
  }

  // TikTok
  if (socialUrls.tiktok) {
    const data = await scrapeTikTok(socialUrls.tiktok);
    const profile: SocialProfile = {
      platform: 'tiktok',
      url: socialUrls.tiktok,
      handle: data.handle || '',
      followers: data.followers,
    };
    socialData.tiktok = { ...profile, likes: data.likes };
    socialData.profiles.push(profile);
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
