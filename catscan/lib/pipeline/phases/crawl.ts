/** Phase: Crawl — fetch website HTML for each entity.
 *
 *  Strategy:
 *    1. If APIFY_API_TOKEN is set, use Apify website-content-crawler (Playwright)
 *       which renders JavaScript fully — critical for SPA sites (React/Next.js).
 *    2. Otherwise fall back to plain curl (no JS rendering).
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract social media URLs from anchor href attributes in HTML. */
function extractSocialLinks(html: string): Record<string, string> {
  const socialLinks: Record<string, string> = {};
  const linkRegex = /<a[^>]+href=["'](.*?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1];
    if (/instagram\.com\/[a-zA-Z0-9_.]+/i.test(href)) {
      socialLinks.instagram = href;
    } else if (/facebook\.com\/[a-zA-Z0-9_.]+/i.test(href)) {
      socialLinks.facebook = href;
    } else if (/tiktok\.com\/@[a-zA-Z0-9_.]+/i.test(href)) {
      socialLinks.tiktok = href;
    } else if (/youtube\.com\/(c\/|channel\/|@)[a-zA-Z0-9_.]+/i.test(href)) {
      socialLinks.youtube = href;
    } else if (/linkedin\.com\/(company|in)\/[a-zA-Z0-9_.%-]+/i.test(href)) {
      socialLinks.linkedin = href;
    }
  }
  return socialLinks;
}

/** Search for NIP (Polish tax-id) in text. */
function extractNip(text: string): string | undefined {
  const nipRegex = /(?:NIP|nip)[:\s]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = nipRegex.exec(text)) !== null) {
    const cleaned = m[1].replace(/[-\s]/g, '');
    if (cleaned.length === 10) return cleaned;
  }
  return undefined;
}

/** Extract first email address found in text. */
function extractEmail(text: string): string | null {
  const m = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  return m?.[0] ?? null;
}

/** Extract first phone number found in text. */
function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+48|48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}/);
  return m?.[0]?.trim() ?? null;
}

/** Extract common meta tags from HTML. */
function extractMeta(html: string) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i,
  );
  const ogImageMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i,
  );
  return {
    title: titleMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || '',
    ogImage: ogImageMatch?.[1]?.trim() || '',
  };
}

// ---------------------------------------------------------------------------
// curl-based fetcher (fallback, no JS rendering)
// ---------------------------------------------------------------------------

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 15 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' -H 'Accept: text/html' -H 'Accept-Language: pl,en;q=0.9' '${url}'`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 },
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

function crawlWithCurl(
  url: string,
): {
  allHtml: string;
  allText: string;
  subpagesCrawled: number;
} {
  const html = curlFetch(url);
  if (!html || html.length < 100) {
    return { allHtml: '', allText: '', subpagesCrawled: 0 };
  }

  const textContent = stripHtml(html);

  // Collect internal links for subpage crawling
  const allLinks: string[] = [];
  const linkRegex = /<a[^>]+href=["'](.*?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    allLinks.push(m[1]);
  }

  const internalLinks = allLinks
    .filter((l) => l.startsWith('/') || l.startsWith(url))
    .slice(0, 20);

  const valuablePages = internalLinks.filter((l) => {
    const lower = l.toLowerCase();
    return /cen|pric|menu|diet|ofert|about|o-nas|kontakt|contact|jak-to|how|faq|dostaw|deliver|regulamin|polityka|privacy|terms|impress/.test(
      lower,
    );
  });

  let subpageTexts = '';
  let subpagesCrawled = 0;
  for (const subpage of valuablePages.slice(0, 3)) {
    try {
      const subUrl = subpage.startsWith('http')
        ? subpage
        : new URL(subpage, url).href;
      const subHtml = curlFetch(subUrl);
      if (subHtml) {
        const subText = stripHtml(subHtml);
        subpageTexts += `\n\n--- PAGE: ${subUrl} ---\n${subText.slice(0, 5000)}`;
        subpagesCrawled++;
      }
    } catch {
      // skip failed subpages
    }
  }

  const allText = textContent.slice(0, 15000) + subpageTexts.slice(0, 10000);

  return { allHtml: html + subpageTexts, allText, subpagesCrawled };
}

// ---------------------------------------------------------------------------
// Apify website-content-crawler (Playwright-based, full JS rendering)
// ---------------------------------------------------------------------------

interface ApifyCrawlItem {
  url: string;
  text?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
}

function crawlWithApify(
  url: string,
  token: string,
): {
  allHtml: string;
  allText: string;
  subpagesCrawled: number;
  meta: { title: string; description: string; ogImage: string };
  items: ApifyCrawlItem[];
} {
  const domain = new URL(url).origin;

  const input = JSON.stringify({
    startUrls: [{ url }],
    maxCrawlPages: 5,
    crawlerType: 'playwright:adaptive',
    maxCrawlDepth: 1,
    includeUrlGlobs: [`${domain}/**`],
    outputFormats: ['text', 'html'],
    // SPA fix: use domcontentloaded instead of networkidle
    // networkidle never fires on sites with trackers/analytics
    waitUntil: 'domcontentloaded',
    navigationTimeoutSecs: 30,
    requestTimeoutSecs: 60,
    maxConcurrency: 2,
    // Extra wait for SPA hydration after DOM load
    waitForSecs: 3,
  });

  // Write input to a temp file to avoid shell quoting issues with JSON
  const tmpFile = `/tmp/apify_input_${Date.now()}.json`;
  execSync(`cat > '${tmpFile}' << 'APIFY_EOF'\n${input}\nAPIFY_EOF`);

  try {
    const apiUrl = `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${token}`;

    const result = execSync(
      `curl -sS -X POST '${apiUrl}' -H 'Content-Type: application/json' -d @'${tmpFile}'`,
      {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    const items: ApifyCrawlItem[] = JSON.parse(result.toString('utf-8'));

    if (!Array.isArray(items) || items.length === 0) {
      return {
        allHtml: '',
        allText: '',
        subpagesCrawled: 0,
        meta: { title: '', description: '', ogImage: '' },
        items: [],
      };
    }

    // Combine HTML from all pages for extraction
    const combinedHtml = items
      .map((it) => it.html || '')
      .join('\n');

    // Combine text from all pages
    const combinedText = items
      .map((it, idx) => {
        const pageUrl = it.url || `page-${idx}`;
        const text = it.text || (it.html ? stripHtml(it.html) : '');
        return `--- PAGE: ${pageUrl} ---\n${text}`;
      })
      .join('\n\n');

    // Extract meta from the main page item (first one, or the one matching startUrl)
    const mainItem =
      items.find((it) => it.url === url) || items[0];
    let meta = { title: '', description: '', ogImage: '' };

    if (mainItem?.metadata) {
      meta.title = (mainItem.metadata.title as string) || '';
      meta.description = (mainItem.metadata.description as string) || '';
    }
    // Also try extracting from HTML meta tags as fallback
    if (mainItem?.html) {
      const htmlMeta = extractMeta(mainItem.html);
      meta = {
        title: meta.title || htmlMeta.title,
        description: meta.description || htmlMeta.description,
        ogImage: htmlMeta.ogImage,
      };
    }

    return {
      allHtml: combinedHtml,
      allText: combinedText.slice(0, 25000),
      subpagesCrawled: items.length - 1,
      meta,
      items,
    };
  } finally {
    try {
      execSync(`rm -f '${tmpFile}'`);
    } catch {
      // ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function crawlEntity(
  entity: EntityRecord,
): Promise<EntityRecord> {
  const url = entity.url.startsWith('http')
    ? entity.url
    : `https://${entity.url}`;

  try {
    const apifyToken = process.env.APIFY_API_TOKEN;
    const useApify = Boolean(apifyToken);

    let allHtml: string;
    let allText: string;
    let subpagesCrawled: number;
    let meta: { title: string; description: string; ogImage: string };

    if (useApify) {
      // ---- Apify path (Playwright, full JS rendering) --------------------
      const apifyResult = crawlWithApify(url, apifyToken!);
      allHtml = apifyResult.allHtml;
      allText = apifyResult.allText;
      subpagesCrawled = apifyResult.subpagesCrawled;
      meta = apifyResult.meta;
    } else {
      // ---- Fallback curl path (no JS rendering) --------------------------
      const curlResult = crawlWithCurl(url);
      allHtml = curlResult.allHtml;
      allText = curlResult.allText;
      subpagesCrawled = curlResult.subpagesCrawled;
      meta = extractMeta(allHtml);
    }

    if (allText.length < 50 && allHtml.length < 100) {
      return {
        ...entity,
        status: 'failed',
        errors: [
          ...entity.errors,
          `Empty or failed response from ${url}${useApify ? ' (Apify)' : ' (curl)'}`,
        ],
      };
    }

    // Extract structured data from the combined HTML of all pages
    const socialLinks = extractSocialLinks(allHtml);
    const foundNip = extractNip(allHtml) || extractNip(allText);
    const email = extractEmail(allHtml) || extractEmail(allText);
    const phone = extractPhone(allHtml) || extractPhone(allText);

    return {
      ...entity,
      rawHtml: allText,
      nip: foundNip || entity.nip,
      domain: new URL(url).hostname,
      data: {
        ...entity.data,
        _meta: {
          ...meta,
          crawledUrl: url,
          crawlerType: useApify ? 'apify-playwright' : 'curl',
          subpagesCrawled,
          contentLength: allText.length,
          crawledAt: new Date().toISOString(),
        },
        _social_urls:
          Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        _contact_raw: {
          nip: foundNip || null,
          email: email || null,
          phone: phone || null,
        },
      },
      status: 'crawled',
    };
  } catch (err) {
    return {
      ...entity,
      status: 'failed',
      errors: [
        ...entity.errors,
        `Crawl error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
