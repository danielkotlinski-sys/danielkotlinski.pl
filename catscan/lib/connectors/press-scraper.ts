/**
 * Press scraper connector — fetches marketing/PR articles from Polish trade portals
 * that mention diet catering brand partnerships and ambassadorships.
 *
 * Sources:
 *   1. nowymarketing.pl — tag pages + brand-specific pages (direct scrape)
 *   2. wirtualnemedia.pl — article pages (URLs found via Google/seed list)
 *
 * Strategy: scrape article text → Claude Haiku extracts brand↔person pairs.
 * No API key needed — public HTML pages fetched via curl.
 */

import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PressArticle {
  url: string;
  title: string;
  source: 'nowymarketing' | 'wirtualnemedia';
  date: string | null;
  bodyText: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchHtml(url: string, timeout = 15000): string | null {
  try {
    return execSync(
      `curl -sL --max-time ${Math.floor(timeout / 1000)} ` +
      `-H "User-Agent: Mozilla/5.0 (compatible; CatscanBot/1.0)" ` +
      `"${url}"`,
      { timeout: timeout + 5000 }
    ).toString();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// nowymarketing.pl — tag page scraper
// ---------------------------------------------------------------------------

interface NmArticleLink {
  url: string;
  title: string;
}

/**
 * Scrape nowymarketing.pl tag page for article links.
 * Tag page URL: https://nowymarketing.pl/tag/catering-dietetyczny/page/N/
 */
export function scrapeNowymarketingTagPages(maxPages = 3): NmArticleLink[] {
  const articles: NmArticleLink[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1
      ? 'https://nowymarketing.pl/tag/catering-dietetyczny/'
      : `https://nowymarketing.pl/tag/catering-dietetyczny/page/${page}/`;

    const html = fetchHtml(url);
    if (!html) break;

    // Extract article links — nowymarketing uses <a> with href to article slugs
    // Pattern: href="/slug-of-article/" with article titles
    const linkPattern = /<a[^>]+href="(https:\/\/nowymarketing\.pl\/[^"]+\/)"[^>]*>([^<]+)<\/a>/g;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const articleUrl = match[1];
      const title = match[2].trim();

      // Skip non-article links (tags, pages, categories)
      if (articleUrl.includes('/tag/') || articleUrl.includes('/page/') ||
          articleUrl.includes('/kategoria/') || articleUrl.includes('/autor/') ||
          articleUrl.includes('/t/')) continue;

      // Skip very short titles (navigation items)
      if (title.length < 15) continue;

      if (!seen.has(articleUrl)) {
        seen.add(articleUrl);
        articles.push({ url: articleUrl, title });
      }
    }

    // Also try relative URLs
    const relPattern = /<a[^>]+href="\/([\w-]+\/)"[^>]*>([^<]{15,})<\/a>/g;
    while ((match = relPattern.exec(html)) !== null) {
      const slug = match[1];
      const title = match[2].trim();

      // Skip known non-article patterns
      if (['tag/', 'page/', 'kategoria/', 'autor/', 't/'].some(p => slug.startsWith(p))) continue;

      const articleUrl = `https://nowymarketing.pl/${slug}`;
      if (!seen.has(articleUrl)) {
        seen.add(articleUrl);
        articles.push({ url: articleUrl, title });
      }
    }
  }

  return articles;
}

/**
 * Fetch and extract article body text from a nowymarketing.pl article.
 */
export function fetchNowymarketingArticle(url: string): PressArticle | null {
  const html = fetchHtml(url);
  if (!html) return null;

  // Extract title from <title> or og:title
  let title = '';
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  if (ogTitle) title = ogTitle[1];
  else {
    const titleTag = html.match(/<title>([^<]+)<\/title>/);
    if (titleTag) title = titleTag[1];
  }

  // Extract date from JSON-LD or meta
  let date: string | null = null;
  const dateMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (dateMatch) date = dateMatch[1];
  else {
    const metaDate = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/);
    if (metaDate) date = metaDate[1];
  }

  // Extract article body — try common article containers
  let bodyHtml = '';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (articleMatch) {
    bodyHtml = articleMatch[1];
  } else {
    // Fallback: extract all <p> content
    const paragraphs: string[] = [];
    const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pMatch;
    while ((pMatch = pPattern.exec(html)) !== null) {
      const text = stripHtml(pMatch[1]).trim();
      if (text.length > 30) paragraphs.push(text);
    }
    bodyHtml = paragraphs.join('\n\n');
  }

  const bodyText = bodyHtml ? stripHtml(bodyHtml) : '';

  if (!bodyText || bodyText.length < 100) return null;

  return {
    url,
    title: title.replace(/\s*[-–|]\s*NowyMarketing.*$/i, '').trim(),
    source: 'nowymarketing',
    date,
    bodyText: bodyText.slice(0, 5000), // cap at 5k chars for LLM
  };
}

// ---------------------------------------------------------------------------
// wirtualnemedia.pl — article scraper
// ---------------------------------------------------------------------------

/**
 * Fetch and extract article body text from a wirtualnemedia.pl article.
 */
export function fetchWirtualnemediaArticle(url: string): PressArticle | null {
  const html = fetchHtml(url);
  if (!html) return null;

  let title = '';
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  if (ogTitle) title = ogTitle[1];
  else {
    const titleTag = html.match(/<title>([^<]+)<\/title>/);
    if (titleTag) title = titleTag[1];
  }

  let date: string | null = null;
  const dateMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (dateMatch) date = dateMatch[1];

  // wirtualnemedia article body
  let bodyHtml = '';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (articleMatch) {
    bodyHtml = articleMatch[1];
  } else {
    const paragraphs: string[] = [];
    const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pMatch;
    while ((pMatch = pPattern.exec(html)) !== null) {
      const text = stripHtml(pMatch[1]).trim();
      if (text.length > 30) paragraphs.push(text);
    }
    bodyHtml = paragraphs.join('\n\n');
  }

  const bodyText = bodyHtml ? stripHtml(bodyHtml) : '';
  if (!bodyText || bodyText.length < 100) return null;

  return {
    url,
    title: title.replace(/\s*[-–|]\s*Wirtualne Media.*$/i, '').trim(),
    source: 'wirtualnemedia',
    date,
    bodyText: bodyText.slice(0, 5000),
  };
}

// ---------------------------------------------------------------------------
// Known article URLs — seed list for wirtualnemedia (no tag pages available)
// + any additional nowymarketing articles about specific brands
// ---------------------------------------------------------------------------

/**
 * Curated seed URLs of articles known to contain brand-influencer partnerships.
 * This list can be extended over time. wirtualnemedia has no public tag pages,
 * so we maintain a seed list of relevant article URLs.
 */
export const SEED_ARTICLE_URLS: Array<{ url: string; source: 'nowymarketing' | 'wirtualnemedia' }> = [
  // wirtualnemedia — confirmed partnership articles
  { url: 'https://www.wirtualnemedia.pl/artykul/olive-media-odpowiada-za-influencer-marketing-tim-catering', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/supermenu-anna-lewandowska-cena-opinie-jedz-super-poczuj-sie-super', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/magda-gessler-kuba-wojewodzki-reklama-body-chief-opinie-co-to-jest', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/michel-moran-lightbox-catering-dietetyczny', source: 'wirtualnemedia' },

  // nowymarketing — brand-specific partnership articles (not always in tag page)
  { url: 'https://nowymarketing.pl/kuchnia-vikinga-x-sfd-tak-silnej-wspolpracy-jeszcze-nie-bylo/', source: 'nowymarketing' },
];

// ---------------------------------------------------------------------------
// Collect all articles for processing
// ---------------------------------------------------------------------------

/**
 * Gather all press articles from both sources:
 *   1. Scrape nowymarketing tag pages (dynamic discovery)
 *   2. Fetch seed article URLs (curated list)
 *   3. Deduplicate
 */
export function collectAllArticles(): PressArticle[] {
  const articles: PressArticle[] = [];
  const seen = new Set<string>();

  // 1. nowymarketing tag pages — dynamic discovery
  const nmLinks = scrapeNowymarketingTagPages(3);

  for (const link of nmLinks) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);

    const article = fetchNowymarketingArticle(link.url);
    if (article) articles.push(article);

    // Rate limit — be polite
    try { execSync('sleep 1'); } catch { /* ignore */ }
  }

  // 2. Seed URLs (wirtualnemedia + extras)
  for (const seed of SEED_ARTICLE_URLS) {
    if (seen.has(seed.url)) continue;
    seen.add(seed.url);

    const fetcher = seed.source === 'nowymarketing'
      ? fetchNowymarketingArticle
      : fetchWirtualnemediaArticle;

    const article = fetcher(seed.url);
    if (article) articles.push(article);

    try { execSync('sleep 1'); } catch { /* ignore */ }
  }

  return articles;
}
