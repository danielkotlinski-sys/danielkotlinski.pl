/**
 * Phase: Discovery — resolve NIP, KRS, legal form for each entity.
 *
 * Strategy:
 * 1. Check if NIP already extracted from website (extract phase)
 * 2. Search Google/DuckDuckGo for "NIP [company name] catering"
 * 3. Parse NIP from search results (10-digit Polish tax ID)
 * 4. Determine legal form from NIP lookup
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

const NIP_REGEX = /\b(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})\b/g;
const NIP_CLEAN_REGEX = /[-\s]/g;

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
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

function validateNip(nip: string): boolean {
  const clean = nip.replace(NIP_CLEAN_REGEX, '');
  if (clean.length !== 10) return false;
  if (/^0{10}$/.test(clean)) return false;

  // NIP checksum validation
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
    .filter((v, i, a) => a.indexOf(v) === i); // dedupe
}

async function searchForNip(companyName: string, entityUrl?: string): Promise<string | null> {
  // Strategy 1: Check company's own legal pages (regulamin, polityka prywatności)
  if (entityUrl) {
    const base = entityUrl.startsWith('http') ? entityUrl : `https://${entityUrl}`;
    for (const path of ['/polityka-prywatnosci', '/regulamin', '/privacy-policy', '/terms']) {
      try {
        const url = new URL(path, base).href;
        const html = curlFetch(url);
        if (html) {
          const nips = extractNipsFromText(html);
          if (nips.length > 0) return nips[0];
        }
      } catch { /* skip */ }
    }
  }

  // Strategy 2: Search DuckDuckGo with multiple query variants
  const queries = [
    `NIP "${companyName}" catering dietetyczny`,
    `"${companyName}" NIP site:rejestr.io OR site:aleo.com`,
    `"${companyName}" NIP regon`,
  ];

  for (const q of queries) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const html = curlFetch(searchUrl);
    if (html) {
      const nips = extractNipsFromText(html);
      if (nips.length > 0) return nips[0];
    }
  }

  // Strategy 3: Try Google
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`NIP "${companyName}" catering`)}&hl=pl`;
  const gHtml = curlFetch(googleUrl);
  if (gHtml) {
    const nips = extractNipsFromText(gHtml);
    if (nips.length > 0) return nips[0];
  }

  return null;
}

async function lookupKrs(nip: string): Promise<{ krs?: string; legalForm?: string; name?: string } | null> {
  // Use free KRS API to look up by... actually KRS API doesn't search by NIP.
  // Use rejestr.io search or a public KRS search.
  // Fallback: try to find KRS number in search results.

  const query = encodeURIComponent(`KRS NIP ${nip}`);
  const html = curlFetch(`https://html.duckduckgo.com/html/?q=${query}`);

  if (html) {
    // Look for KRS number pattern (7-10 digit number after "KRS")
    const krsMatch = html.match(/KRS[:\s]*0*(\d{7,10})/i);
    if (krsMatch) {
      return { krs: krsMatch[1].padStart(10, '0') };
    }

    // Look for legal form
    const spzooMatch = html.match(/sp\.\s*z\s*o\.?\s*o\.?/i);
    const saMatch = html.match(/\bS\.A\.\b/);
    const jdgMatch = html.match(/jednoosobowa działalność|JDG/i);

    if (spzooMatch) return { legalForm: 'sp_zoo' };
    if (saMatch) return { legalForm: 'sa' };
    if (jdgMatch) return { legalForm: 'jdg' };
  }

  return null;
}

export async function discoverEntity(entity: EntityRecord): Promise<EntityRecord> {
  // Check if NIP already extracted from website
  const existingNip = entity.nip ||
    (entity.data as Record<string, Record<string, string>>)?.contact?.nip;

  let nip: string | undefined = existingNip?.replace(NIP_CLEAN_REGEX, '');
  let discoveryMethod = 'existing';

  // If no NIP, search for it
  if (!nip || !validateNip(nip)) {
    const found = await searchForNip(entity.name, entity.url);
    nip = found || undefined;
    discoveryMethod = nip ? 'search' : 'not_found';
  }

  // If we have NIP, try to find KRS
  let krsData: { krs?: string; legalForm?: string } = {};
  if (nip) {
    const lookup = await lookupKrs(nip);
    if (lookup) krsData = lookup;
  }

  // Brief pause to be nice to search engines
  await new Promise(r => setTimeout(r, 1000));

  return {
    ...entity,
    nip: nip || entity.nip,
    krs: krsData.krs || entity.krs,
    data: {
      ...entity.data,
      _discovery: {
        nip: nip || null,
        nipValid: nip ? validateNip(nip) : false,
        nipSource: discoveryMethod,
        krs: krsData.krs || null,
        legalForm: krsData.legalForm || null,
        discoveredAt: new Date().toISOString(),
      },
    },
  };
}
