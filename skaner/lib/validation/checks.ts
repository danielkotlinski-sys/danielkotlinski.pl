import type { ValidationFinding } from '@/types/scanner';

/**
 * Deterministic handle format checks for pre-scan confirmation.
 *
 * Only validates social media handle syntax — runs client-side in ~1ms
 * with zero network / LLM dependencies. The rest of the pre-scan flow
 * (URL verification, content vs category matching) was removed: users
 * are best positioned to verify their own URLs and brand names, and
 * scope-creeping into page-quality auditing confused the UX.
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

/**
 * Convert a HandleCheckResult into a ValidationFinding ready for UI rendering.
 * Returns null if the handle is valid (nothing to show).
 */
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
