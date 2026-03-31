import { NextRequest } from 'next/server';
import { runPrompt, parseJsonResponse } from '@/lib/anthropic';

const JTBD_PROMPT = `Kategoria: {{CATEGORY}}
Typ: {{TYPE}}
Marka: {{BRAND}}

Zaproponuj 3 Jobs To Be Done dla klienta tej kategorii.
Nie chodzi o to co klient KUPUJE, ale po co PRZYCHODZI — jakie głębsze pragnienie, potrzebę lub problem próbuje rozwiązać.

Każdy job opisz z perspektywy klienta, w 1-2 zdaniach. Użyj języka człowieka, nie marketingu.
Postaraj się żeby jobsy były na różnych poziomach — jeden funkcjonalny, jeden emocjonalny, jeden społeczny/tożsamościowy.

Odpowiedz wyłącznie w JSON:
{"jobs": ["job 1", "job 2", "job 3"]}
`;

export async function POST(request: NextRequest) {
  try {
    const { category, categoryType, brandName } = await request.json();

    if (!category || category.length < 20) {
      return Response.json({ error: 'Opis kategorii za krótki' }, { status: 400 });
    }

    const prompt = JTBD_PROMPT
      .replace('{{CATEGORY}}', category)
      .replace('{{TYPE}}', categoryType || 'b2c')
      .replace('{{BRAND}}', brandName || '');

    const raw = await runPrompt(prompt);
    const result = parseJsonResponse<{ jobs: string[] }>(raw);

    return Response.json({ jobs: result.jobs || [] });
  } catch {
    return Response.json({ jobs: [] });
  }
}
