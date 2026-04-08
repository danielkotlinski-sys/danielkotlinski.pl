/** Phase: Crawl — lightweight curl fetch of website HTML.
 *
 *  No JS rendering — just grab what we can with plain HTTP.
 *  SPA sites will return minimal content, but that's OK:
 *  Perplexity context phase fills the gaps.
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
// curl-based fetcher
// ---------------------------------------------------------------------------

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 15 --max-redirs 5 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' -H 'Accept: text/html' -H 'Accept-Language: pl,en;q=0.9' ${shellEscape(url)}`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 },
    );
    return result.toString('utf-8');
  } catch {
    return null;
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
    const html = curlFetch(url);

    if (!html || html.length < 100) {
      // Don't fail — just mark as crawled with minimal data.
      // Perplexity context phase will fill the gaps.
      return {
        ...entity,
        rawHtml: '',
        domain: (() => { try { return new URL(url).hostname; } catch { return undefined; } })(),
        data: {
          ...entity.data,
          _meta: {
            title: '',
            description: '',
            ogImage: '',
            crawledUrl: url,
            crawlerType: 'curl',
            subpagesCrawled: 0,
            contentLength: 0,
            crawledAt: new Date().toISOString(),
            note: 'Minimal/empty response — relying on Perplexity for content',
          },
        },
        status: 'crawled',
      };
    }

    const textContent = stripHtml(html).slice(0, 15000);
    const meta = extractMeta(html);
    const socialLinks = extractSocialLinks(html);
    const foundNip = extractNip(html) || extractNip(textContent);
    const email = extractEmail(html) || extractEmail(textContent);
    const phone = extractPhone(html) || extractPhone(textContent);

    return {
      ...entity,
      rawHtml: textContent,
      nip: foundNip || entity.nip,
      domain: (() => { try { return new URL(url).hostname; } catch { return undefined; } })(),
      data: {
        ...entity.data,
        _meta: {
          ...meta,
          crawledUrl: url,
          crawlerType: 'curl',
          subpagesCrawled: 0,
          contentLength: textContent.length,
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
    // Don't fail the entity — just mark as crawled with error note
    return {
      ...entity,
      rawHtml: '',
      domain: (() => { try { return new URL(url).hostname; } catch { return undefined; } })(),
      data: {
        ...entity.data,
        _meta: {
          crawledUrl: url,
          crawlerType: 'curl',
          crawledAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        },
      },
      status: 'crawled',
    };
  }
}
