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
  shortCode?: string;
  caption?: string;
  text?: string;
  timestamp?: string;
  displayUrl?: string;
  postUrl?: string;
  likesCount?: number;
}

export async function scrapeSocialPosts(
  handle: string,
  platform: 'instagram' | 'facebook' | 'linkedin',
  limit: number = 8
): Promise<ScrapedPost[]> {
  const actorId = ACTOR_IDS[platform];
  if (!actorId) return [];

  const profileUrl = PROFILE_URLS[platform](handle);

  // Use directUrls — this is what the actor expects
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

      // Take screenshot of each post
      const screenshot = await screenshotPost(postUrl);

      posts.push({
        url: postUrl,
        caption: item.caption || item.text || '',
        date: item.timestamp || '',
        screenshotBase64: screenshot,
        platform,
      });
    }

    return posts;
  } catch (error) {
    console.error(`Apify scraping failed for ${handle} on ${platform}:`, error);
    return [];
  }
}

async function screenshotPost(postUrl: string): Promise<string> {
  try {
    const run = await client.actor('apify/screenshot-url').call(
      {
        url: postUrl,
        waitUntil: 'networkidle2',
        width: 600,
      },
      { waitSecs: 60 }
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const result = items[0] as { screenshotBase64?: string; screenshot?: string };
    return result?.screenshotBase64 || result?.screenshot || '';
  } catch (error) {
    console.error(`Screenshot failed for ${postUrl}:`, error);
    return '';
  }
}
