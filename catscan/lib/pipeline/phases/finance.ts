/** Phase: Finance — fetch KRS + financial data via rejestr.io API */

import type { EntityRecord } from '@/lib/db/store';

const REJESTR_IO_BASE = 'https://rejestr.io/api/v2';

async function rejestrFetch(path: string, apiKey: string) {
  const res = await fetch(`${REJESTR_IO_BASE}${path}`, {
    headers: {
      'Authorization': apiKey,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`rejestr.io ${res.status}: ${await res.text().catch(() => 'no body')}`);
  }
  return res.json();
}

export async function enrichFinance(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.REJESTR_IO_API_KEY;
  if (!apiKey) {
    return {
      ...entity,
      data: {
        ...entity.data,
        _finance: { skipped: true, reason: 'REJESTR_IO_API_KEY not set' },
      },
    };
  }

  // Find NIP from extraction or entity record
  const nip = entity.nip || (entity.data as Record<string, Record<string, string>>)?.contact?.nip;
  if (!nip) {
    return {
      ...entity,
      data: {
        ...entity.data,
        _finance: { skipped: true, reason: 'No NIP available' },
      },
    };
  }

  try {
    // Step 1: Search by NIP → find KRS number (0.05 PLN)
    const searchResult = await rejestrFetch(
      `/org/search?q=${encodeURIComponent(nip)}`,
      apiKey
    );

    const org = searchResult?.items?.[0] || searchResult?.[0];
    if (!org) {
      return {
        ...entity,
        data: {
          ...entity.data,
          _finance: { skipped: true, reason: `No org found for NIP ${nip}` },
        },
      };
    }

    const krs = org.krs || org.krs_number;
    let costPln = 0.05;

    // Step 2: Get advanced org data (0.05 PLN)
    let orgData = {};
    try {
      orgData = await rejestrFetch(`/org/${krs}/advanced`, apiKey);
      costPln += 0.05;
    } catch {
      // non-critical, continue
    }

    // Step 3: List financial documents (0.05 PLN)
    let financialDocs: Array<Record<string, string>> = [];
    try {
      const docsResult = await rejestrFetch(`/org/${krs}/financial-documents`, apiKey);
      financialDocs = docsResult?.items || docsResult || [];
      costPln += 0.05;
    } catch {
      // non-critical
    }

    // Step 4: Fetch up to 3 years of financial documents (0.50 PLN each)
    const financials: Array<Record<string, unknown>> = [];
    const recentDocs = financialDocs
      .sort((a: Record<string, string>, b: Record<string, string>) =>
        (b.year || b.period || '').localeCompare(a.year || a.period || ''))
      .slice(0, 3);

    for (const doc of recentDocs) {
      try {
        const docId = doc.id || doc.document_id;
        if (!docId) continue;
        const finData = await rejestrFetch(
          `/org/${krs}/financial-documents/${docId}`,
          apiKey
        );
        financials.push({
          year: doc.year || doc.period,
          ...finData,
        });
        costPln += 0.50;
      } catch {
        // skip failed doc
      }
    }

    return {
      ...entity,
      krs: krs,
      nip: nip,
      financials: {
        krs_number: krs,
        org_data: orgData,
        financial_statements: financials,
        years_available: financialDocs.length,
        years_fetched: financials.length,
        cost_pln: costPln,
        fetchedAt: new Date().toISOString(),
      },
      data: {
        ...entity.data,
        _finance: {
          krs_number: krs,
          cost_pln: costPln,
          years_fetched: financials.length,
          fetchedAt: new Date().toISOString(),
        },
      },
      status: 'enriched',
    };
  } catch (err) {
    return {
      ...entity,
      errors: [...entity.errors, `Finance error: ${err instanceof Error ? err.message : String(err)}`],
      data: {
        ...entity.data,
        _finance: { skipped: true, reason: err instanceof Error ? err.message : String(err) },
      },
    };
  }
}
