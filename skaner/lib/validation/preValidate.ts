import { runPrompt, parseJsonResponse } from '@/lib/anthropic';
import type {
  ScannerInput,
  ValidationFinding,
  PreValidateResult,
} from '@/types/scanner';
import { fetchPageMeta, type PageMeta } from './meta';
import {
  checkHandleFormat,
  findDuplicateUrls,
  handleFindingFromFormatCheck,
  urlFindingFromMeta,
  duplicateUrlFinding,
} from './checks';
import { buildValidationPrompt, type BrandPromptData } from './prompts';

/**
 * Main pre-validation orchestrator.
 *
 * Flow:
 *  1. Run deterministic checks (handle format, URL duplicates) — instant
 *  2. Fetch meta for all URLs in parallel — ~2-5s
 *  3. Add URL reachability findings from meta results
 *  4. If any URL is reachable → ask Claude Haiku to do semantic check — ~2-4s
 *  5. Merge all findings, decide overall status
 *
 * Total latency target: 5-10s before modal shows.
 */

export async function preValidateScanInput(
  input: ScannerInput
): Promise<PreValidateResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  console.log(`[prevalidate] starting for brand="${input.clientBrand.name}", ${input.competitors.length} competitors`);

  // === Step 1: Deterministic checks (synchronous, instant) ===

  // 1a. Handle format (client + competitors)
  const clientHandleCheck = checkHandleFormat(
    input.clientBrand.socialHandle,
    input.clientBrand.socialPlatform
  );
  const clientHandleFinding = handleFindingFromFormatCheck(
    clientHandleCheck,
    input.clientBrand.name,
    'client',
    undefined
  );
  if (clientHandleFinding) findings.push(clientHandleFinding);

  // Dla konkurentów nie znamy zadeklarowanej platformy — zakładamy tę samą co klient.
  // To jest pragmatyczne założenie (większość userów zostawia default IG).
  input.competitors.forEach((c, i) => {
    const check = checkHandleFormat(c.socialHandle, input.clientBrand.socialPlatform);
    const finding = handleFindingFromFormatCheck(check, c.name, 'competitor', i);
    if (finding) findings.push(finding);
  });

  // 1b. Duplicate URLs
  const duplicates = findDuplicateUrls(input);
  for (const dup of duplicates) {
    findings.push(duplicateUrlFinding(dup));
  }

  // === Step 2: Fetch meta for all URLs in parallel ===

  const urlsToFetch: Array<{
    role: 'client' | 'competitor';
    index?: number;
    name: string;
    url: string;
    socialHandle: string;
    socialPlatform?: 'instagram' | 'facebook' | 'linkedin';
  }> = [
    {
      role: 'client',
      name: input.clientBrand.name,
      url: input.clientBrand.url,
      socialHandle: input.clientBrand.socialHandle,
      socialPlatform: input.clientBrand.socialPlatform,
    },
    ...input.competitors.map((c, i) => ({
      role: 'competitor' as const,
      index: i,
      name: c.name,
      url: c.url,
      socialHandle: c.socialHandle,
    })),
  ];

  const metaStart = Date.now();
  const metas: PageMeta[] = await Promise.all(
    urlsToFetch.map((entry) => fetchPageMeta(entry.url))
  );
  console.log(`[prevalidate] meta fetch done in ${((Date.now() - metaStart) / 1000).toFixed(1)}s`);

  // === Step 3: URL reachability findings ===

  metas.forEach((meta, idx) => {
    const entry = urlsToFetch[idx];
    const finding = urlFindingFromMeta(meta, entry.name, entry.role, entry.index);
    if (finding) findings.push(finding);
  });

  // === Step 4: Semantic check with Claude Haiku ===

  // Puszczamy semantic check tylko jeśli mamy JAKIEŚ reachable URL-e — bez tego
  // Claude nie ma na czym pracować i zmarnujemy tokeny na halucynacje.
  const brandsForClaude: BrandPromptData[] = urlsToFetch.map((entry, idx) => ({
    role: entry.role,
    index: entry.index,
    name: entry.name,
    url: entry.url,
    socialHandle: entry.socialHandle,
    socialPlatform: entry.socialPlatform,
    meta: metas[idx],
  }));

  const anyReachable = brandsForClaude.some(
    (b) => b.meta.reachable && (b.meta.title || b.meta.description || b.meta.h1)
  );

  if (anyReachable) {
    try {
      const semanticStart = Date.now();
      const prompt = buildValidationPrompt(input, brandsForClaude);
      const raw = await runPrompt(prompt, 'claude-haiku-4-5-20251001');

      interface SemanticResponse {
        findings?: Array<{
          brand: string;
          role: 'client' | 'competitor';
          competitorIndex?: number | null;
          field: 'url' | 'socialHandle' | 'brandName';
          severity: 'error' | 'warning' | 'info';
          issue: string;
          suggestion: string | null;
          confidence: number;
          rationale?: string;
        }>;
      }

      const parsed = parseJsonResponse<SemanticResponse>(raw);
      const semanticFindings = parsed.findings || [];
      console.log(`[prevalidate] semantic check done in ${((Date.now() - semanticStart) / 1000).toFixed(1)}s, ${semanticFindings.length} findings`);

      for (const f of semanticFindings) {
        // Filtruj niskiej pewności findings żeby nie straszyć usera drobiazgami
        if (f.confidence < 0.5) continue;

        // Deduplikacja: jeśli deterministyczny check już zgłosił ten sam field dla tej marki,
        // pomijamy semantic finding (deterministyczne są bardziej autorytatywne)
        const alreadyReported = findings.some(
          (existing) =>
            existing.brand === f.brand &&
            existing.field === f.field &&
            existing.source !== 'semantic'
        );
        if (alreadyReported) continue;

        findings.push({
          brand: f.brand,
          role: f.role,
          competitorIndex: f.competitorIndex ?? undefined,
          field: f.field,
          severity: f.severity,
          issue: f.issue,
          suggestion: f.suggestion,
          confidence: f.confidence,
          rationale: f.rationale,
          source: 'semantic',
        });
      }
    } catch (err) {
      // Semantic check padł — nie blokujemy całej walidacji
      console.error('[prevalidate] semantic check failed:', err);
    }
  } else {
    console.log(`[prevalidate] skipping semantic check — no reachable URLs with meta`);
  }

  // === Step 5: Decide overall status ===

  const hasError = findings.some((f) => f.severity === 'error');
  const hasWarning = findings.some((f) => f.severity === 'warning');

  const status: PreValidateResult['status'] = hasError
    ? 'errors'
    : hasWarning
      ? 'warnings'
      : findings.length > 0
        ? 'warnings' // tylko info → pokaż modal ale z łagodnym tonem
        : 'ok';

  // Sortowanie: errors → warnings → info; w obrębie severity — klient przed konkurentami
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => {
    const sev = severityOrder[a.severity] - severityOrder[b.severity];
    if (sev !== 0) return sev;
    if (a.role !== b.role) return a.role === 'client' ? -1 : 1;
    return (a.competitorIndex ?? 0) - (b.competitorIndex ?? 0);
  });

  const durationMs = Date.now() - startTime;
  console.log(`[prevalidate] done in ${durationMs}ms — status=${status}, ${findings.length} findings (${findings.filter(f => f.severity === 'error').length}E / ${findings.filter(f => f.severity === 'warning').length}W / ${findings.filter(f => f.severity === 'info').length}I)`);

  return {
    status,
    findings,
    checkedAt: new Date().toISOString(),
    durationMs,
  };
}
