/**
 * Phase: Context — Perplexity AI for market intelligence per brand.
 *
 * Two-pass approach:
 *   Pass 1: Core business data (NIP, legal name, founder, year, status)
 *   Pass 2: Media intelligence (articles, influencers, awards, competitive position)
 *
 * Uses Perplexity sonar model (~$0.005/query x 2 = ~$0.01/entity).
 * Requires PERPLEXITY_API_KEY.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

interface ContextData {
  nip: string | null;
  legalName: string | null;
  founder: string | null;
  foundedYear: number | null;
  legalOwner: string | null;
  employeeRange: string | null;
  mediaArticles: string[];
  influencers: string[];
  uniqueFeatures: string[];
  currentStatus: string | null;
  recentNews: string[];
  competitivePosition: string | null;
  trajectory: 'growing' | 'stable' | 'declining' | 'new-entrant' | 'exiting' | 'unknown';
  awards: string[];
  b2bOffering: boolean;
  uniqueInsight: string | null;
  fetchedAt: string;
}

const PASS1_PROMPT = (brandName: string, domain: string | undefined) => `
Potrzebuję informacji biznesowych o firmie: ${brandName}${domain ? ` (strona: ${domain})` : ''}.
To jest firma z branży catering dietetyczny / dieta pudełkowa w Polsce.

ZADANIE: Wyszukaj i podaj następujące dane. Szukaj w KRS, CEIDG, rejestr.io, BIP, stronie firmy, LinkedIn.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown, bez komentarzy, bez tekstu poza JSON):
{
  "nip": "10-cyfrowy NIP (bez myślników) — szukaj w stopce strony, regulaminie, polityce prywatności, KRS, CEIDG",
  "legalName": "pełna nazwa prawna firmy z KRS/CEIDG (np. 'MACZFIT FOODS SP. Z O.O.')",
  "founder": "imię i nazwisko założyciela — szukaj w KRS (wspólnicy), LinkedIn, artykułach",
  "foundedYear": 2020,
  "legalOwner": "obecny właściciel jeśli zmienił się od założenia (np. przejęcie) lub null",
  "employeeRange": "zakres pracowników: '1-10', '11-50', '51-200', '200+' — szukaj w GUS, LinkedIn, artykułach",
  "currentStatus": "1 zdanie o aktualnej sytuacji firmy w 2024/2025",
  "trajectory": "growing|stable|declining|new-entrant|exiting|unknown",
  "b2bOffering": true,
  "uniqueFeatures": ["3-5 cech wyróżniających tę firmę na tle konkurencji w branży diet pudełkowych"]
}
`.trim();

const PASS2_PROMPT = (brandName: string, domain: string | undefined) => `
${brandName}${domain ? ` (${domain})` : ''} — catering dietetyczny, Polska.

ZADANIE: Znajdź informacje medialne i konkurencyjne o tej marce. Szukaj w Google News, branżowych portalach (Wirtualne Media, Marketing przy Kawie, Puls Biznesu, Forbes Polska, money.pl), YouTube, Instagram.

Odpowiedz WYŁĄCZNIE poprawnym JSON:
{
  "mediaArticles": ["do 5 URL artykułów z mediów o tej firmie — tylko prawdziwe URL, nie wymyślaj"],
  "influencers": ["imiona/nazwy influencerów którzy promowali tę markę na IG/YT/TikTok"],
  "awards": ["nagrody, wyróżnienia, rankingi w których firma się pojawiła"],
  "recentNews": ["do 3 najnowsze informacje/wydarzenia z 2024-2025"],
  "competitivePosition": "1 zdanie: jak ta firma pozycjonuje się na rynku diet pudełkowych vs konkurencja",
  "uniqueInsight": "1 zdanie: co jest najciekawsze/najważniejsze o tej firmie z perspektywy analityka rynku"
}

WAŻNE: Podaj TYLKO informacje które naprawdę znalazłeś. Dla pól gdzie nie masz danych wstaw [] lub null. NIE wymyślaj URL-i.
`.trim();

function callPerplexity(prompt: string, apiKey: string): Record<string, unknown> | null {
  const requestBody = {
    model: 'sonar',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  };

  const inputFile = `/tmp/pplx_ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  try {
    const raw = execSync(
      `curl -s -m 60 'https://api.perplexity.ai/chat/completions' -H "Authorization: Bearer ${apiKey}" -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 70000 }
    ).toString('utf-8');

    try { unlinkSync(inputFile); } catch { /* ignore */ }

    const response = JSON.parse(raw);
    if (response.error) {
      console.warn(`[context] Perplexity error:`, response.error);
      return null;
    }

    const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];

    return JSON.parse(jsonStr.trim());
  } catch (err) {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    console.warn(`[context] Perplexity call failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function enrichContext(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('[context] PERPLEXITY_API_KEY not set — skipping');
    return entity;
  }

  // Pass 1: Core business data
  const pass1 = callPerplexity(PASS1_PROMPT(entity.name, entity.domain), apiKey);

  // Pass 2: Media intelligence
  const pass2 = callPerplexity(PASS2_PROMPT(entity.name, entity.domain), apiKey);

  if (!pass1 && !pass2) {
    return entity;
  }

  const p1 = pass1 || {};
  const p2 = pass2 || {};

  // Clean NIP
  let parsedNip: string | null = null;
  if (p1.nip) {
    const cleaned = String(p1.nip).replace(/[-\s]/g, '');
    if (/^\d{10}$/.test(cleaned)) parsedNip = cleaned;
  }

  const contextData: ContextData = {
    nip: parsedNip,
    legalName: (p1.legalName as string) || null,
    founder: (p1.founder as string) || null,
    foundedYear: typeof p1.foundedYear === 'number' ? p1.foundedYear : null,
    legalOwner: (p1.legalOwner as string) || null,
    employeeRange: (p1.employeeRange as string) || null,
    mediaArticles: Array.isArray(p2.mediaArticles) ? p2.mediaArticles.filter((a: unknown) => typeof a === 'string' && a.startsWith('http')).slice(0, 5) : [],
    influencers: Array.isArray(p2.influencers) ? p2.influencers.slice(0, 10) : [],
    uniqueFeatures: Array.isArray(p1.uniqueFeatures) ? p1.uniqueFeatures.slice(0, 5) : [],
    currentStatus: (p1.currentStatus as string) || null,
    recentNews: Array.isArray(p2.recentNews) ? p2.recentNews.slice(0, 3) : [],
    competitivePosition: (p2.competitivePosition as string) || null,
    trajectory: ['growing', 'stable', 'declining', 'new-entrant', 'exiting'].includes(p1.trajectory as string)
      ? (p1.trajectory as ContextData['trajectory']) : 'unknown',
    awards: Array.isArray(p2.awards) ? p2.awards : [],
    b2bOffering: !!p1.b2bOffering,
    uniqueInsight: (p2.uniqueInsight as string) || null,
    fetchedAt: new Date().toISOString(),
  };

  // Backfill NIP on entity if discovery didn't find it but Perplexity did
  const updatedNip = (!entity.nip && contextData.nip) ? contextData.nip : entity.nip;

  return {
    ...entity,
    nip: updatedNip,
    data: {
      ...entity.data,
      context: contextData,
    },
  };
}
