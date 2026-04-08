import type {
  ScannerInput,
  ValidationFinding,
} from '@/types/scanner';
import type { PageMeta } from './meta';

/**
 * Deterministic (non-LLM) checks for pre-validation.
 * Run first — they catch 90% of common errors without any API cost.
 */

// === Handle format rules ===
//
// Facebook: letters, digits, dots. Minimum 5 chars. NO underscores.
// Instagram: letters, digits, dots, underscores. Up to 30 chars.
// LinkedIn: letters, digits, hyphens (company slugs).
//
// Source: platform documentation + empirical testing of real handles.

const FB_HANDLE_REGEX = /^[a-zA-Z0-9.]{5,50}$/;
const IG_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,30}$/;
const LI_HANDLE_REGEX = /^[a-zA-Z0-9\-]{3,100}$/;

interface HandleCheckResult {
  valid: boolean;
  /** Opis problemu jeśli !valid */
  reason?: string;
  /** Sugerowana poprawka (np. po usunięciu underscore'a) */
  suggestion?: string;
  /** Sugerowana zmiana platformy (np. underscore w FB → pewnie IG) */
  suggestedPlatform?: 'instagram' | 'facebook' | 'linkedin';
}

export function checkHandleFormat(
  handle: string,
  platform: 'instagram' | 'facebook' | 'linkedin'
): HandleCheckResult {
  // Pusty handle jest OK — social jest opcjonalny
  if (!handle) return { valid: true };

  // Oczywiste śmieci
  if (/\s/.test(handle)) {
    return { valid: false, reason: 'Handle zawiera spacje' };
  }
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(handle)) {
    return { valid: false, reason: 'Handle zawiera polskie znaki — platformy social media ich nie obsługują' };
  }
  if (/[^a-zA-Z0-9._\-]/.test(handle)) {
    return { valid: false, reason: 'Handle zawiera nieobsługiwane znaki specjalne' };
  }

  // Specyficzne reguły per platforma
  if (platform === 'facebook') {
    if (!FB_HANDLE_REGEX.test(handle)) {
      if (handle.includes('_')) {
        return {
          valid: false,
          reason: 'Facebook usernames nie mogą zawierać podkreślnika (_). Wygląda to na handle Instagrama.',
          suggestion: handle.replace(/_/g, ''),
          suggestedPlatform: 'instagram',
        };
      }
      if (handle.length < 5) {
        return { valid: false, reason: 'Facebook username musi mieć minimum 5 znaków' };
      }
      return { valid: false, reason: 'Handle nie pasuje do formatu Facebook username' };
    }
    return { valid: true };
  }

  if (platform === 'instagram') {
    if (!IG_HANDLE_REGEX.test(handle)) {
      return { valid: false, reason: 'Handle nie pasuje do formatu Instagram username' };
    }
    return { valid: true };
  }

  if (platform === 'linkedin') {
    if (!LI_HANDLE_REGEX.test(handle)) {
      if (handle.includes('_') || handle.includes('.')) {
        return {
          valid: false,
          reason: 'LinkedIn company slug używa myślników (-), nie podkreślników ani kropek',
          suggestion: handle.replace(/[_.]/g, '-'),
        };
      }
      return { valid: false, reason: 'Handle nie pasuje do formatu LinkedIn company slug' };
    }
    return { valid: true };
  }

  return { valid: true };
}

// === URL duplicate detection ===

/** Normalizuje URL do porównania (bez trailing slash, bez protokołu, lowercase) */
function normalizeForCompare(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

export interface DuplicateGroup {
  url: string;
  owners: Array<{ role: 'client' | 'competitor'; index?: number; name: string }>;
}

export function findDuplicateUrls(input: ScannerInput): DuplicateGroup[] {
  const byNormalized = new Map<string, DuplicateGroup>();

  const addEntry = (rawUrl: string, owner: DuplicateGroup['owners'][number]) => {
    if (!rawUrl) return;
    const normalized = normalizeForCompare(rawUrl);
    if (!normalized) return;
    if (!byNormalized.has(normalized)) {
      byNormalized.set(normalized, { url: rawUrl, owners: [] });
    }
    byNormalized.get(normalized)!.owners.push(owner);
  };

  addEntry(input.clientBrand.url, {
    role: 'client',
    name: input.clientBrand.name,
  });
  input.competitors.forEach((c, i) => {
    addEntry(c.url, { role: 'competitor', index: i, name: c.name });
  });

  return Array.from(byNormalized.values()).filter((g) => g.owners.length > 1);
}

// === Finding builders ===
//
// Te helpery budują ValidationFinding z różnych źródeł, konsekwentnie
// ustawiając role/competitorIndex — dzięki temu UI wie, które pole zmodyfikować.

export function handleFindingFromFormatCheck(
  check: HandleCheckResult,
  brandName: string,
  role: 'client' | 'competitor',
  competitorIndex: number | undefined
): ValidationFinding | null {
  if (check.valid) return null;
  return {
    brand: brandName,
    role,
    competitorIndex,
    field: 'socialHandle',
    severity: 'warning',
    issue: check.reason || 'Handle w złym formacie',
    suggestion: check.suggestion || null,
    confidence: 0.95,
    rationale: check.suggestedPlatform
      ? `Format sugeruje platformę "${check.suggestedPlatform}" zamiast zadeklarowanej`
      : 'Handle nie przejdzie walidacji scrapera',
    source: 'format',
  };
}

export function urlFindingFromMeta(
  meta: PageMeta,
  brandName: string,
  role: 'client' | 'competitor',
  competitorIndex: number | undefined
): ValidationFinding | null {
  // DNS error / domain doesn't exist → hard error (scan se nie powiedzie)
  if (!meta.reachable && meta.error) {
    const hardErrors = ['DNS', 'nie istnieje', 'certyfikat', 'Nieprawidłowy'];
    const isHard = hardErrors.some((k) => meta.error!.includes(k));
    return {
      brand: brandName,
      role,
      competitorIndex,
      field: 'url',
      severity: isHard ? 'error' : 'warning',
      issue: meta.error,
      suggestion: null,
      confidence: 1.0,
      rationale: isHard
        ? 'Scan nie pozyska danych z tej strony — trzeba poprawić URL'
        : 'Strona może nie odpowiadać podczas scanu',
      source: 'reachability',
    };
  }

  // 4xx (poza 403/429) → hard error
  if (meta.status && meta.status >= 400 && meta.status < 500 && meta.status !== 403 && meta.status !== 429) {
    return {
      brand: brandName,
      role,
      competitorIndex,
      field: 'url',
      severity: 'error',
      issue: `Strona zwraca ${meta.status} — prawdopodobnie nie istnieje pod tym adresem`,
      suggestion: null,
      confidence: 1.0,
      rationale: `HTTP ${meta.status}`,
      source: 'reachability',
    };
  }

  // 5xx → soft warning
  if (meta.status && meta.status >= 500) {
    return {
      brand: brandName,
      role,
      competitorIndex,
      field: 'url',
      severity: 'warning',
      issue: `Strona zwraca ${meta.status} — serwer może być tymczasowo niedostępny`,
      suggestion: null,
      confidence: 0.9,
      rationale: `HTTP ${meta.status}`,
      source: 'reachability',
    };
  }

  // Redirect cross-domain → info
  if (meta.redirected && meta.finalUrl) {
    try {
      const originalHost = new URL(meta.requestedUrl).hostname.replace(/^www\./, '');
      const finalHost = new URL(meta.finalUrl).hostname.replace(/^www\./, '');
      if (originalHost !== finalHost) {
        return {
          brand: brandName,
          role,
          competitorIndex,
          field: 'url',
          severity: 'info',
          issue: `Strona przekierowuje na inną domenę: ${finalHost}`,
          suggestion: meta.finalUrl,
          confidence: 1.0,
          rationale: `${originalHost} → ${finalHost}`,
          source: 'reachability',
        };
      }
    } catch {
      // invalid URL — ignore
    }
  }

  return null;
}

export function duplicateUrlFinding(group: DuplicateGroup): ValidationFinding {
  // Zawsze błąd — logika skanu zakłada unikalne źródła
  const owners = group.owners.map((o) => o.name || (o.role === 'client' ? 'klient' : `konkurent ${(o.index ?? 0) + 1}`));
  return {
    brand: group.owners[0].name || 'nieznana',
    role: group.owners[0].role,
    competitorIndex: group.owners[0].index,
    field: 'url',
    severity: 'error',
    issue: `Ten sam URL jest użyty dla: ${owners.join(', ')}. Każda marka musi mieć własną stronę.`,
    suggestion: null,
    confidence: 1.0,
    rationale: 'Pipeline skanu wymaga unikalnych źródeł',
    source: 'duplicate',
  };
}
