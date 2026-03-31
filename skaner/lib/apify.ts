import { ApifyClient } from 'apify-client';
import type { ScrapedPost } from '@/types/scanner';

const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

const ACTOR_IDS: Record<string, string> = {
  instagram: 'apify/instagram-scraper',
  facebook: 'apify/facebook-posts-scraper',
  linkedin: 'apify/linkedin-company-posts-scraper',
};

const PROFILE_URLS: Record<string, (handle: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  facebook: (h) => `https://www.facebook.com/${h}/`,
  linkedin: (h) => `https://www.linkedin.com/company/${h}/`,
};

interface RawPost {
  url?: string;
  postUrl?: string;
  shortCode?: string;
  caption?: string;
  text?: string;
  timestamp?: string;
  displayUrl?: string;
  imageUrl?: string;
  images?: string[];
}

async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return '';
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch {
    return '';
  }
}

/**
 * Select a diverse sample of posts:
 * - 3 newest posts (recent signal)
 * - remaining slots: spread across the rest of the pool (temporal diversity)
 */
function selectDiverseSample(posts: ScrapedPost[], targetCount: number): ScrapedPost[] {
  if (posts.length <= targetCount) return posts;

  const RECENT_COUNT = 3;
  const recent = posts.slice(0, RECENT_COUNT);
  const pool = posts.slice(RECENT_COUNT);

  if (pool.length === 0) return recent.slice(0, targetCount);

  const remaining = targetCount - RECENT_COUNT;

  // Spread evenly across the pool (temporal stratified sampling)
  const step = pool.length / remaining;
  const sampled: ScrapedPost[] = [];
  for (let i = 0; i < remaining && i < pool.length; i++) {
    // Pick from evenly spaced positions, with a small random jitter
    const baseIndex = Math.floor(i * step);
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(step * 0.5)));
    const index = Math.min(baseIndex + jitter, pool.length - 1);
    if (!sampled.includes(pool[index])) {
      sampled.push(pool[index]);
    } else {
      // fallback: take next available
      sampled.push(pool[baseIndex]);
    }
  }

  const result = [...recent, ...sampled];
  console.log(`Post sampling: ${posts.length} total → ${recent.length} recent + ${sampled.length} spread = ${result.length} selected`);
  return result;
}

export async function scrapeSocialPosts(
  handle: string,
  platform: 'instagram' | 'facebook' | 'linkedin',
  limit: number = 8
): Promise<ScrapedPost[]> {
  const actorId = ACTOR_IDS[platform];
  if (!actorId) return [];

  const profileUrl = PROFILE_URLS[platform](handle);

  // Fetch more posts than needed so we can sample diversely
  const fetchLimit = Math.max(limit * 4, 30);

  const input: Record<string, unknown> = {
    directUrls: [profileUrl],
    resultsLimit: fetchLimit,
    resultsType: 'posts',
  };

  try {
    console.log(`Apify: scraping ${platform} for ${handle} — requesting ${fetchLimit} posts`);

    const run = await client.actor(actorId).call(input, {
      waitSecs: 120,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Apify: got ${items.length} items for ${handle}`);

    // Parse all posts (sorted newest first — Apify default)
    const allPosts: ScrapedPost[] = [];
    for (const item of items as RawPost[]) {
      const postUrl =
        item.url ||
        item.postUrl ||
        (platform === 'instagram' && item.shortCode
          ? `https://www.instagram.com/p/${item.shortCode}/`
          : '');

      if (!postUrl) continue;

      allPosts.push({
        url: postUrl,
        caption: item.caption || item.text || '',
        date: item.timestamp || '',
        screenshotBase64: '', // download images only for selected posts
        platform,
      });
    }

    // Select diverse sample
    const selected = selectDiverseSample(allPosts, limit);

    // Download images only for selected posts (saves bandwidth + time)
    for (const post of selected) {
      const rawItem = (items as RawPost[]).find(
        (item) =>
          (item.url || item.postUrl || '') === post.url ||
          (platform === 'instagram' && item.shortCode && post.url.includes(item.shortCode))
      );
      if (rawItem) {
        const imageUrl = rawItem.displayUrl || rawItem.imageUrl || (rawItem.images?.[0]) || '';
        if (imageUrl) {
          post.screenshotBase64 = await downloadImageAsBase64(imageUrl);
        }
      }
    }

    console.log(`Apify: ${selected.length} posts selected, ${selected.filter(p => p.screenshotBase64).length} with images for ${handle}`);
    return selected;
  } catch (error) {
    console.error(`Apify scraping failed for ${handle} on ${platform}:`, error);
    return [];
  }
}
