import { ApifyClient } from 'apify-client';
import type { ScrapedPost } from '@/types/scanner';
import type { ScanCostTracker } from './costs';

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);
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
  limit: number = 8,
  costTracker?: ScanCostTracker
): Promise<ScrapedPost[]> {
  const actorId = ACTOR_IDS[platform];
  if (!actorId) return [];

  const profileUrl = PROFILE_URLS[platform](handle);

  // Fetch more posts than needed so we can sample diversely
  // Keep low (20) to reduce Instagram rate-limiting when running multiple actors
  const fetchLimit = Math.max(limit * 2, 20);

  const input: Record<string, unknown> = {
    directUrls: [profileUrl],
    resultsLimit: fetchLimit,
    resultsType: 'posts',
  };

  try {
    const startTime = Date.now();
    console.log(`Apify: scraping ${platform} for ${handle} — requesting ${fetchLimit} posts`);

    const run = await client.actor(actorId).call(input, {
      waitSecs: 90,
    });

    const runDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Apify: got ${items.length} items for ${handle} (actor ran ${runDuration}s)`);

    if (costTracker) {
      costTracker.trackApify(platform, `${handle} (${items.length} posts)`);
    }

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

    // Download images for selected posts (parallel, with 10s timeout each)
    console.log(`Apify: downloading images for ${selected.length} posts (${handle})...`);
    const imageStart = Date.now();
    await Promise.all(
      selected.map(async (post) => {
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
      })
    );
    console.log(`Apify: images done for ${handle} in ${((Date.now() - imageStart) / 1000).toFixed(1)}s`);

    console.log(`Apify: ${selected.length} posts selected, ${selected.filter(p => p.screenshotBase64).length} with images for ${handle}`);
    return selected;
  } catch (error) {
    console.error(`Apify scraping failed for ${handle} on ${platform}:`, error);
    return [];
  }
}
