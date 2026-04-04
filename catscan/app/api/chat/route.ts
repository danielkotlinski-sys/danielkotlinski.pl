import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getScans } from '@/lib/db/store';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** POST /api/chat — natural language query over extracted data */
export async function POST(req: NextRequest) {
  const { question } = (await req.json()) as { question: string };

  if (!question) {
    return NextResponse.json({ error: 'Provide a question' }, { status: 400 });
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

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Dane firm:\n\n${JSON.stringify(cleanEntities, null, 2)}\n\nPytanie: ${question}`,
      },
    ],
  });

  const answer = response.content[0].type === 'text' ? response.content[0].text : '';
  const cost =
    (response.usage.input_tokens * 3.0 + response.usage.output_tokens * 15.0) / 1_000_000;

  return NextResponse.json({
    answer,
    meta: {
      model: 'claude-sonnet-4-6',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: Math.round(cost * 10000) / 10000,
      entitiesInContext: cleanEntities.length,
    },
  });
}
