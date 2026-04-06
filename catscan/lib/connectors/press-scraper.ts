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
// wirtualnemedia.pl — tag page scraper (dynamic discovery per brand)
// ---------------------------------------------------------------------------

/**
 * Scrape wirtualnemedia.pl /tags/BrandName page for article links.
 * URL pattern: https://www.wirtualnemedia.pl/tags/BrandName
 * Article links: both /artykul/slug and /slug,numericIDa patterns.
 */
export function scrapeWirtualnemediaTagPage(brandName: string): NmArticleLink[] {
  // Capitalize first letter of each word for tag URL
  const tagName = brandName
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('+');

  const url = `https://www.wirtualnemedia.pl/tags/${encodeURIComponent(tagName)}`;
  const html = fetchHtml(url);
  if (!html) return [];

  const articles: NmArticleLink[] = [];
  const seen = new Set<string>();

  // Pattern 1: /artykul/slug links
  const artykulPattern = /<a[^>]+href="(\/artykul\/[^"]+)"[^>]*>/g;
  let match;
  while ((match = artykulPattern.exec(html)) !== null) {
    const articleUrl = `https://www.wirtualnemedia.pl${match[1]}`;
    if (seen.has(articleUrl)) continue;
    seen.add(articleUrl);

    // Try to find title near the link
    const nearbyText = html.slice(match.index, match.index + 500);
    const titleMatch = nearbyText.match(/>([^<]{15,})</);
    articles.push({
      url: articleUrl,
      title: titleMatch ? titleMatch[1].trim() : match[1].replace('/artykul/', '').replace(/-/g, ' '),
    });
  }

  // Pattern 2: /slug,numericIDa links (sponsored/press content)
  const numericPattern = /<a[^>]+href="(\/[^"]+,\d{10,}a)"[^>]*>/g;
  while ((match = numericPattern.exec(html)) !== null) {
    const articleUrl = `https://www.wirtualnemedia.pl${match[1]}`;
    if (seen.has(articleUrl)) continue;
    seen.add(articleUrl);

    const nearbyText = html.slice(match.index, match.index + 500);
    const titleMatch = nearbyText.match(/>([^<]{15,})</);
    articles.push({
      url: articleUrl,
      title: titleMatch ? titleMatch[1].trim() : match[1].slice(1).split(',')[0].replace(/-/g, ' '),
    });
  }

  return articles;
}

// ---------------------------------------------------------------------------
// Known seed URLs (supplementary to tag page discovery)
// ---------------------------------------------------------------------------

/**
 * Curated seed URLs of articles known to contain brand-influencer partnerships.
 * Supplements dynamic tag page scraping.
 */
export const SEED_ARTICLE_URLS: Array<{ url: string; source: 'nowymarketing' | 'wirtualnemedia' }> = [
  // wirtualnemedia — confirmed partnership articles (may not appear in tag pages)
  { url: 'https://www.wirtualnemedia.pl/artykul/olive-media-odpowiada-za-influencer-marketing-tim-catering', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/supermenu-anna-lewandowska-cena-opinie-jedz-super-poczuj-sie-super', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/magda-gessler-kuba-wojewodzki-reklama-body-chief-opinie-co-to-jest', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/michel-moran-lightbox-catering-dietetyczny', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/joanna-jedrzejczyk-poleca-catering-dietetyczny-republiki-smakoszy', source: 'wirtualnemedia' },
  { url: 'https://www.wirtualnemedia.pl/artykul/pomelo-catering-partnerem-kts-weszlo-i-projektu-warszawa', source: 'wirtualnemedia' },

  // nowymarketing — brand-specific partnership articles (not always in tag page)
  { url: 'https://nowymarketing.pl/kuchnia-vikinga-x-sfd-tak-silnej-wspolpracy-jeszcze-nie-bylo/', source: 'nowymarketing' },
];

// ---------------------------------------------------------------------------
// Collect all articles for processing
// ---------------------------------------------------------------------------

// Major brands to search on wirtualnemedia tag pages
// (brands most likely to have press coverage about partnerships)
const WM_TAG_BRANDS = [
  'Maczfit', 'SuperMenu', 'Kuchnia Vikinga', 'Body Chief', 'LightBox',
  'Nice To Fit You', 'NTFY', 'Be Diet Catering', 'Dietly',
  'Tim Catering', 'Pomelo', 'Republika Smakoszy', 'Wygodna Dieta',
];

/**
 * Gather all press articles from both sources:
 *   1. Scrape nowymarketing tag pages (dynamic discovery)
 *   2. Scrape wirtualnemedia tag pages per major brand (dynamic discovery)
 *   3. Fetch seed article URLs (curated list, fills gaps)
 *   4. Deduplicate
 */
export function collectAllArticles(): PressArticle[] {
  const articles: PressArticle[] = [];
  const seen = new Set<string>();

  const fetchAndAdd = (url: string, source: 'nowymarketing' | 'wirtualnemedia') => {
    if (seen.has(url)) return;
    seen.add(url);

    const fetcher = source === 'nowymarketing'
      ? fetchNowymarketingArticle
      : fetchWirtualnemediaArticle;

    const article = fetcher(url);
    if (article) articles.push(article);

    // Rate limit — be polite
    try { execSync('sleep 1'); } catch { /* ignore */ }
  };

  // 1. nowymarketing tag pages — dynamic discovery
  const nmLinks = scrapeNowymarketingTagPages(3);
  for (const link of nmLinks) {
    fetchAndAdd(link.url, 'nowymarketing');
  }

  // 2. wirtualnemedia tag pages — per major brand
  for (const brand of WM_TAG_BRANDS) {
    const wmLinks = scrapeWirtualnemediaTagPage(brand);
    for (const link of wmLinks) {
      fetchAndAdd(link.url, 'wirtualnemedia');
    }
    try { execSync('sleep 1'); } catch { /* ignore */ }
  }

  // 3. Seed URLs — fill gaps (known articles not in tag pages)
  for (const seed of SEED_ARTICLE_URLS) {
    fetchAndAdd(seed.url, seed.source);
  }

  return articles;
}
