/**
 * Phase: Context — Perplexity AI for market intelligence per brand.
 *
 * Extracts: founder, founding year, media mentions, influencers,
 * unique features, market signals, ownership changes, competitive position.
 *
 * Uses Perplexity sonar model (~$0.005/query).
 * Requires PERPLEXITY_API_KEY.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

interface ContextData {
  founder: string | null;
  foundedYear: number | null;
  legalOwner: string | null;
  mediaArticles: string[];
  influencers: string[];
  uniqueFeatures: string[];
  currentStatus: string | null;
  recentNews: string[];
  competitivePosition: string | null;
  trajectory: 'growing' | 'stable' | 'declining' | 'new-entrant' | 'exiting' | 'unknown';
  awards: string[];
  b2bOffering: boolean;
  fetchedAt: string;
}

const PROMPT_TEMPLATE = (brandName: string, domain: string | undefined) => `
${brandName}${domain ? ` (${domain})` : ''} — catering dietetyczny / dieta pudełkowa, Polska.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown, bez komentarzy):
{
  "founder": "imię i nazwisko założyciela lub null",
  "foundedYear": rok założenia (number) lub null,
  "legalOwner": "obecny właściciel/grupa kapitałowa jeśli inna niż założyciel, lub null",
  "mediaArticles": ["max 5 URL artykułów o firmie z mediów"],
  "influencers": ["nazwy influencerów którzy promowali markę"],
  "uniqueFeatures": ["3-5 cech wyróżniających na tle konkurencji"],
  "currentStatus": "1 zdanie o aktualnej sytuacji firmy",
  "recentNews": ["max 3 najnowsze informacje/wydarzenia dotyczące firmy"],
  "competitivePosition": "1 zdanie jak firma pozycjonuje się na rynku",
  "trajectory": "growing|stable|declining|new-entrant|exiting|unknown",
  "awards": ["nagrody, wyróżnienia"],
  "b2bOffering": true/false czy oferuje catering firmowy
}

Jeśli nie znasz odpowiedzi na dane pole, wstaw null lub pustą tablicę. Nie wymyślaj.
`.trim();

export async function enrichContext(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('[context] PERPLEXITY_API_KEY not set — skipping');
    return entity;
  }

  const prompt = PROMPT_TEMPLATE(entity.name, entity.domain);

  const requestBody = {
    model: 'sonar',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  };

  const inputFile = `/tmp/pplx_context_${Date.now()}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  try {
    const raw = execSync(
      `curl -s -m 60 'https://api.perplexity.ai/chat/completions' -H 'Authorization: Bearer ${apiKey}' -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 70000 }
    ).toString('utf-8');

    const response = JSON.parse(raw);

    if (response.error) {
      console.warn(`[context] Perplexity error for "${entity.name}":`, response.error);
      return entity;
    }

    const content = response.choices?.[0]?.message?.content || '';

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    let contextData: ContextData;
    try {
      const parsed = JSON.parse(jsonStr.trim());
      contextData = {
        founder: parsed.founder || null,
        foundedYear: typeof parsed.foundedYear === 'number' ? parsed.foundedYear : null,
        legalOwner: parsed.legalOwner || null,
        mediaArticles: Array.isArray(parsed.mediaArticles) ? parsed.mediaArticles.slice(0, 5) : [],
        influencers: Array.isArray(parsed.influencers) ? parsed.influencers : [],
        uniqueFeatures: Array.isArray(parsed.uniqueFeatures) ? parsed.uniqueFeatures.slice(0, 5) : [],
        currentStatus: parsed.currentStatus || null,
        recentNews: Array.isArray(parsed.recentNews) ? parsed.recentNews.slice(0, 3) : [],
        competitivePosition: parsed.competitivePosition || null,
        trajectory: ['growing', 'stable', 'declining', 'new-entrant', 'exiting'].includes(parsed.trajectory)
          ? parsed.trajectory : 'unknown',
        awards: Array.isArray(parsed.awards) ? parsed.awards : [],
        b2bOffering: !!parsed.b2bOffering,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      console.warn(`[context] Failed to parse JSON for "${entity.name}":`, jsonStr.slice(0, 200));
      return entity;
    }

    return {
      ...entity,
      data: {
        ...entity.data,
        context: contextData,
      },
    };
  } catch (e) {
    console.warn(
      `[context] Failed for "${entity.name}":`,
      e instanceof Error ? e.message : e
    );
    return entity;
  }
}
