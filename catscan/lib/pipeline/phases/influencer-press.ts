/**
 * Phase: Influencer Press — scrape Polish marketing trade portals for
 * brand partnership announcements (ambassadors, campaign faces, collaborations).
 *
 * Pipeline position: after context (needs brand names), before interpret.
 * Unlike other phases, this runs ONCE per scan (like interpret), not per-entity.
 * It scrapes articles first, then maps extracted partnerships to entities.
 *
 * Sources:
 *   - nowymarketing.pl/tag/catering-dietetyczny/ (paginated tag pages)
 *   - wirtualnemedia.pl (curated seed URLs, extensible)
 *
 * Flow:
 *   1. Scrape all articles from both sources
 *   2. For each article → Claude Haiku → extract brand↔person pairs
 *   3. Match extracted brands to scan entities by name similarity
 *   4. Merge partnerships into entity.data.influencer_press
 *
 * Requires: ANTHROPIC_API_KEY
 * External: curl (for HTML fetching)
 * Cost: ~$0.005/article × ~30 articles = ~$0.15 per scan
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { EntityRecord, ScanRecord } from '@/lib/db/store';
import {
  collectAllArticles,
  type PressArticle,
} from '@/lib/connectors/press-scraper';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Partnership {
  person: string;
  role: 'ambasador' | 'twarz-kampanii' | 'wspolpraca' | 'recenzent' | 'celebrity-endorsement';
  brand: string;
  agency: string | null;
  campaign: string | null;
  date: string | null;
  sourceUrl: string;
  sourcePortal: 'nowymarketing' | 'wirtualnemedia';
}

export interface InfluencerPressData {
  partnerships: Partnership[];
  total_articles_scraped: number;
  total_partnerships_found: number;
  sources: string[];
  cost_usd: number;
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Claude Haiku — extract partnerships from article text
// ---------------------------------------------------------------------------

const TMP_DIR = '/tmp/catscan-video'; // reuse existing tmp dir

const EXTRACTION_PROMPT = `Przeanalizuj ten artykuł z polskiego portalu branżowego. Wyciągnij WSZYSTKIE współprace między osobami (celebryci, sportowcy, influencerzy, ambasadorzy, twórcy) a markami cateringów dietetycznych.

Szukaj konkretnych wzorców:
- "[osoba] ambasadorem/twarzą marki [brand]"
- "[osoba] w kampanii [brand]"
- "[brand] we współpracy z [osoba]"
- "[osoba] promuje [brand]"
- Agencja obsługująca kampanię

Zwróć TYLKO JSON array. Jeśli brak współprac — zwróć [].

[
  {
    "person": "imię i nazwisko osoby",
    "role": "ambasador | twarz-kampanii | wspolpraca | recenzent | celebrity-endorsement",
    "brand": "nazwa marki cateringu",
    "agency": "nazwa agencji lub null",
    "campaign": "nazwa/hasło kampanii lub null"
  }
]

Respond with ONLY the JSON array. No commentary.`;

function extractPartnershipsFromArticle(
  article: PressArticle,
  apiKey: string,
): Partnership[] {
  try {
    execSync(`mkdir -p ${TMP_DIR}`);

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\n---\nŹródło: ${article.source} (${article.date || 'brak daty'})\nTytuł: ${article.title}\n\nTreść:\n${article.bodyText}`,
      }],
    });

    const tmpBody = join(TMP_DIR, `press-${randomUUID()}.json`);
    writeFileSync(tmpBody, body);

    const result = execSync(
      `curl -s -X POST https://api.anthropic.com/v1/messages ` +
      `-H "Content-Type: application/json" ` +
      `-H "x-api-key: ${apiKey}" ` +
      `-H "anthropic-version: 2023-06-01" ` +
      `-d @${tmpBody}`,
      { timeout: 30000 }
    ).toString();

    try { if (existsSync(tmpBody)) unlinkSync(tmpBody); } catch { /* */ }

    const parsed = JSON.parse(result);
    const text = parsed?.content?.[0]?.text || '';

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const raw = JSON.parse(jsonMatch[0]) as Array<{
      person: string;
      role: string;
      brand: string;
      agency: string | null;
      campaign: string | null;
    }>;

    return raw.map(r => ({
      person: r.person,
      role: r.role as Partnership['role'],
      brand: r.brand,
      agency: r.agency || null,
      campaign: r.campaign || null,
      date: article.date,
      sourceUrl: article.url,
      sourcePortal: article.source,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Brand name matching — fuzzy match extracted brand → entity
// ---------------------------------------------------------------------------

function normalizeBrandName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.pl$/i, '')
    .replace(/\s*catering\s*/i, ' ')
    .replace(/\s*dietetyczny\s*/i, ' ')
    .replace(/[^a-ząćęłńóśźż0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchBrandToEntity(
  brand: string,
  entities: EntityRecord[],
): EntityRecord | null {
  const normalizedBrand = normalizeBrandName(brand);
  if (!normalizedBrand) return null;

  // Exact match first
  for (const entity of entities) {
    if (normalizeBrandName(entity.name) === normalizedBrand) return entity;
  }

  // Substring match: brand name contained in entity name or vice versa
  for (const entity of entities) {
    const normalizedEntity = normalizeBrandName(entity.name);
    if (normalizedEntity.includes(normalizedBrand) || normalizedBrand.includes(normalizedEntity)) {
      return entity;
    }
  }

  // Try matching against domain
  for (const entity of entities) {
    const domain = (entity.domain || entity.url || '')
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\.pl\/?$/, '')
      .toLowerCase();

    if (domain && (normalizedBrand.includes(domain) || domain.includes(normalizedBrand))) {
      return entity;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main phase function — runs ONCE per scan, maps to entities
// ---------------------------------------------------------------------------

export async function enrichInfluencerPress(
  scan: ScanRecord,
): Promise<{ totalArticles: number; totalPartnerships: number; costUsd: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { totalArticles: 0, totalPartnerships: 0, costUsd: 0 };
  }

  // 1. Collect all articles from both sources
  const articles = collectAllArticles();

  if (articles.length === 0) {
    return { totalArticles: 0, totalPartnerships: 0, costUsd: 0 };
  }

  // 2. Extract partnerships from each article via Haiku
  const allPartnerships: Partnership[] = [];
  let totalCost = 0;

  for (const article of articles) {
    const partnerships = extractPartnershipsFromArticle(article, apiKey);
    allPartnerships.push(...partnerships);
    // Haiku: ~$0.005 per article
    totalCost += 0.005;
  }

  // 3. Map partnerships to entities
  const entityPartnerships = new Map<string, Partnership[]>();

  for (const partnership of allPartnerships) {
    const entity = matchBrandToEntity(partnership.brand, scan.entities);
    if (!entity) continue;

    const existing = entityPartnerships.get(entity.id) || [];
    // Deduplicate: same person + same brand + same role
    const isDuplicate = existing.some(
      p => p.person === partnership.person && p.role === partnership.role
    );
    if (!isDuplicate) {
      existing.push(partnership);
      entityPartnerships.set(entity.id, existing);
    }
  }

  // 4. Merge into entity.data
  let mappedCount = 0;
  for (const entity of scan.entities) {
    const partnerships = entityPartnerships.get(entity.id);
    if (!partnerships || partnerships.length === 0) continue;

    mappedCount += partnerships.length;

    const pressData: InfluencerPressData = {
      partnerships,
      total_articles_scraped: articles.length,
      total_partnerships_found: partnerships.length,
      sources: Array.from(new Set(partnerships.map(p => p.sourcePortal))),
      cost_usd: 0, // cost tracked at scan level
      analyzed_at: new Date().toISOString(),
    };

    entity.data = {
      ...entity.data,
      influencer_press: pressData,
    };
  }

  return {
    totalArticles: articles.length,
    totalPartnerships: mappedCount,
    costUsd: totalCost,
  };
}
