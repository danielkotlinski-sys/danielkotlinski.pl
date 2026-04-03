import Firecrawl from '@mendable/firecrawl-js';
import type { WebsiteScreenshot } from '@/types/scanner';
import type { ScanCostTracker } from './costs';

let _firecrawl: Firecrawl | null = null;

function getClient(): Firecrawl | null {
  if (!process.env.FIRECRAWL_API_KEY) return null;
  if (!_firecrawl) {
    _firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return _firecrawl;
}

interface WebsiteCrawlResult {
  websiteText: string;
  screenshots: WebsiteScreenshot[];
}

/**
 * Crawl a brand's website using Firecrawl (v2 API).
 * Extracts markdown text + viewport screenshots for homepage + subpages.
 * Much cheaper than Apify website-content-crawler (~2 credits per page).
 */
export async function crawlWebsite(
  baseUrl: string,
  maxPages: number = 4,
  costTracker?: ScanCostTracker
): Promise<WebsiteCrawlResult> {
  const normalizedUrl = baseUrl.replace(/\/$/, '');

  const client = getClient();
  if (!client) {
    console.log('Firecrawl: no API key, skipping');
    return { websiteText: '', screenshots: [] };
  }

  try {
    console.log(`Firecrawl: crawling ${normalizedUrl} (max ${maxPages} pages)`);
    const startTime = Date.now();

    // v2 API: crawl() starts a crawl and polls until complete
    const job = await client.crawl(normalizedUrl, {
      maxDiscoveryDepth: 1,
      limit: maxPages + 2, // buffer for thin/redirect pages
      excludePaths: [
        '/regulamin*', '/polityka*', '/privacy*', '/cookie*', '/rodo*',
        '/cart*', '/koszyk*', '/login*', '/logowanie*', '/wp-admin*',
        '/wp-login*', '/cdn-cgi*', '/feed*', '/sitemap*',
      ],
      scrapeOptions: {
        formats: ['markdown', { type: 'screenshot', fullPage: false }],
        onlyMainContent: true,
        excludeTags: [
          'nav', 'footer', 'header nav',
          '.cookie-banner', '.cookie-consent', '#CookiebotDialog',
          '[class*="cookie"]', '[id*="cookie"]',
          '[class*="consent"]', '[id*="consent"]',
          '.newsletter-popup', '.popup-overlay', '.modal-overlay',
        ],
        waitFor: 2000,
        blockAds: true,
      },
      timeout: 120,
      pollInterval: 3,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (job.status !== 'completed' || !job.data || job.data.length === 0) {
      console.log(`Firecrawl: crawl ${job.status} for ${normalizedUrl} — ${job.data?.length || 0} pages`);
      return { websiteText: '', screenshots: [] };
    }

    const pages = job.data;
    console.log(`Firecrawl: crawl done — ${pages.length} pages, ${job.creditsUsed || '?'} credits in ${duration}s`);

    if (costTracker) {
      costTracker.trackFirecrawl(`${normalizedUrl} (${pages.length} pages)`, pages.length);
    }

    // Filter out thin/error pages
    const validPages = pages.filter((p) => {
      const text = p.markdown || '';
      return text.length > 150;
    });

    // Separate homepage from subpages, order: homepage first, then by content length
    const homepageIdx = validPages.findIndex((p) =>
      (p.metadata?.sourceURL || '').replace(/\/$/, '') === normalizedUrl
    );
    const homepage = homepageIdx >= 0 ? validPages.splice(homepageIdx, 1)[0] : null;
    const subpages = validPages
      .sort((a, b) => (b.markdown?.length || 0) - (a.markdown?.length || 0))
      .slice(0, 3);
    const orderedPages = homepage ? [homepage, ...subpages] : subpages;

    // Build text
    const websiteText = orderedPages
      .map((p) => p.markdown || '')
      .filter(Boolean)
      .join('\n\n---\n\n');

    // Build screenshots
    const screenshots: WebsiteScreenshot[] = [];
    for (const page of orderedPages) {
      if (page.screenshot && page.screenshot.length > 100) {
        // Firecrawl returns screenshot as base64 (may include data URI prefix)
        let base64 = page.screenshot;
        if (base64.startsWith('data:')) {
          base64 = base64.split(',')[1] || base64;
        }
        if (base64.length > 5000) {
          screenshots.push({
            url: page.metadata?.sourceURL || normalizedUrl,
            title: page.metadata?.title || '',
            screenshotBase64: base64,
          });
        }
      }
    }

    console.log(`Firecrawl: ${orderedPages.length} pages text (${websiteText.length} chars), ${screenshots.length} screenshots for ${normalizedUrl}`);
    return { websiteText, screenshots };
  } catch (error) {
    console.error(`Firecrawl: crawl failed for ${normalizedUrl}:`, error);
    return { websiteText: '', screenshots: [] };
  }
}
