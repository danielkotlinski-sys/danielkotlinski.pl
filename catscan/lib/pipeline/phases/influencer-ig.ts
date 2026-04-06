/**
 * Phase: Influencer IG — detect influencer partnerships via Instagram tagged posts.
 *
 * Pipeline position: after social (needs IG handle), after influencer_press.
 *
 * Flow per entity:
 *   1. Get brand's Instagram handle from social phase data
 *   2. Apify instagram-tagged-scraper → posts where someone tagged the brand
 *   3. Filter: author has >5k followers + caption contains sponsorship markers
 *      OR author has >50k followers (high-profile = likely partnership)
 *   4. Extract: influencer handle, follower count, post URL, engagement, date
 *   5. Deduplicate with influencer_press data (same person via name matching)
 *
 * Requires: APIFY_API_TOKEN
 * Cost: ~$0.01-0.05/brand (Apify tagged posts scraper)
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IgInfluencerPost {
  authorUsername: string;
  authorFullName: string;
  authorFollowers: number;
  postUrl: string;
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  isSponsoredByCaption: boolean;
  sponsorshipSignals: string[];
}

interface InfluencerIgData {
  tagged_posts_found: number;
  influencer_posts: IgInfluencerPost[];
  unique_influencers: number;
  total_reach_followers: number;
  cost_usd: number;
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Apify helper (same pattern as social.ts)
// ---------------------------------------------------------------------------

function runApifyActor(actorId: string, input: Record<string, unknown>, apiToken: string, timeoutMs = 120000): unknown[] {
  const curlTimeout = Math.floor(timeoutMs / 1000) - 10;
  const inputFile = `/tmp/apify_ig_tagged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
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
// Sponsorship markers (Polish + international)
// ---------------------------------------------------------------------------

const CAPTION_MARKERS = [
  '#ad', '#reklama', '#współpraca', '#wspolpraca',
  '#materiałsponsorowany', '#materialreklamowy', '#materialsponsorowany',
  '#paid', '#sponsored', '#gifted', '#partner',
  'materiał sponsorowany', 'materiał reklamowy', 'współpraca reklamowa',
  'we współpracy z', 'w współpracy z',
];

function detectSponsorshipInCaption(caption: string): { isSponsoredByCaption: boolean; signals: string[] } {
  const lower = caption.toLowerCase();
  const signals: string[] = [];

  for (const marker of CAPTION_MARKERS) {
    if (lower.includes(marker.toLowerCase())) {
      signals.push(marker);
    }
  }

  return { isSponsoredByCaption: signals.length > 0, signals };
}

// ---------------------------------------------------------------------------
// Get brand IG handle from social phase data
// ---------------------------------------------------------------------------

function getBrandIgHandle(entity: EntityRecord): string | null {
  const social = (entity.data as Record<string, unknown>).social as Record<string, unknown> | undefined;
  if (!social) return null;

  const ig = social.instagram as Record<string, unknown> | undefined;
  if (!ig) return null;

  return (ig.handle as string) || (ig.url as string)?.match(/instagram\.com\/([^/?]+)/)?.[1] || null;
}

// ---------------------------------------------------------------------------
// Main phase function
// ---------------------------------------------------------------------------

const MIN_FOLLOWER_THRESHOLD = 5000;
const HIGH_PROFILE_THRESHOLD = 50000;
const MAX_TAGGED_POSTS = 100;

export async function enrichInfluencerIg(entity: EntityRecord): Promise<EntityRecord> {
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (!apifyToken) {
    return {
      ...entity,
      data: { ...entity.data, influencer_ig: { skipped: true, reason: 'APIFY_API_TOKEN not set' } },
    };
  }

  const igHandle = getBrandIgHandle(entity);
  if (!igHandle) {
    return {
      ...entity,
      data: {
        ...entity.data,
        influencer_ig: {
          skipped: true,
          reason: 'No Instagram handle found (run social phase first)',
        },
      },
    };
  }

  // 1. Fetch tagged posts via Apify
  const rawPosts = runApifyActor(
    'apify/instagram-tagged-scraper',
    {
      username: igHandle,
      resultsLimit: MAX_TAGGED_POSTS,
    },
    apifyToken,
    180000, // 3 min timeout
  ) as Array<Record<string, unknown>>;

  if (rawPosts.length === 0) {
    return {
      ...entity,
      data: {
        ...entity.data,
        influencer_ig: {
          tagged_posts_found: 0,
          influencer_posts: [],
          unique_influencers: 0,
          total_reach_followers: 0,
          cost_usd: 0.01,
          analyzed_at: new Date().toISOString(),
        },
        _cost_influencer_ig: { usd: 0.01 },
      },
    };
  }

  // 2. Process and filter posts
  const influencerPosts: IgInfluencerPost[] = [];
  const seenAuthors = new Set<string>();

  for (const post of rawPosts) {
    const authorUsername = (post.ownerUsername as string) || (post.username as string) || '';
    const authorFollowers = (post.ownerFollowerCount as number) || (post.followersCount as number) || 0;
    const caption = (post.caption as string) || '';
    const postUrl = (post.url as string) || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : '');

    // Skip if no author info
    if (!authorUsername) continue;

    // Skip brand's own posts
    if (authorUsername.toLowerCase() === igHandle.toLowerCase()) continue;

    // Detect sponsorship from caption
    const { isSponsoredByCaption, signals } = detectSponsorshipInCaption(caption);

    // Filter: must have sponsorship signals OR be high-profile
    const isHighProfile = authorFollowers >= HIGH_PROFILE_THRESHOLD;
    const meetsCriteria = authorFollowers >= MIN_FOLLOWER_THRESHOLD &&
      (isSponsoredByCaption || isHighProfile);

    if (!meetsCriteria) continue;

    // Deduplicate by author (keep first/best post)
    if (seenAuthors.has(authorUsername.toLowerCase())) continue;
    seenAuthors.add(authorUsername.toLowerCase());

    influencerPosts.push({
      authorUsername,
      authorFullName: (post.ownerFullName as string) || (post.fullName as string) || authorUsername,
      authorFollowers,
      postUrl,
      caption: caption.slice(0, 500),
      likes: (post.likesCount as number) || (post.likes as number) || 0,
      comments: (post.commentsCount as number) || (post.comments as number) || 0,
      timestamp: (post.timestamp as string) || (post.takenAtTimestamp ? new Date((post.takenAtTimestamp as number) * 1000).toISOString() : ''),
      isSponsoredByCaption,
      sponsorshipSignals: signals,
    });
  }

  // Sort by followers descending
  influencerPosts.sort((a, b) => b.authorFollowers - a.authorFollowers);

  // 3. Build output
  const totalReach = influencerPosts.reduce((sum, p) => sum + p.authorFollowers, 0);
  const cost = 0.02; // Apify tagged posts ~$0.01-0.03

  const igData: InfluencerIgData = {
    tagged_posts_found: rawPosts.length,
    influencer_posts: influencerPosts.slice(0, 30), // cap at 30 influencers per brand
    unique_influencers: influencerPosts.length,
    total_reach_followers: totalReach,
    cost_usd: cost,
    analyzed_at: new Date().toISOString(),
  };

  return {
    ...entity,
    data: {
      ...entity.data,
      influencer_ig: igData,
      _cost_influencer_ig: { usd: cost },
    },
  };
}
