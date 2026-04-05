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
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

const REJESTR_IO_BASE = 'https://rejestr.io/api/v2';

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function rejestrFetch(path: string, apiKey: string): unknown {
  try {
    const url = `${REJESTR_IO_BASE}${path}`;
    const result = execSync(
      `curl -s -m 15 -H "Authorization: ${apiKey}" -H 'Accept: application/json' ${shellEscape(url)}`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }
    );
    const text = result.toString('utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response (${text.slice(0, 100)})`);
    }
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
    // No NIP — try Perplexity fallback for revenue estimate only
    const pplxKey = process.env.PERPLEXITY_API_KEY;
    if (pplxKey) {
      console.log(`[finance] No NIP for ${entity.name} — using Perplexity-only fallback`);
      const pe = callPerplexityFinance(
        FINANCE_FALLBACK_PROMPT(entity.name, null, null),
        pplxKey
      );
      if (pe) {
        const financeData: Record<string, unknown> = {
          krs_number: null,
          org_name: null,
          nip: null,
          revenue_source: 'perplexity-estimate',
          revenue: (pe.revenue_2024 as number | null) ?? (pe.estimated_annual_revenue as number | null) ?? null,
          revenuePrevious: (pe.revenue_2023 as number | null) ?? null,
          netIncome: (pe.net_income_2024 as number | null) ?? null,
          perplexity_estimate: {
            operating_entity_name: pe.operating_entity_name ?? null,
            operating_entity_nip: pe.operating_entity_nip ?? null,
            revenue_2024: pe.revenue_2024 ?? null,
            revenue_2023: pe.revenue_2023 ?? null,
            revenue_2022: pe.revenue_2022 ?? null,
            net_income_2024: pe.net_income_2024 ?? null,
            net_income_2023: pe.net_income_2023 ?? null,
            net_income_2022: pe.net_income_2022 ?? null,
            employee_count: pe.employee_count ?? null,
            estimated_annual_revenue: pe.estimated_annual_revenue ?? null,
            revenue_source_detail: pe.revenue_source ?? null,
            confidence: pe.confidence ?? 'low',
            notes: pe.notes ?? null,
          },
          cost_usd_perplexity: 0.005,
          fetchedAt: new Date().toISOString(),
        };
        return {
          ...entity,
          data: { ...entity.data, finance: financeData },
        };
      }
    }
    return {
      ...entity,
      data: { ...entity.data, finance: { skipped: true, reason: 'No NIP available, Perplexity fallback failed or unavailable' } },
    };
  }

  try {
    const cleanNip = nip.replace(/[-\s]/g, '');
    let orgId = `nip${cleanNip}`;
    let costPln = 0;

    // Step 1: Get org data
    let orgData: Record<string, unknown> = {};
    try {
      orgData = rejestrFetch(`/org/${orgId}`, apiKey) as Record<string, unknown>;
      costPln += 0.05;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Handle multi-KRS NIP (409: "Więcej niż jedna organizacja ma ten NIP. Ich numery KRS: [...]")
      const krsMatch = errMsg.match(/numery KRS: \[([^\]]+)\]/);
      if (krsMatch) {
        const krsNumbers = krsMatch[1].split(',').map((s: string) => s.trim());
        let found = false;

        // Try each KRS — pick the first active (non-wykreślona) one
        for (const krs of krsNumbers) {
          try {
            const candidate = rejestrFetch(`/org/${krs}`, apiKey) as Record<string, unknown>;
            costPln += 0.05;
            const stan = (candidate.stan || {}) as Record<string, unknown>;
            if (!stan.czy_wykreslona) {
              orgData = candidate;
              orgId = krs;
              found = true;
              break;
            }
          } catch {
            // try next
          }
        }

        if (!found) {
          return {
            ...entity,
            data: {
              ...entity.data,
              finance: { skipped: true, reason: `Multi-KRS NIP, all entities wykreślone: [${krsNumbers.join(', ')}]` },
            },
          };
        }
      } else {
        return {
          ...entity,
          data: {
            ...entity.data,
            finance: { skipped: true, reason: `Org lookup failed: ${errMsg}` },
          },
        };
      }
    }

    // Extract org info
    const numery = (orgData.numery || {}) as Record<string, string>;
    const nazwy = (orgData.nazwy || {}) as Record<string, string>;
    const stan = (orgData.stan || {}) as Record<string, unknown>;
    const krsNumber = numery.krs || String(orgData.id || '');
    const glownaOsoba = orgData.glowna_osoba as Record<string, string> | null;

    // Step 1b: Get board members + shareholders from krs-powiazania
    let boardMembers: string[] = [];
    let shareholders: Array<{ name: string; role?: string; since?: string }> = [];
    try {
      const powiazania = rejestrFetch(`/org/${orgId}/krs-powiazania`, apiKey) as Array<Record<string, unknown>>;
      costPln += 0.05;
      if (Array.isArray(powiazania)) {
        for (const p of powiazania) {
          const roles = (p.krs_powiazania_kwerendowane || []) as Array<Record<string, string>>;
          const identity = p.tozsamosc as Record<string, string> | undefined;
          const personName = identity?.imiona_i_nazwisko;
          // Organization shareholders (e.g. holding companies)
          const orgNames = p.nazwy as Record<string, string> | undefined;
          const entityName = personName || orgNames?.skrocona || orgNames?.pelna || 'unknown';

          for (const r of roles) {
            if (r.typ === 'KRS_BOARD' && r.kierunek === 'AKTYWNY') {
              boardMembers.push(r.opis ? `${entityName} (${r.opis})` : entityName);
            }
            if (r.typ === 'KRS_SHAREHOLDER' && r.kierunek === 'AKTYWNY') {
              shareholders.push({
                name: entityName,
                role: r.opis || undefined,
                since: r.data_start || undefined,
              });
            }
          }
        }
      }
    } catch {
      // Non-critical — fall back to glowna_osoba
      if (glownaOsoba?.imiona_i_nazwisko) {
        boardMembers = [glownaOsoba.imiona_i_nazwisko];
      }
    }

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

    // Compute ratios for each year
    const statementsWithRatios = yearlyData.map(y => ({
      ...y,
      ratios: computeRatios(y),
    }));

    const latestRatios = statementsWithRatios[0]?.ratios || {};

    // Extract org metadata
    const krsRejestry = (orgData.krs_rejestry || {}) as Record<string, string>;

    // Check if any year has revenue from KRS
    const hasKrsRevenue = yearlyData.some(y => y.revenue != null && y.revenue !== 0);

    // Perplexity fallback when KRS has no revenue data
    let perplexityEstimate: Record<string, unknown> | null = null;
    let costUsdPerplexity = 0;
    if (!hasKrsRevenue) {
      const pplxKey = process.env.PERPLEXITY_API_KEY;
      if (pplxKey) {
        const legalName = nazwy.pelna || nazwy.skrocona || null;
        console.log(`[finance] No KRS revenue for ${entity.name} — calling Perplexity fallback`);
        perplexityEstimate = callPerplexityFinance(
          FINANCE_FALLBACK_PROMPT(entity.name, legalName, cleanNip),
          pplxKey
        );
        costUsdPerplexity = 0.005;
        if (perplexityEstimate) {
          console.log(`[finance] Perplexity fallback returned data (confidence: ${perplexityEstimate.confidence})`);
        }
      } else {
        console.warn(`[finance] No KRS revenue and PERPLEXITY_API_KEY not set — cannot estimate`);
      }
    }

    // Build final revenue figures: KRS first, then Perplexity estimate
    const revenueSource = hasKrsRevenue ? 'krs' : (perplexityEstimate ? 'perplexity-estimate' : 'unavailable');
    const pe = perplexityEstimate || {};

    const financeData: Record<string, unknown> = {
      krs_number: krsNumber,
      org_name: nazwy.pelna || nazwy.skrocona || null,
      org_name_short: nazwy.skrocona || null,
      legal_form: stan.forma_prawna || null,
      nip: cleanNip,
      regon: numery.regon || null,
      registration_date: krsRejestry.rejestr_przedsiebiorcow_data_wpisu || null,
      pkd: stan.pkd_przewazajace_dzial || null,
      address: orgData.adres || null,
      share_capital: latest.shareCapital ?? null,
      status: {
        wykreslona: stan.czy_wykreslona ?? false,
        w_likwidacji: stan.w_likwidacji ?? false,
        w_upadlosci: stan.w_upadlosci ?? false,
        wielkosc: stan.wielkosc || null,
      },
      board_members: boardMembers,
      shareholders,
      financial_statements: statementsWithRatios,
      years_available: periods.length,
      years_fetched: statementsWithRatios.length,
      cost_pln: costPln,
      cost_usd_perplexity: costUsdPerplexity,
      fetchedAt: new Date().toISOString(),
      revenue_source: revenueSource,
      // Top-level figures: KRS data or Perplexity estimates
      revenue: latest.revenue ?? (pe.revenue_2024 as number | null) ?? (pe.estimated_annual_revenue as number | null) ?? null,
      revenuePrevious: latest.revenuePrevious ?? (pe.revenue_2023 as number | null) ?? null,
      netIncome: latest.netIncome ?? (pe.net_income_2024 as number | null) ?? null,
      totalAssets: latest.totalAssets ?? null,
      equity: latest.equity ?? null,
      operatingProfit: latest.operatingProfit ?? null,
      grossProfit: latest.grossProfit ?? null,
      cash: latest.cash ?? null,
      totalLiabilities: latest.totalLiabilities ?? null,
      wages: latest.wages ?? null,
      depreciation: latest.depreciation ?? null,
      ratios: latestRatios,
    };

    // Attach Perplexity estimates as separate block for transparency
    if (perplexityEstimate) {
      financeData.perplexity_estimate = {
        operating_entity_name: pe.operating_entity_name ?? null,
        operating_entity_nip: pe.operating_entity_nip ?? null,
        revenue_2024: pe.revenue_2024 ?? null,
        revenue_2023: pe.revenue_2023 ?? null,
        revenue_2022: pe.revenue_2022 ?? null,
        net_income_2024: pe.net_income_2024 ?? null,
        net_income_2023: pe.net_income_2023 ?? null,
        net_income_2022: pe.net_income_2022 ?? null,
        employee_count: pe.employee_count ?? null,
        estimated_annual_revenue: pe.estimated_annual_revenue ?? null,
        revenue_source_detail: pe.revenue_source ?? null,
        confidence: pe.confidence ?? 'low',
        notes: pe.notes ?? null,
      };
    }

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

/** Parse RZiS (Rachunek zysków i strat) — expanded */
function parseRZiS(doc: Record<string, unknown>): Record<string, unknown> {
  const zawartosc = doc.zawartosc as FinNode | null;
  if (!zawartosc) return {};

  const root = zawartosc.podobiekty || [zawartosc];
  const result: Record<string, unknown> = {};

  // Przychody netto ze sprzedaży
  const revenue = findNode(root, /przychody netto ze sprzeda/i);
  if (revenue) {
    result.revenue = pln(revenue.pln_rok_obrotowy_biezacy);
    result.revenuePrevious = pln(revenue.pln_rok_obrotowy_poprzedni);
  }

  // Koszt własny sprzedaży (COGS)
  const cogs = findNode(root, /koszt.*własn.*sprzeda|koszty sprzedanych/i);
  if (cogs) {
    result.costOfGoodsSold = pln(cogs.pln_rok_obrotowy_biezacy);
  }

  // Zysk (strata) ze sprzedaży — gross profit from sales
  const grossSales = findNode(root, /zysk.*strata.*ze sprzeda[żz]/i)
    || findNode(root, /zysk.*brutto.*sprzeda/i);
  if (grossSales) {
    result.grossProfit = pln(grossSales.pln_rok_obrotowy_biezacy);
    result.grossProfitPrevious = pln(grossSales.pln_rok_obrotowy_poprzedni);
  }

  // Koszty sprzedaży
  const salesCosts = findNode(root, /koszty sprzeda[żz]y/i);
  if (salesCosts) {
    result.salesCosts = pln(salesCosts.pln_rok_obrotowy_biezacy);
  }

  // Koszty ogólnego zarządu
  const adminCosts = findNode(root, /koszty ogólnego zarz/i);
  if (adminCosts) {
    result.adminCosts = pln(adminCosts.pln_rok_obrotowy_biezacy);
  }

  // Zysk/strata z działalności operacyjnej (EBIT)
  const opProfit = findNode(root, /zysk.*strata.*działalności operac/i);
  if (opProfit) {
    result.operatingProfit = pln(opProfit.pln_rok_obrotowy_biezacy);
    result.operatingProfitPrevious = pln(opProfit.pln_rok_obrotowy_poprzedni);
  }

  // Koszty działalności operacyjnej
  const opCosts = findNode(root, /koszty działalności operac/i);
  if (opCosts) {
    result.operatingCosts = pln(opCosts.pln_rok_obrotowy_biezacy);
    result.operatingCostsPrevious = pln(opCosts.pln_rok_obrotowy_poprzedni);
  }

  // Przychody/koszty finansowe
  const finRevenue = findNode(root, /przychody finansowe/i);
  if (finRevenue) result.financialRevenue = pln(finRevenue.pln_rok_obrotowy_biezacy);
  const finCosts = findNode(root, /koszty finansowe/i);
  if (finCosts) result.financialCosts = pln(finCosts.pln_rok_obrotowy_biezacy);

  // Zysk/strata brutto (przed podatkiem)
  const preTax = findNode(root, /zysk.*strata.*brutto(?!.*sprzed)/i);
  if (preTax) {
    result.preTaxProfit = pln(preTax.pln_rok_obrotowy_biezacy);
  }

  // Podatek dochodowy
  const tax = findNode(root, /podatek dochodowy/i);
  if (tax) result.incomeTax = pln(tax.pln_rok_obrotowy_biezacy);

  // Zysk/strata netto
  const netIncome = findNode(root, /zysk.*strata.*netto|zysk netto|strata netto/i);
  if (netIncome) {
    result.netIncome = pln(netIncome.pln_rok_obrotowy_biezacy);
    result.netIncomePrevious = pln(netIncome.pln_rok_obrotowy_poprzedni);
  }

  // Amortyzacja
  const depreciation = findNode(root, /amortyzacja/i);
  if (depreciation) result.depreciation = pln(depreciation.pln_rok_obrotowy_biezacy);

  // Wynagrodzenia
  const wages = findNode(root, /wynagrodzen/i);
  if (wages) result.wages = pln(wages.pln_rok_obrotowy_biezacy);

  return result;
}

/** Parse Bilans — expanded */
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

  // Aktywa trwałe
  const fixedAssets = findNode(root, /aktywa trwałe/i);
  if (fixedAssets) result.fixedAssets = pln(fixedAssets.pln_rok_obrotowy_biezacy);

  // Aktywa obrotowe
  const currentAssets = findNode(root, /aktywa obrotowe/i);
  if (currentAssets) result.currentAssets = pln(currentAssets.pln_rok_obrotowy_biezacy);

  // Zapasy
  const inventory = findNode(root, /zapasy/i);
  if (inventory) result.inventory = pln(inventory.pln_rok_obrotowy_biezacy);

  // Należności krótkoterminowe
  const receivables = findNode(root, /należności krótkoterminowe/i);
  if (receivables) result.receivables = pln(receivables.pln_rok_obrotowy_biezacy);

  // Środki pieniężne (cash)
  const cash = findNode(root, /środki pieniężne|inwestycje krótkoterminowe/i);
  if (cash) result.cash = pln(cash.pln_rok_obrotowy_biezacy);

  // Kapitał własny
  const equity = findNode(root, /kapitał.*własny/i);
  if (equity) {
    result.equity = pln(equity.pln_rok_obrotowy_biezacy);
    result.equityPrevious = pln(equity.pln_rok_obrotowy_poprzedni);
  }

  // Kapitał zakładowy
  const shareCapital = findNode(root, /kapitał.*zakładowy|kapitał.*podstawowy/i);
  if (shareCapital) result.shareCapital = pln(shareCapital.pln_rok_obrotowy_biezacy);

  // Zysk/strata z lat ubiegłych
  const retainedEarnings = findNode(root, /zysk.*strata.*lat ubiegłych|zysk.*strata.*z lat/i);
  if (retainedEarnings) result.retainedEarnings = pln(retainedEarnings.pln_rok_obrotowy_biezacy);

  // Zobowiązania i rezerwy razem
  const liabilities = findNode(root, /zobowiązania.*razem|zobowiązania i rezerwy/i);
  if (liabilities) {
    result.totalLiabilities = pln(liabilities.pln_rok_obrotowy_biezacy);
    result.totalLiabilitiesPrevious = pln(liabilities.pln_rok_obrotowy_poprzedni);
  }

  // Zobowiązania długoterminowe
  const longTermDebt = findNode(root, /zobowiązania długoterminowe/i);
  if (longTermDebt) result.longTermDebt = pln(longTermDebt.pln_rok_obrotowy_biezacy);

  // Zobowiązania krótkoterminowe
  const shortTermDebt = findNode(root, /zobowiązania krótkoterminowe/i);
  if (shortTermDebt) result.shortTermDebt = pln(shortTermDebt.pln_rok_obrotowy_biezacy);

  // Rezerwy na zobowiązania
  const provisions = findNode(root, /rezerwy na zobowiązania/i);
  if (provisions) result.provisions = pln(provisions.pln_rok_obrotowy_biezacy);

  return result;
}

/** Compute financial ratios from yearly data */
function computeRatios(year: Record<string, unknown>): Record<string, number | null> {
  const revenue = year.revenue as number | null;
  const netIncome = year.netIncome as number | null;
  const operatingProfit = year.operatingProfit as number | null;
  const grossProfit = year.grossProfit as number | null;
  const totalAssets = year.totalAssets as number | null;
  const equity = year.equity as number | null;
  const totalLiabilities = year.totalLiabilities as number | null;
  const currentAssets = year.currentAssets as number | null;
  const shortTermDebt = year.shortTermDebt as number | null;
  const revenuePrev = year.revenuePrevious as number | null;

  const ratio = (num: number | null, den: number | null): number | null => {
    if (num == null || den == null || den === 0) return null;
    return Math.round((num / den) * 10000) / 10000;
  };

  return {
    netMargin: ratio(netIncome, revenue),
    operatingMargin: ratio(operatingProfit, revenue),
    grossMargin: ratio(grossProfit, revenue),
    roe: ratio(netIncome, equity),                    // Return on Equity
    roa: ratio(netIncome, totalAssets),                // Return on Assets
    debtToEquity: ratio(totalLiabilities, equity),     // Debt/Equity
    currentRatio: ratio(currentAssets, shortTermDebt), // Current Ratio
    revenueGrowth: revenuePrev && revenue ? Math.round(((revenue - revenuePrev) / revenuePrev) * 10000) / 10000 : null,
  };
}

// ── Perplexity fallback for revenue estimation ──

const FINANCE_FALLBACK_PROMPT = (brandName: string, legalName: string | null, nip: string | null) => `
Jesteś analitykiem finansowym. Podaj dane finansowe firmy cateringowej "${brandName}"${legalName ? ` (nazwa prawna: ${legalName})` : ''}${nip ? ` NIP: ${nip}` : ''} z Polski.

WAŻNE: Wiele marek cateringowych działa pod innym podmiotem prawnym niż marka (np. holding/licencja).
Jeśli ${legalName || brandName} to holding/spółka-matka z zerowymi przychodami, znajdź PODMIOT OPERACYJNY który faktycznie prowadzi catering i podaj JEGO przychody.
Szukaj nazwy operacyjnej spółki w KRS, aleo.com, rejestr.io, InfoVeriti, artykułach prasowych.

Potrzebuję przychody netto ze sprzedaży za 3 ostatnie lata obrotowe (2022, 2023, 2024 lub najbliższe dostępne).

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown):
{
  "operating_entity_name": "<nazwa podmiotu operacyjnego jeśli inna niż ${legalName || brandName}>",
  "operating_entity_nip": "<NIP podmiotu operacyjnego jeśli znaleziony>",
  "revenue_2024": <number|null>,
  "revenue_2023": <number|null>,
  "revenue_2022": <number|null>,
  "net_income_2024": <number|null>,
  "net_income_2023": <number|null>,
  "net_income_2022": <number|null>,
  "employee_count": <number|null>,
  "estimated_annual_revenue": <number|null>,
  "revenue_source": "<skąd ta informacja — link lub nazwa źródła>",
  "confidence": "<high|medium|low>",
  "notes": "<dodatkowe informacje o finansach firmy, struktura właścicielska>"
}

Kwoty w PLN (grosze po kropce). Jeśli znasz tylko przybliżone wartości lub szacunki z artykułów, podaj je z confidence "low".
Jeśli nie masz żadnych danych finansowych, wstaw null wszędzie ale KONIECZNIE opisz w notes co wiesz o skali działalności.
`.trim();

function callPerplexityFinance(prompt: string, apiKey: string): Record<string, unknown> | null {
  const requestBody = {
    model: 'sonar',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  };

  const inputFile = `/tmp/pplx_fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  try {
    const raw = execSync(
      `curl -s -m 60 'https://api.perplexity.ai/chat/completions' -H "Authorization: Bearer ${apiKey}" -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 70000 }
    ).toString('utf-8');

    try { unlinkSync(inputFile); } catch { /* ignore */ }

    const response = JSON.parse(raw);
    if (response.error) {
      console.warn(`[finance] Perplexity error:`, response.error);
      return null;
    }

    const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];

    return JSON.parse(jsonStr.trim());
  } catch (err) {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    console.warn(`[finance] Perplexity fallback failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
