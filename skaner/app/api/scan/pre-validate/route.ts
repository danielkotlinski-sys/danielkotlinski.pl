import { NextRequest } from 'next/server';
import { getSession, getUser } from '@/lib/auth';
import { preValidateScanInput } from '@/lib/validation/preValidate';
import type { ScannerInput } from '@/types/scanner';

// Limit — pre-validate nie powinien trwać dłużej niż ~15s (fetch URL-i + 1 call Haiku).
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // Auth — ten endpoint woła Claude'a i pobiera external URL-e, więc nie chcemy żeby był publiczny
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Musisz być zalogowany' }, { status: 401 });
  }

  const user = await getUser(session.email);
  if (!user || !user.approved) {
    return Response.json({ error: 'Konto nie jest aktywne' }, { status: 403 });
  }

  let input: ScannerInput;
  try {
    const body = await request.json();
    input = body.input as ScannerInput;
  } catch {
    return Response.json({ error: 'Nieprawidłowy JSON' }, { status: 400 });
  }

  // Minimalna walidacja struktury — dalsza walidacja ma miejsce w /api/scan
  if (!input?.clientBrand?.name || !input?.clientBrand?.url) {
    return Response.json({ error: 'Brak danych marki klienta' }, { status: 400 });
  }
  if (!Array.isArray(input.competitors) || input.competitors.length < 2 || input.competitors.length > 4) {
    return Response.json({ error: 'Wymagane 2-4 konkurentów' }, { status: 400 });
  }

  try {
    const result = await preValidateScanInput(input);
    return Response.json(result);
  } catch (err) {
    console.error('[prevalidate] route error:', err);
    // Fail-open: jeśli pre-validate się wywali, lepiej puścić użytkownika dalej
    // niż blokować go z powodu bugu walidacji. UI pokaże neutralny stan.
    return Response.json({
      status: 'ok',
      findings: [],
      checkedAt: new Date().toISOString(),
      durationMs: 0,
      error: 'Weryfikacja niedostępna — scan można uruchomić mimo to',
    });
  }
}
