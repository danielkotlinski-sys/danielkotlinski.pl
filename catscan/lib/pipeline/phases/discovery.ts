/**
 * Phase: Discovery — resolve NIP, KRS, legal form for each entity.
 *
 * Strategy (in order):
 * 1. Check if NIP already extracted from website crawl (contact_raw, extract)
 * 2. Search rejestr.io by company name (reliable, 0.05 PLN/req)
 * 3. Crawl company legal pages (regulamin, polityka prywatności) for NIP
 * 4. Perplexity context phase will also try NIP as a fallback (separate phase)
 *
 * rejestr.io returns NIP + KRS + legal form + address in one call.
 * No more DuckDuckGo/Google scraping.
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

const NIP_REGEX = /\b(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})\b/g;
const NIP_CLEAN_REGEX = /[-\s]/g;

const REJESTR_IO_BASE = 'https://rejestr.io/api/v2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function validateNip(nip: string): boolean {
  const clean = nip.replace(NIP_CLEAN_REGEX, '');
  if (clean.length !== 10) return false;
  if (/^0{10}$/.test(clean)) return false;

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i]) * weights[i];
  }
  return sum % 11 === parseInt(clean[9]);
}

function extractNipsFromText(text: string): string[] {
  const matches = text.match(NIP_REGEX) || [];
  return matches
    .map(m => m.replace(NIP_CLEAN_REGEX, ''))
    .filter(validateNip)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL -m 10 --max-redirs 5 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' ${shellEscape(url)}`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 15000 }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 1: rejestr.io name search (primary)
// ---------------------------------------------------------------------------

interface RejestrSearchResult {
  nip?: string;
  krs?: string;
  legalForm?: string;
  orgName?: string;
}

async function searchRejestrIo(companyName: string, apiKey: string): Promise<RejestrSearchResult | null> {
  // Try multiple search variants: full name, then simplified
  const queries = [
    companyName,
    companyName.replace(/\.(pl|com|eu)$/i, '').replace(/[-_.]/g, ' '),
  ];

  for (const query of queries) {
    try {
      const url = `${REJESTR_IO_BASE}/org/search?q=${encodeURIComponent(query)}`;
      const result = execSync(
        `curl -s -m 15 -H "Authorization: ${apiKey}" -H 'Accept: application/json' ${shellEscape(url)}`,
        { maxBuffer: 5 * 1024 * 1024, timeout: 20000 }
      );

      let data: unknown;
      try {
        data = JSON.parse(result.toString('utf-8'));
      } catch {
        continue;
      }

      // rejestr.io returns array of matches or object with items
      const items = Array.isArray(data) ? data : (data as Record<string, unknown>)?.items;
      if (!Array.isArray(items) || items.length === 0) continue;

      // Take the first match — rejestr.io sorts by relevance
      const org = items[0] as Record<string, unknown>;

      const numery = (org.numery || {}) as Record<string, string>;
      const stan = (org.stan || {}) as Record<string, unknown>;
      const nazwy = (org.nazwy || {}) as Record<string, string>;

      const nip = numery.nip || (org.nip as string) || undefined;
      const krs = numery.krs || (org.krs as string) || String(org.id || '');

      // Detect legal form
      let legalForm: string | undefined;
      const formaPrawna = String(stan.forma_prawna || org.forma_prawna || nazwy.pelna || '');
      if (/sp\.\s*z\s*o\.?\s*o/i.test(formaPrawna)) legalForm = 'sp_zoo';
      else if (/S\.A\./i.test(formaPrawna)) legalForm = 'sa';
      else if (/spółka komandytowa|sp\.\s*k\./i.test(formaPrawna)) legalForm = 'sk';
      else if (/spółka cywilna|s\.c\./i.test(formaPrawna)) legalForm = 'sc';

      if (nip && validateNip(nip)) {
        return {
          nip,
          krs: krs || undefined,
          legalForm,
          orgName: nazwy.pelna || nazwy.skrocona || undefined,
        };
      }
    } catch {
      // API error — continue to next query
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Strategy 2: crawl website legal pages
// ---------------------------------------------------------------------------

function searchLegalPages(entityUrl?: string): string | null {
  if (!entityUrl) return null;

  const base = entityUrl.startsWith('http') ? entityUrl : `https://${entityUrl}`;
  for (const path of ['/polityka-prywatnosci', '/regulamin', '/privacy-policy', '/terms', '/kontakt']) {
    try {
      const url = new URL(path, base).href;
      const html = curlFetch(url);
      if (html) {
        const nips = extractNipsFromText(html);
        if (nips.length > 0) return nips[0];
      }
    } catch { /* skip */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function discoverEntity(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.REJESTR_IO_API_KEY;

  // Gather NIP candidates from previous phases
  const existingNip = entity.nip ||
    (entity.data as Record<string, Record<string, string>>)?.contact?.nip ||
    (entity.data as Record<string, Record<string, string>>)?._contact_raw?.nip;

  // Get legalName and NIP from Perplexity context phase (runs before discovery)
  const contextData = (entity.data as Record<string, Record<string, string>>)?.context;
  const contextNip = contextData?.nip;
  const contextLegalName = contextData?.legalName;

  let nip: string | undefined = existingNip?.replace(NIP_CLEAN_REGEX, '');
  let discoveryMethod = 'existing';
  let krs: string | undefined;
  let legalForm: string | undefined;
  let orgName: string | undefined;

  // Validate existing NIP
  if (nip && !validateNip(nip)) {
    nip = undefined;
  }

  // Try Perplexity NIP if crawl didn't find one
  if (!nip && contextNip) {
    const cleaned = contextNip.replace(NIP_CLEAN_REGEX, '');
    if (validateNip(cleaned)) {
      nip = cleaned;
      discoveryMethod = 'perplexity';
    }
  }

  // Strategy 1: rejestr.io search — use legalName from Perplexity (bridges brand→legal name gap)
  if (!nip && apiKey) {
    // Try legalName first (most accurate), then brand name (fallback)
    const searchNames = [contextLegalName, entity.name].filter(Boolean) as string[];
    for (const name of searchNames) {
      const result = await searchRejestrIo(name, apiKey);
      if (result?.nip) {
        nip = result.nip;
        krs = result.krs;
        legalForm = result.legalForm;
        orgName = result.orgName;
        discoveryMethod = contextLegalName && name === contextLegalName
          ? 'rejestr_io_via_legal_name' : 'rejestr_io';
        break;
      }
    }
  }

  // Strategy 2: crawl legal pages (if still no NIP)
  if (!nip) {
    const found = searchLegalPages(entity.url);
    if (found) {
      nip = found;
      discoveryMethod = 'legal_page';
    }
  }

  // If we found NIP via legal pages but have rejestr.io key, enrich with org data
  if (nip && !krs && apiKey) {
    try {
      const result = await searchRejestrIo(nip, apiKey);
      if (result) {
        krs = result.krs;
        legalForm = result.legalForm;
        orgName = result.orgName;
      }
    } catch { /* non-critical */ }
  }

  if (!nip) {
    discoveryMethod = 'not_found';
  }

  // Brief pause between entities
  await new Promise(r => setTimeout(r, 300));

  return {
    ...entity,
    nip: nip || entity.nip,
    krs: krs || entity.krs,
    data: {
      ...entity.data,
      _discovery: {
        nip: nip || null,
        nipValid: nip ? validateNip(nip) : false,
        nipSource: discoveryMethod,
        krs: krs || null,
        legalForm: legalForm || null,
        orgName: orgName || null,
        discoveredAt: new Date().toISOString(),
      },
    },
  };
}
