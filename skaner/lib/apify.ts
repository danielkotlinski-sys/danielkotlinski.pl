import { ApifyClient } from 'apify-client';
import type { ScrapedPost, WebsiteScreenshot } from '@/types/scanner';
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
  // Instagram fields
  caption?: string;
  text?: string;
  timestamp?: string;
  displayUrl?: string;
  imageUrl?: string;
  images?: string[];
  // Facebook fields (apify/facebook-posts-scraper)
  postText?: string;
  postDate?: string;
  postImages?: Array<{ image?: string; link?: string }>;
  media?: Array<{ thumbnail?: string; photo_image?: { uri?: string } }>;
  full_picture?: string;
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

  const input: Record<string, unknown> = platform === 'facebook'
    ? {
        startUrls: [{ url: profileUrl }],
        resultsLimit: fetchLimit,
      }
    : {
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
        caption: item.caption || item.postText || item.text || '',
        date: item.timestamp || item.postDate || '',
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
          const imageUrl =
            rawItem.displayUrl ||
            rawItem.imageUrl ||
            rawItem.images?.[0] ||
            rawItem.postImages?.[0]?.image ||
            rawItem.full_picture ||
            '';
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

// ===================== FACEBOOK AD LIBRARY =====================

export interface FacebookAd {
  pageId?: string;
  pageName?: string;
  adBodyText?: string;
  adLinkCaption?: string;
  adLinkTitle?: string;
  adLinkDescription?: string;
  adImageUrls?: string[];
  adVideoUrls?: string[];
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  currency?: string;
  spendLower?: number;
  spendUpper?: number;
  impressionsLower?: number;
  impressionsUpper?: number;
  screenshotBase64?: string; // first image downloaded
}

/**
 * Scrape active Facebook/Meta ads for a brand from the Ad Library.
 * Uses the Apify actor `curious_coder/facebook-ads-library-scraper`.
 * @param brandName — brand/page name to search for
 * @param country — ISO country code (default: PL)
 * @param limit — max ads to return
 */
export async function scrapeFacebookAds(
  brandName: string,
  country: string = 'PL',
  limit: number = 10,
  costTracker?: ScanCostTracker
): Promise<FacebookAd[]> {
  const actorId = 'curious_coder/facebook-ads-library-scraper';

  const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(brandName)}&search_type=keyword_unordered&media_type=all`;

  try {
    const startTime = Date.now();
    console.log(`Apify: scraping Facebook Ad Library for "${brandName}" (country: ${country}, limit: ${limit})`);

    // Fetch more than needed — keyword search returns ads from unrelated pages
    const fetchLimit = limit * 3;

    const run = await client.actor(actorId).call(
      {
        urls: [{ url: searchUrl }],
        limitPerSource: fetchLimit,
      },
      { waitSecs: 90 }
    );

    const runDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Apify: Facebook Ads — got ${items.length} raw ads for "${brandName}" in ${runDuration}s`);

    if (costTracker) {
      costTracker.trackApify('facebook-ads', `ads: ${brandName} (${items.length} raw)`);
    }

    // Parse all ads first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allAds: FacebookAd[] = (items as any[]).map((item) => ({
      pageId: item.pageId || item.page_id,
      pageName: item.pageName || item.page_name || item.pageInfo?.name,
      adBodyText: item.body?.text || item.ad_creative_bodies?.[0] || item.snapshot?.body?.text || '',
      adLinkCaption: item.ad_creative_link_captions?.[0] || item.snapshot?.link_url || '',
      adLinkTitle: item.ad_creative_link_titles?.[0] || item.snapshot?.title || item.title || '',
      adLinkDescription: item.ad_creative_link_descriptions?.[0] || item.snapshot?.link_description || '',
      adImageUrls: item.snapshot?.images?.map((img: { original_image_url?: string; url?: string }) => img.original_image_url || img.url).filter(Boolean)
        || item.ad_creative_link_images || [],
      adVideoUrls: item.snapshot?.videos?.map((v: { video_hd_url?: string; video_sd_url?: string }) => v.video_hd_url || v.video_sd_url).filter(Boolean) || [],
      startDate: item.startDate || item.ad_delivery_start_time || '',
      endDate: item.endDate || item.ad_delivery_stop_time || '',
      isActive: item.isActive ?? item.ad_delivery_stop_time === undefined,
      currency: item.currency || item.spend?.currency || '',
      spendLower: item.spend?.lower_bound ?? item.bylines?.spend?.lower_bound,
      spendUpper: item.spend?.upper_bound ?? item.bylines?.spend?.upper_bound,
      impressionsLower: item.impressions?.lower_bound ?? item.bylines?.impressions?.lower_bound,
      impressionsUpper: item.impressions?.upper_bound ?? item.bylines?.impressions?.upper_bound,
    }));

    // Log unique page names for debugging
    const uniquePages = Array.from(new Set(allAds.map((a) => a.pageName).filter(Boolean)));
    console.log(`Apify: Facebook Ads — pages found for "${brandName}":`, uniquePages.join(', '));

    // Filter: keep only ads from pages whose name matches the brand
    // Normalize for comparison (lowercase, strip suffixes like S.A., sp. z o.o.)
    const normalize = (s: string) => s.toLowerCase()
      .replace(/\s*(s\.?\s*a\.?|sp\.?\s*z\.?\s*o\.?\s*o\.?)\.?\s*/g, '')
      .replace(/[^a-ząćęłńóśźż0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const brandNorm = normalize(brandName);

    // Build acronym from brand name (e.g. "Nice To Fit You" → "ntfy")
    const brandAcronym = brandNorm.split(' ').length > 2
      ? brandNorm.split(' ').map((w) => w[0]).join('')
      : '';
    // Build acronym from page name for reverse matching (e.g. page "NTFY" could be acronym of brand "Nice To Fit You")
    const isAcronymLike = (s: string) => s.replace(/\s/g, '').length <= 6 && /^[a-ząćęłńóśźż]+$/.test(s.replace(/\s/g, ''));

    const ads = allAds.filter((ad) => {
      if (!ad.pageName) return false;
      const pageNorm = normalize(ad.pageName);
      // Match if either contains the other (handles "ING Bank Śląski" vs "ING Bank Śląski S.A.")
      const match = pageNorm.includes(brandNorm) || brandNorm.includes(pageNorm);
      if (match) return true;

      // Try matching just the first word (e.g. "mBank" in "mBank S.A.")
      const brandFirst = brandNorm.split(' ')[0];
      const pageFirst = pageNorm.split(' ')[0];
      if (brandFirst.length >= 3 && (pageNorm.includes(brandFirst) || brandFirst.includes(pageFirst))) {
        return true;
      }

      // Acronym matching: brand "NTFY" matches page "Nice To Fit You" and vice versa
      if (brandAcronym && pageNorm.replace(/\s/g, '') === brandAcronym) return true;
      if (isAcronymLike(brandNorm)) {
        const pageAcronym = pageNorm.split(' ').filter((w) => w.length > 0).map((w) => w[0]).join('');
        if (pageAcronym === brandNorm.replace(/\s/g, '')) return true;
      }
      // Also check if page acronym matches brand name
      const pageAcronymFull = pageNorm.split(' ').filter((w) => w.length > 0).map((w) => w[0]).join('');
      if (pageAcronymFull.length >= 2 && brandNorm.replace(/\s/g, '') === pageAcronymFull) return true;

      return false;
    }).slice(0, limit);

    console.log(`Apify: Facebook Ads — ${allAds.length} raw → ${ads.length} matched for "${brandName}" (brandNorm: "${brandNorm}", acronym: "${brandAcronym}")`);

    // Download first image for up to 8 ads
    const adsWithImages = ads.filter((ad) => ad.adImageUrls && ad.adImageUrls.length > 0);
    await Promise.all(
      adsWithImages.slice(0, 8).map(async (ad) => {
        if (ad.adImageUrls?.[0]) {
          ad.screenshotBase64 = await downloadImageAsBase64(ad.adImageUrls[0]);
        }
      })
    );

    console.log(`Apify: Facebook Ads — ${ads.length} final, ${adsWithImages.filter(a => a.screenshotBase64).length} with images`);
    return ads;
  } catch (error) {
    console.error(`Apify: Facebook Ads scraping failed for "${brandName}":`, error);
    return [];
  }
}

// ===================== WEBSITE CRAWLER =====================

interface WebsiteCrawlResult {
  websiteText: string;
  screenshots: WebsiteScreenshot[];
}

/**
 * Crawl a brand's website using apify/website-content-crawler.
 * Handles cookie consent automatically, discovers subpages, and takes screenshots.
 * Returns extracted text + viewport screenshots for homepage + subpages.
 */
export async function scrapeWebsitePages(
  baseUrl: string,
  maxPages: number = 4,
  costTracker?: ScanCostTracker
): Promise<WebsiteCrawlResult> {
  const normalizedUrl = baseUrl.replace(/\/$/, '');

  try {
    console.log(`Apify: crawling website ${normalizedUrl} (max ${maxPages} pages)`);
    const startTime = Date.now();

    const run = await client.actor('apify/website-content-crawler').call(
      {
        startUrls: [{ url: normalizedUrl }],
        crawlerType: 'playwright:firefox',  // must use full browser for screenshots (adaptive skips them in HTTP-only mode)
        maxCrawlDepth: 1,
        maxCrawlPages: maxPages + 2, // buffer for thin/redirect pages
        saveScreenshots: true,
        removeCookieWarnings: true,
        // Exclude files, assets, and irrelevant paths
        excludeUrlGlobs: [
          '**/*.pdf', '**/*.zip', '**/*.jpg', '**/*.png', '**/*.svg',
          '**/wp-admin/**', '**/wp-login**', '**/cart**', '**/koszyk**',
          '**/login**', '**/logowanie**', '**/regulamin**', '**/polityka**',
          '**/privacy**', '**/cookie**', '**/rodo**',
        ],
        maxRequestRetries: 2,
      },
      { waitSecs: 180 }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Apify: website crawl done for ${normalizedUrl} — ${items.length} pages in ${duration}s`);

    if (costTracker) {
      costTracker.trackApify('website', `${normalizedUrl} (${items.length} pages)`);
    }

    // Extract text from pages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crawledPages = (items as any[])
      .filter((item) => {
        const text = item.text || item.markdown || '';
        return text.length > 150; // skip thin/error pages
      })
      .map((item) => ({
        url: item.url || '',
        title: item.metadata?.title || item.title || '',
        text: item.text || item.markdown || '',
      }));

    // Truncate individual page texts to avoid bloated payloads (max 5000 chars per page)
    const MAX_PER_PAGE = 5000;
    for (const page of crawledPages) {
      if (page.text.length > MAX_PER_PAGE) {
        page.text = page.text.slice(0, MAX_PER_PAGE) + '\n[...przycinanie: dalszy tekst strony pominięty]';
      }
    }

    // Combine text (homepage first, then subpages sorted by length)
    const homepageIndex = crawledPages.findIndex((p) =>
      p.url.replace(/\/$/, '') === normalizedUrl
    );
    const homepage = homepageIndex >= 0 ? crawledPages.splice(homepageIndex, 1)[0] : null;
    const subpages = crawledPages
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, 3);
    const orderedPages = homepage ? [homepage, ...subpages] : subpages;
    let websiteText = orderedPages.map((p) => p.text).join('\n\n---\n\n');

    // Final safety cap — max 15000 chars total across all pages
    const MAX_TOTAL = 15000;
    if (websiteText.length > MAX_TOTAL) {
      websiteText = websiteText.slice(0, MAX_TOTAL) + '\n[...przycinanie: dalszy tekst pominięty]';
    }
    const pageCount = orderedPages.length;
    console.log(`Apify: website text — ${pageCount} pages, ${websiteText.length} chars for ${normalizedUrl}`);

    // Get screenshots from key-value store
    const screenshots: WebsiteScreenshot[] = [];
    try {
      const kvStoreId = run.defaultKeyValueStoreId;
      const { items: kvKeys } = await client.keyValueStore(kvStoreId).listKeys();
      const screenshotKeys = kvKeys.filter(
        (k: { key: string }) => k.key.toLowerCase().includes('screenshot')
      );

      console.log(`Apify: found ${screenshotKeys.length} screenshot keys in KV store`);

      // Download screenshots (limit to maxPages)
      for (const keyInfo of screenshotKeys.slice(0, maxPages)) {
        try {
          const record = await client.keyValueStore(kvStoreId).getRecord(keyInfo.key);
          if (record && record.value) {
            let base64: string;
            if (Buffer.isBuffer(record.value)) {
              base64 = record.value.toString('base64');
            } else if (typeof record.value === 'string') {
              base64 = record.value;
            } else {
              base64 = Buffer.from(record.value as unknown as ArrayBuffer).toString('base64');
            }

            if (base64.length > 5000) {
              if (base64.length > 2 * 1024 * 1024) {
                console.log(`Apify: large screenshot (${(base64.length / 1024 / 1024).toFixed(1)}MB) for ${normalizedUrl} — full-page capture, will be cropped in UI`);
              }
              // Try to match with a crawled page by index
              const matchedPage = orderedPages[screenshots.length] || orderedPages[0];
              screenshots.push({
                url: matchedPage?.url || normalizedUrl,
                title: matchedPage?.title || '',
                screenshotBase64: base64,
              });
            }
          }
        } catch (e) {
          console.log(`Apify: failed to get screenshot ${keyInfo.key}:`, e);
        }
      }
    } catch (kvErr) {
      console.log('Apify: KV store screenshot retrieval failed:', kvErr);
    }

    // If no screenshots from KV store, try screenshotUrl field from dataset
    if (screenshots.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (items as any[]).slice(0, maxPages)) {
        const screenshotUrl = item.screenshotUrl || item.screenshot;
        if (screenshotUrl && typeof screenshotUrl === 'string') {
          const base64 = await downloadImageAsBase64(screenshotUrl);
          if (base64.length > 5000) {
            screenshots.push({
              url: item.url || '',
              title: item.metadata?.title || item.title || '',
              screenshotBase64: base64,
            });
          }
        }
      }
    }

    console.log(`Apify: website crawl complete — ${pageCount} pages text, ${screenshots.length} screenshots for ${normalizedUrl}`);
    return { websiteText, screenshots };
  } catch (error) {
    console.error(`Apify: website crawl failed for ${normalizedUrl}:`, error);
    return { websiteText: '', screenshots: [] };
  }
}

/**
 * Batch scrape homepage text for many brands using cheerio (HTTP only, no browser).
 * Used for communication saturation benchmark — needs only text, no screenshots.
 * Much cheaper than playwright: ~0.01-0.03 CU per page vs ~0.3 CU.
 */
export async function batchScrapeHomepages(
  urls: Array<{ name: string; url: string }>,
  costTracker?: ScanCostTracker
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  try {
    console.log(`Apify: batch cheerio scrape of ${urls.length} homepages`);
    const startTime = Date.now();

    const run = await client.actor('apify/website-content-crawler').call(
      {
        startUrls: urls.map(({ url }) => ({ url: url.replace(/\/$/, '') })),
        crawlerType: 'cheerio',
        maxCrawlDepth: 0,
        maxCrawlPages: urls.length,
        removeCookieWarnings: true,
        maxRequestRetries: 1,
        requestTimeoutSecs: 30,
      },
      { waitSecs: 120 }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Apify: batch cheerio done — ${items.length}/${urls.length} pages in ${duration}s`);

    if (costTracker) {
      costTracker.trackApify('website', `batch benchmark (${items.length} pages, cheerio)`);
    }

    // Map results back to brand names by URL matching
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of items as any[]) {
      const itemUrl = (item.url || '').replace(/\/$/, '').toLowerCase();
      const text = item.text || item.markdown || '';
      if (text.length < 50) continue;

      const matched = urls.find(({ url }) =>
        itemUrl.includes(url.replace(/https?:\/\//, '').replace(/\/$/, '').toLowerCase())
      );
      if (matched) {
        // Truncate to ~1500 chars for cost efficiency in extraction prompt
        results[matched.name] = text.slice(0, 1500);
      }
    }

    console.log(`Apify: batch cheerio — matched ${Object.keys(results).length}/${urls.length} brands`);
    return results;
  } catch (error) {
    console.error('Apify: batch cheerio scrape failed:', error);
    return results;
  }
}
