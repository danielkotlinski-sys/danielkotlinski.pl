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

export async function scrapeSocialPosts(
  handle: string,
  platform: 'instagram' | 'facebook' | 'linkedin',
  limit: number = 8
): Promise<ScrapedPost[]> {
  const actorId = ACTOR_IDS[platform];
  if (!actorId) return [];

  const profileUrl = PROFILE_URLS[platform](handle);

  const input: Record<string, unknown> = {
    directUrls: [profileUrl],
    resultsLimit: limit,
    resultsType: 'posts',
  };

  try {
    console.log(`Apify: scraping ${platform} for ${handle} via ${profileUrl}`);

    const run = await client.actor(actorId).call(input, {
      waitSecs: 120,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Apify: got ${items.length} items for ${handle}`);

    const posts: ScrapedPost[] = [];

    for (const item of items as RawPost[]) {
      const postUrl =
        item.url ||
        item.postUrl ||
        (platform === 'instagram' && item.shortCode
          ? `https://www.instagram.com/p/${item.shortCode}/`
          : '');

      if (!postUrl) continue;

      // Get image directly from scraper results (no separate screenshot actor)
      const imageUrl = item.displayUrl || item.imageUrl || (item.images?.[0]) || '';
      let screenshotBase64 = '';

      if (imageUrl) {
        screenshotBase64 = await downloadImageAsBase64(imageUrl);
      }

      posts.push({
        url: postUrl,
        caption: item.caption || item.text || '',
        date: item.timestamp || '',
        screenshotBase64,
        platform,
      });
    }

    console.log(`Apify: ${posts.length} posts with ${posts.filter(p => p.screenshotBase64).length} images for ${handle}`);
    return posts;
  } catch (error) {
    console.error(`Apify scraping failed for ${handle} on ${platform}:`, error);
    return [];
  }
}
