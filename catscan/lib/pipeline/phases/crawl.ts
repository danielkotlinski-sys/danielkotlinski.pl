/** Phase: Crawl — fetch website HTML for each entity */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 15 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' -H 'Accept: text/html' -H 'Accept-Language: pl,en;q=0.9' '${url}'`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

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

export async function crawlEntity(entity: EntityRecord): Promise<EntityRecord> {
  const url = entity.url.startsWith('http') ? entity.url : `https://${entity.url}`;

  try {
    const html = curlFetch(url);

    if (!html || html.length < 100) {
      return {
        ...entity,
        status: 'failed',
        errors: [...entity.errors, `Empty or failed response from ${url}`],
      };
    }

    const textContent = stripHtml(html);

    // Extract meta tags
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);

    // Extract ALL links from raw HTML
    const allLinks: string[] = [];
    const socialLinks: Record<string, string> = {};
    let linkMatch: RegExpExecArray | null;
    const linkRegex = /<a[^>]+href=["'](.*?)["']/gi;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      allLinks.push(href);

      // Capture social media links
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

    // Internal links for subpage crawling
    const internalLinks = allLinks.filter(l => l.startsWith('/') || l.startsWith(url)).slice(0, 20);

    // Find valuable subpages
    const valuablePages = internalLinks.filter(l => {
      const lower = l.toLowerCase();
      return /cen|pric|menu|diet|ofert|about|o-nas|kontakt|contact|jak-to|how|faq|dostaw|deliver/.test(lower);
    });

    // Crawl up to 3 valuable subpages
    let subpageTexts = '';
    for (const subpage of valuablePages.slice(0, 3)) {
      try {
        const subUrl = subpage.startsWith('http') ? subpage : new URL(subpage, url).href;
        const subHtml = curlFetch(subUrl);
        if (subHtml) {
          const subText = stripHtml(subHtml);
          subpageTexts += `\n\n--- PAGE: ${subUrl} ---\n${subText.slice(0, 5000)}`;
        }
      } catch {
        // skip failed subpages
      }
    }

    // Try to find NIP in raw HTML
    const nipRegex = /(?:NIP|nip)[:\s]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/g;
    let nipMatch: RegExpExecArray | null;
    let foundNip: string | undefined;
    while ((nipMatch = nipRegex.exec(html)) !== null) {
      const cleaned = nipMatch[1].replace(/[-\s]/g, '');
      if (cleaned.length === 10) {
        foundNip = cleaned;
        break;
      }
    }
    // Also check subpage content for NIP
    if (!foundNip) {
      const subNipMatch = subpageTexts.match(/(?:NIP|nip)[:\s]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/);
      if (subNipMatch) {
        foundNip = subNipMatch[1].replace(/[-\s]/g, '');
      }
    }

    // Also extract email and phone from raw HTML
    const emailMatch = html.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
    const phoneMatch = html.match(/(?:\+48|48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}/);

    // Truncate for LLM context
    const fullText = textContent.slice(0, 15000) + subpageTexts.slice(0, 10000);

    return {
      ...entity,
      rawHtml: fullText,
      nip: foundNip || entity.nip,
      domain: new URL(url).hostname,
      data: {
        ...entity.data,
        _meta: {
          title: titleMatch?.[1]?.trim() || '',
          description: descMatch?.[1]?.trim() || '',
          ogImage: ogImageMatch?.[1]?.trim() || '',
          crawledUrl: url,
          subpagesCrawled: valuablePages.slice(0, 3).length,
          contentLength: fullText.length,
          crawledAt: new Date().toISOString(),
        },
        _social_urls: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        _contact_raw: {
          nip: foundNip || null,
          email: emailMatch?.[0] || null,
          phone: phoneMatch?.[0]?.trim() || null,
        },
      },
      status: 'crawled',
    };
  } catch (err) {
    return {
      ...entity,
      status: 'failed',
      errors: [...entity.errors, `Crawl error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
