import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { getScans, getBrands } from '@/lib/db/store';

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** POST /api/chat — natural language query over extracted data */
export async function POST(req: NextRequest) {
  const { question } = (await req.json()) as { question: string };

  if (!question) {
    return NextResponse.json({ error: 'Provide a question' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  // Gather all entities from completed scans, deduplicated by URL (newest first)
  const scans = getScans();
  const seen = new Set<string>();
  const entities = scans
    .filter((s) => s.status === 'completed')
    .reverse()
    .flatMap((s) =>
      s.entities
        .filter((e) => e.status !== 'failed')
        .map((e) => ({
          name: e.name,
          url: e.url,
          domain: e.domain,
          nip: e.nip,
          krs: e.krs,
          ...e.data,
          financials: e.financials,
        }))
    )
    .filter((e) => {
      const key = e.url || e.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Fallback: if no scan results, read enriched brands from brands.json
  if (entities.length === 0) {
    const brands = getBrands();
    brands
      .filter((b) => b.data && Object.keys(b.data as Record<string, unknown>).length > 0)
      .forEach((b) => {
        entities.push({
          name: b.name,
          url: b.url,
          domain: b.domain,
          nip: b.nip,
          krs: b.krs,
          ...(b.data as Record<string, unknown>),
          financials: b.financials,
        } as typeof entities[0]);
      });
  }

  if (entities.length === 0) {
    return NextResponse.json({
      answer: 'Brak danych. Najpierw uruchom skan aby zebrać dane o firmach.',
    });
  }

  // Remove internal metadata from entities for cleaner context
  const cleanEntities = entities.map((e) => {
    const clean = { ...e };
    delete (clean as Record<string, unknown>)._meta;
    delete (clean as Record<string, unknown>)._extraction;
    delete (clean as Record<string, unknown>)._finance;
    return clean;
  });

  const systemPrompt = `Jesteś analitykiem rynku cateringów dietetycznych w Polsce.
Masz dostęp do bazy danych ${cleanEntities.length} firm z branży.
Odpowiadaj po polsku, konkretnie, z danymi.
Jeśli pytanie dotyczy porównania — użyj tabelki.
Jeśli pytanie wymaga danych których nie masz — powiedz wprost czego brakuje.
Dane mogą być niekompletne — zaznacz to w odpowiedzi.`;

  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Dane firm:\n\n${JSON.stringify(cleanEntities, null, 2)}\n\nPytanie: ${question}`,
      },
    ],
  };

  const inputFile = `/tmp/chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  let raw: string;
  try {
    raw = execSync(
      `curl -s -m 120 https://api.anthropic.com/v1/messages -H ${shellEscape('x-api-key: ' + apiKey)} -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' -d @${inputFile}`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 130000 }
    ).toString('utf-8');
  } catch (err) {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return NextResponse.json({ error: `API request failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  try { unlinkSync(inputFile); } catch { /* ignore */ }

  let response: Record<string, unknown>;
  try {
    response = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: `Invalid API response: ${raw.slice(0, 200)}` }, { status: 500 });
  }

  if (response.error) {
    return NextResponse.json({ error: `API error: ${JSON.stringify(response.error)}` }, { status: 500 });
  }

  const content = response.content as Array<{ type: string; text: string }> | undefined;
  const answer = content && content.length > 0 && content[0].type === 'text'
    ? content[0].text
    : '';

  const usage = response.usage as { input_tokens: number; output_tokens: number } | undefined;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cost = (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;

  return NextResponse.json({
    answer,
    meta: {
      model: 'claude-sonnet-4-6',
      inputTokens,
      outputTokens,
      costUsd: Math.round(cost * 10000) / 10000,
      entitiesInContext: cleanEntities.length,
    },
  });
}
