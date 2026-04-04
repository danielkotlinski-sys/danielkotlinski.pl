/** Phase: Crawl — fetch website HTML for each entity */

import type { EntityRecord } from '@/lib/db/store';

export async function crawlEntity(entity: EntityRecord): Promise<EntityRecord> {
  const url = entity.url.startsWith('http') ? entity.url : `https://${entity.url}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pl,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        ...entity,
        status: 'failed',
        errors: [...entity.errors, `HTTP ${res.status} from ${url}`],
      };
    }

    const html = await res.text();

    // Extract text content — strip tags, collapse whitespace
    const textContent = html
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

    // Extract meta tags
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);

    // Extract all links for further crawling
    const links: string[] = [];
    let linkMatch: RegExpExecArray | null;
    const linkRegex = /<a[^>]+href=["'](.*?)["']/gi;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      if (href.startsWith('/') || href.startsWith(url)) {
        links.push(href);
      }
      if (links.length >= 20) break;
    }

    // Try to find subpages worth crawling (pricing, menu, about, contact)
    const valuablePages = links.filter(l => {
      const lower = l.toLowerCase();
      return /cen|pric|menu|diet|ofert|about|o-nas|kontakt|contact|jak-to|how|faq|dostaw|deliver/.test(lower);
    });

    // Crawl up to 3 valuable subpages
    let subpageTexts = '';
    for (const subpage of valuablePages.slice(0, 3)) {
      try {
        const subUrl = subpage.startsWith('http') ? subpage : new URL(subpage, url).href;
        const subRes = await fetch(subUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        });
        if (subRes.ok) {
          const subHtml = await subRes.text();
          const subText = subHtml
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          subpageTexts += `\n\n--- PAGE: ${subUrl} ---\n${subText.slice(0, 5000)}`;
        }
      } catch {
        // skip failed subpages
      }
    }

    // Truncate to ~20k chars for LLM context
    const fullText = textContent.slice(0, 15000) + subpageTexts.slice(0, 10000);

    return {
      ...entity,
      rawHtml: fullText,
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
