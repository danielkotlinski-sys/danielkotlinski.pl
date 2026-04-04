/**
 * Phase: Finance — fetch KRS + financial data via rejestr.io API
 *
 * Correct endpoints (from rejestr.io docs):
 *   GET /api/v2/org/{id}                         — basic org data
 *   GET /api/v2/org/{id}/krs-dokumenty            — list financial documents
 *   GET /api/v2/org/{id}/krs-dokumenty/{doc_id}   — get financial document
 *
 * {id} can be: KRS number (e.g. "12345") or NIP prefixed with "nip" (e.g. "nip1234567890")
 */

import { execSync } from 'child_process';
import type { EntityRecord } from '@/lib/db/store';

const REJESTR_IO_BASE = 'https://rejestr.io/api/v2';

function rejestrFetch(path: string, apiKey: string): unknown {
  try {
    const url = `${REJESTR_IO_BASE}${path}`;
    const result = execSync(
      `curl -s -m 15 -H 'Authorization: ${apiKey}' -H 'Accept: application/json' '${url}'`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }
    );
    const text = result.toString('utf-8');
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`rejestr.io fetch failed for ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
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

  // Find NIP from various sources
  const nip = entity.nip
    || (entity.data as Record<string, Record<string, string>>)?.contact?.nip
    || (entity.data as Record<string, Record<string, string>>)?._contact_raw?.nip;

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
    // Use NIP-based ID: "nip" prefix + 10-digit NIP
    const cleanNip = nip.replace(/[-\s]/g, '');
    const orgId = `nip${cleanNip}`;
    let costPln = 0;

    // Step 1: Get org data (0.05 PLN)
    let orgData: Record<string, unknown> = {};
    try {
      orgData = rejestrFetch(`/org/${orgId}`, apiKey) as Record<string, unknown>;
      costPln += 0.05;
    } catch (err) {
      // If NIP lookup fails, we can't proceed
      return {
        ...entity,
        data: {
          ...entity.data,
          _finance: {
            skipped: true,
            reason: `Org not found for NIP ${cleanNip}: ${err instanceof Error ? err.message : String(err)}`,
          },
        },
      };
    }

    const krsNumber = orgData.krs_number || orgData.krs || orgData.id;

    // Step 2: List financial documents (0.05 PLN)
    let financialDocs: Array<Record<string, unknown>> = [];
    try {
      const docsResult = rejestrFetch(`/org/${orgId}/krs-dokumenty`, apiKey) as Record<string, unknown>;
      financialDocs = (docsResult?.items || docsResult?.dokumenty || (Array.isArray(docsResult) ? docsResult : [])) as Array<Record<string, unknown>>;
      costPln += 0.05;
    } catch {
      // non-critical, continue without financial docs
    }

    // Step 3: Fetch up to 3 most recent financial documents in JSON format (0.50 PLN each)
    const financials: Array<Record<string, unknown>> = [];
    const recentDocs = financialDocs
      .sort((a, b) => {
        const aDate = String(a.okres_data_koniec || a.year || a.period || '');
        const bDate = String(b.okres_data_koniec || b.year || b.period || '');
        return bDate.localeCompare(aDate);
      })
      .slice(0, 3);

    for (const doc of recentDocs) {
      try {
        const docId = doc.id || doc.id_dokumentu || doc.document_id;
        if (!docId) continue;

        const finData = rejestrFetch(
          `/org/${orgId}/krs-dokumenty/${docId}?format=json`,
          apiKey
        ) as Record<string, unknown>;

        // Extract key financial figures from the hierarchical structure
        const parsed = parseFinancialDocument(finData);

        financials.push({
          documentId: docId,
          periodStart: doc.okres_data_start || finData.okres_data_start,
          periodEnd: doc.okres_data_koniec || finData.okres_data_koniec,
          name: doc.nazwa || finData.nazwa,
          ...parsed,
          raw: finData.zawartosc ? '[available]' : undefined,
        });
        costPln += 0.50;
      } catch {
        // skip failed doc
      }
    }

    return {
      ...entity,
      krs: String(krsNumber || ''),
      nip: cleanNip,
      financials: {
        krs_number: krsNumber,
        org_name: orgData.nazwa || orgData.name,
        legal_form: orgData.forma_prawna || orgData.legal_form,
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
          krs_number: krsNumber,
          cost_pln: costPln,
          years_available: financialDocs.length,
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

/**
 * Parse the hierarchical financial document structure from rejestr.io
 * to extract key financial metrics.
 */
function parseFinancialDocument(doc: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (!doc.zawartosc) return result;

  const content = doc.zawartosc as Record<string, unknown>;

  // Recursively search for key financial nodes
  function findNode(
    obj: Record<string, unknown> | Array<Record<string, unknown>>,
    targetLabels: RegExp
  ): { current?: number; previous?: number; label?: string } | null {
    const items = Array.isArray(obj) ? obj : (obj.podobiekty as Array<Record<string, unknown>>) || [obj];

    for (const item of items) {
      const label = String(item.etykieta || '');
      if (targetLabels.test(label)) {
        return {
          current: item.pln_rok_obrotowy_biezacy as number | undefined,
          previous: item.pln_rok_obrotowy_poprzedni as number | undefined,
          label,
        };
      }
      // Recurse into children
      if (item.podobiekty && Array.isArray(item.podobiekty)) {
        const found = findNode(item.podobiekty as Array<Record<string, unknown>>, targetLabels);
        if (found) return found;
      }
    }
    return null;
  }

  const items = Array.isArray(content) ? content : [content];
  for (const section of items) {
    const subs = (section.podobiekty || []) as Array<Record<string, unknown>>;

    // Revenue (Przychody netto ze sprzedaży)
    const revenue = findNode(subs, /przychody netto ze sprzeda/i);
    if (revenue) {
      result.revenue_current = revenue.current;
      result.revenue_previous = revenue.previous;
    }

    // Net income (Zysk/strata netto)
    const netIncome = findNode(subs, /zysk.*strata.*netto|zysk netto|strata netto/i);
    if (netIncome) {
      result.net_income_current = netIncome.current;
      result.net_income_previous = netIncome.previous;
    }

    // Total assets (Aktywa razem)
    const assets = findNode(subs, /aktywa razem|aktywa ogółem/i);
    if (assets) {
      result.total_assets_current = assets.current;
      result.total_assets_previous = assets.previous;
    }

    // Equity (Kapitał własny)
    const equity = findNode(subs, /kapitał.*własny/i);
    if (equity) {
      result.equity_current = equity.current;
      result.equity_previous = equity.previous;
    }

    // Operating profit (Zysk/strata z działalności operacyjnej)
    const opProfit = findNode(subs, /zysk.*strata.*działalności operac/i);
    if (opProfit) {
      result.operating_profit_current = opProfit.current;
      result.operating_profit_previous = opProfit.previous;
    }
  }

  return result;
}
