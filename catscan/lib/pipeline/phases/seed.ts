/**
 * Phase: Seed — crawl Dietly.pl catalog to extract company list.
 * Dietly lists ~500 diet catering brands in Poland with basic info.
 *
 * Each company gets: name, URL, city, price range from catalog page.
 * The seed phase creates initial EntityRecord[] for the pipeline.
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { EntityRecord } from '@/lib/db/store';

const DIETLY_BASE = 'https://dietly.pl';
const DIETLY_CATALOG = `${DIETLY_BASE}/catering`;

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 20 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' '${url}'`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 25000 }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

interface DietlyEntry {
  name: string;
  url: string;
  city: string;
  priceFrom: string;
  dietlySlug: string;
}

function parseDietlyPage(html: string): DietlyEntry[] {
  const entries: DietlyEntry[] = [];

  // Dietly lists caterings as cards/links with company info
  // Pattern: links to /catering/[slug] with company name, city, price
  const cardRegex = /<a[^>]+href=["']\/catering\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const slug = match[1];
    const content = match[2];

    // Skip navigation/generic links
    if (slug.includes('?') || slug === '' || slug.startsWith('#')) continue;

    // Extract text content
    const text = content
      .replace(/<[^>]+>/g, '|')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = text.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const name = parts[0];
    // Try to find city and price from remaining parts
    const cityMatch = parts.find(p => /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+$/.test(p));
    const priceMatch = parts.find(p => /\d+.*zł|PLN|\d+.*dzień/i.test(p));

    entries.push({
      name,
      url: `${DIETLY_BASE}/catering/${slug}`,
      city: cityMatch || '',
      priceFrom: priceMatch || '',
      dietlySlug: slug,
    });
  }

  // Deduplicate by slug
  const seen = new Set<string>();
  return entries.filter(e => {
    if (seen.has(e.dietlySlug)) return false;
    seen.add(e.dietlySlug);
    return true;
  });
}

function extractCompanyUrl(detailHtml: string): string | null {
  // On Dietly detail page, find link to the actual company website
  const urlMatch = detailHtml.match(
    /(?:strona|website|www|oficjalna)[^"]*?href=["'](https?:\/\/(?!dietly)[^"']+)["']/i
  ) || detailHtml.match(
    /<a[^>]+href=["'](https?:\/\/(?!dietly\.pl|facebook|instagram|tiktok)[^"']+)["'][^>]*(?:target=["']_blank["']|rel=["']noopener)/i
  );
  return urlMatch ? urlMatch[1] : null;
}

export async function runSeed(maxPages: number = 20): Promise<EntityRecord[]> {
  const allEntries: DietlyEntry[] = [];

  // Crawl paginated catalog
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? DIETLY_CATALOG : `${DIETLY_CATALOG}?page=${page}`;
    const html = curlFetch(url);

    if (!html) break;

    const entries = parseDietlyPage(html);
    if (entries.length === 0) break; // No more pages

    allEntries.push(...entries);

    // Brief pause between pages
    if (page < maxPages) {
      execSync('sleep 1');
    }
  }

  // Deduplicate across pages
  const seen = new Set<string>();
  const unique = allEntries.filter(e => {
    if (seen.has(e.dietlySlug)) return false;
    seen.add(e.dietlySlug);
    return true;
  });

  // For each entry, try to find the actual company website from Dietly detail page
  const entities: EntityRecord[] = [];

  for (const entry of unique) {
    const detailHtml = curlFetch(entry.url);
    let companyUrl = entry.url; // fallback to Dietly page

    if (detailHtml) {
      const extracted = extractCompanyUrl(detailHtml);
      if (extracted) {
        companyUrl = extracted;
      }
    }

    entities.push({
      id: randomUUID(),
      name: entry.name,
      url: companyUrl,
      domain: undefined,
      data: {
        _seed: {
          source: 'dietly.pl',
          dietlyUrl: entry.url,
          dietlySlug: entry.dietlySlug,
          city: entry.city,
          priceFrom: entry.priceFrom,
          seededAt: new Date().toISOString(),
        },
      },
      status: 'pending',
      errors: [],
    });

    // Brief pause
    if (entities.length % 10 === 0) {
      execSync('sleep 1');
    }
  }

  return entities;
}
