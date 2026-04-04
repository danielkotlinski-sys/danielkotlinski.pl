/**
 * Phase: Finance — fetch KRS + financial data via rejestr.io API
 *
 * Endpoints:
 *   GET /api/v2/org/{id}                                    — basic org data
 *   GET /api/v2/org/{id}/krs-dokumenty                      — list financial periods + docs
 *   GET /api/v2/org/{id}/krs-dokumenty/{doc_id}?format=json — financial doc in JSON
 *
 * {id} can be NIP prefixed: "nip1234567890"
 *
 * krs-dokumenty returns array of periods:
 *   [{ data_start, data_koniec, dokumenty: [{ id, nazwa, czy_ma_json }] }]
 *
 * Financial doc JSON has hierarchical zawartosc with:
 *   etykieta (label), pln_rok_obrotowy_biezacy/poprzedni (string values), podobiekty (children)
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
    const parsed = JSON.parse(text);
    // Check for API errors
    if (parsed?.kod && parsed?.info) {
      throw new Error(`API ${parsed.kod}: ${parsed.info}`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`rejestr.io ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

interface Period {
  data_start: string;
  data_koniec: string;
  dokumenty: Array<{
    id: number;
    nazwa: string;
    czy_ma_json: boolean;
  }>;
}

interface FinNode {
  etykieta: string;
  pln_rok_obrotowy_biezacy: string | null;
  pln_rok_obrotowy_poprzedni: string | null;
  podobiekty: FinNode[] | null;
}

export async function enrichFinance(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.REJESTR_IO_API_KEY;
  if (!apiKey) {
    return {
      ...entity,
      data: { ...entity.data, finance: { skipped: true, reason: 'REJESTR_IO_API_KEY not set' } },
    };
  }

  const nip = entity.nip
    || (entity.data as Record<string, Record<string, string>>)?._discovery?.nip
    || (entity.data as Record<string, Record<string, string>>)?.contact?.nip
    || (entity.data as Record<string, Record<string, string>>)?._contact_raw?.nip;

  if (!nip) {
    return {
      ...entity,
      data: { ...entity.data, finance: { skipped: true, reason: 'No NIP available' } },
    };
  }

  try {
    const cleanNip = nip.replace(/[-\s]/g, '');
    const orgId = `nip${cleanNip}`;
    let costPln = 0;

    // Step 1: Get org data
    let orgData: Record<string, unknown> = {};
    try {
      orgData = rejestrFetch(`/org/${orgId}`, apiKey) as Record<string, unknown>;
      costPln += 0.05;
    } catch (err) {
      return {
        ...entity,
        data: {
          ...entity.data,
          finance: { skipped: true, reason: `Org lookup failed: ${err instanceof Error ? err.message : String(err)}` },
        },
      };
    }

    // Extract org info
    const numery = (orgData.numery || {}) as Record<string, string>;
    const nazwy = (orgData.nazwy || {}) as Record<string, string>;
    const stan = (orgData.stan || {}) as Record<string, unknown>;
    const krsNumber = numery.krs || String(orgData.id || '');

    // Step 2: List financial periods + documents
    let periods: Period[] = [];
    try {
      const raw = rejestrFetch(`/org/${orgId}/krs-dokumenty`, apiKey);
      periods = (Array.isArray(raw) ? raw : []) as Period[];
      costPln += 0.05;
    } catch {
      // non-critical
    }

    // Step 3: For each of the 3 most recent periods, fetch RZiS and Bilans
    const sortedPeriods = periods
      .sort((a, b) => (b.data_koniec || '').localeCompare(a.data_koniec || ''))
      .slice(0, 3);

    const yearlyData: Array<Record<string, unknown>> = [];

    for (const period of sortedPeriods) {
      const yearResult: Record<string, unknown> = {
        periodStart: period.data_start,
        periodEnd: period.data_koniec,
      };

      // Find RZiS (Rachunek zysków i strat) with JSON
      const rzis = period.dokumenty.find(
        d => d.czy_ma_json && /rachunek zysk/i.test(d.nazwa)
      );
      if (rzis) {
        try {
          const doc = rejestrFetch(
            `/org/${orgId}/krs-dokumenty/${rzis.id}?format=json`,
            apiKey
          ) as Record<string, unknown>;
          const parsed = parseRZiS(doc);
          Object.assign(yearResult, parsed);
          costPln += 0.50;
        } catch { /* skip */ }
      }

      // Find Bilans
      const bilans = period.dokumenty.find(
        d => d.czy_ma_json && /bilans/i.test(d.nazwa)
      );
      if (bilans) {
        try {
          const doc = rejestrFetch(
            `/org/${orgId}/krs-dokumenty/${bilans.id}?format=json`,
            apiKey
          ) as Record<string, unknown>;
          const parsed = parseBilans(doc);
          Object.assign(yearResult, parsed);
          costPln += 0.50;
        } catch { /* skip */ }
      }

      yearlyData.push(yearResult);
    }

    // Flatten latest year for easy access
    const latest = yearlyData[0] || {};

    const financeData = {
      krs_number: krsNumber,
      org_name: nazwy.pelna || nazwy.skrocona || null,
      legal_form: stan.forma_prawna || null,
      nip: cleanNip,
      regon: numery.regon || null,
      registration_date: (orgData.krs_rejestry as Record<string, string>)?.rejestr_przedsiebiorcow_data_wpisu || null,
      pkd: stan.pkd_przewazajace_dzial || null,
      address: orgData.adres || null,
      financial_statements: yearlyData,
      years_available: periods.length,
      years_fetched: yearlyData.length,
      cost_pln: costPln,
      fetchedAt: new Date().toISOString(),
      // Top-level figures from latest year
      revenue: latest.revenue ?? null,
      revenuePrevious: latest.revenuePrevious ?? null,
      netIncome: latest.netIncome ?? null,
      totalAssets: latest.totalAssets ?? null,
      equity: latest.equity ?? null,
      operatingProfit: latest.operatingProfit ?? null,
    };

    return {
      ...entity,
      krs: krsNumber,
      nip: cleanNip,
      financials: financeData,
      data: { ...entity.data, finance: financeData },
      status: 'enriched',
    };
  } catch (err) {
    return {
      ...entity,
      errors: [...entity.errors, `Finance error: ${err instanceof Error ? err.message : String(err)}`],
      data: {
        ...entity.data,
        finance: { skipped: true, reason: err instanceof Error ? err.message : String(err) },
      },
    };
  }
}

/** Parse value string "121718202.88" → number */
function pln(val: string | null | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/** Recursively find a node by etykieta regex */
function findNode(nodes: FinNode[] | null, pattern: RegExp): FinNode | null {
  if (!nodes) return null;
  for (const node of nodes) {
    if (pattern.test(node.etykieta || '')) return node;
    const found = findNode(node.podobiekty, pattern);
    if (found) return found;
  }
  return null;
}

/** Parse RZiS (Rachunek zysków i strat) */
function parseRZiS(doc: Record<string, unknown>): Record<string, unknown> {
  const zawartosc = doc.zawartosc as FinNode | null;
  if (!zawartosc) return {};

  // Navigate to the actual data — it might be nested under a variant (porównawczy/kalkulacyjny)
  const root = zawartosc.podobiekty || [zawartosc];

  const result: Record<string, unknown> = {};

  // A: Przychody netto ze sprzedaży
  const revenue = findNode(root, /przychody netto ze sprzeda/i);
  if (revenue) {
    result.revenue = pln(revenue.pln_rok_obrotowy_biezacy);
    result.revenuePrevious = pln(revenue.pln_rok_obrotowy_poprzedni);
  }

  // Zysk/strata netto
  const netIncome = findNode(root, /zysk.*strata.*netto|zysk netto|strata netto/i);
  if (netIncome) {
    result.netIncome = pln(netIncome.pln_rok_obrotowy_biezacy);
    result.netIncomePrevious = pln(netIncome.pln_rok_obrotowy_poprzedni);
  }

  // Zysk/strata z działalności operacyjnej
  const opProfit = findNode(root, /zysk.*strata.*działalności operac/i);
  if (opProfit) {
    result.operatingProfit = pln(opProfit.pln_rok_obrotowy_biezacy);
    result.operatingProfitPrevious = pln(opProfit.pln_rok_obrotowy_poprzedni);
  }

  // Koszty działalności operacyjnej
  const opCosts = findNode(root, /koszty działalności operac/i);
  if (opCosts) {
    result.operatingCosts = pln(opCosts.pln_rok_obrotowy_biezacy);
  }

  return result;
}

/** Parse Bilans */
function parseBilans(doc: Record<string, unknown>): Record<string, unknown> {
  const zawartosc = doc.zawartosc as FinNode | null;
  if (!zawartosc) return {};

  const root = zawartosc.podobiekty || [zawartosc];

  const result: Record<string, unknown> = {};

  // Aktywa razem
  const assets = findNode(root, /aktywa razem|aktywa ogółem/i);
  if (assets) {
    result.totalAssets = pln(assets.pln_rok_obrotowy_biezacy);
    result.totalAssetsPrevious = pln(assets.pln_rok_obrotowy_poprzedni);
  }

  // Kapitał własny
  const equity = findNode(root, /kapitał.*własny/i);
  if (equity) {
    result.equity = pln(equity.pln_rok_obrotowy_biezacy);
    result.equityPrevious = pln(equity.pln_rok_obrotowy_poprzedni);
  }

  // Zobowiązania
  const liabilities = findNode(root, /zobowiązania.*razem|zobowiązania i rezerwy/i);
  if (liabilities) {
    result.totalLiabilities = pln(liabilities.pln_rok_obrotowy_biezacy);
  }

  return result;
}
