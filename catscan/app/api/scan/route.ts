import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { saveScan, getScan, getScans, mergeScanIntoBrands } from '@/lib/db/store';
import type { ScanRecord, EntityRecord } from '@/lib/db/store';
import { crawlEntity } from '@/lib/pipeline/phases/crawl';
import { extractEntity } from '@/lib/pipeline/phases/extract';
import { discoverEntity } from '@/lib/pipeline/phases/discovery';
import { enrichSocial } from '@/lib/pipeline/phases/social';
import { enrichAds } from '@/lib/pipeline/phases/ads';
import { enrichReviews } from '@/lib/pipeline/phases/reviews';
import { enrichFinance } from '@/lib/pipeline/phases/finance';
import { enrichContext } from '@/lib/pipeline/phases/context';
import { interpretDataset } from '@/lib/pipeline/phases/interpret';
import { enrichPricingFallback } from '@/lib/pipeline/phases/pricing-fallback';
import { extractVisualIdentity } from '@/lib/pipeline/phases/visual';

// All phases in order. Context before discovery (provides legalName for rejestr.io).
// Visual runs after crawl (needs URL), uses Apify screenshot + Haiku vision.
const ALL_PHASES = [
  'crawl', 'extract', 'visual', 'context', 'pricing_fallback', 'discovery',
  'social', 'ads', 'reviews', 'finance', 'interpret'
];

/** POST /api/scan — start a new scan, resume, or batch from unscanned brands */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companies, phases, resume: resumeScanId, batch, rescan_incomplete } = body as {
    companies?: Array<{ name: string; url: string; nip?: string }>;
    phases?: string[];
    resume?: string;  // scan ID to resume
    batch?: number;   // pull N unscanned brands from SQLite
    rescan_incomplete?: boolean;  // re-scan brands with <19 dimensions
  };

  // --- RESUME MODE ---
  if (resumeScanId) {
    const existing = getScan(resumeScanId);
    if (!existing) {
      return NextResponse.json({ error: `Scan ${resumeScanId} not found` }, { status: 404 });
    }
    if (existing.status === 'completed') {
      return NextResponse.json({ error: 'Scan already completed', scanId: resumeScanId }, { status: 400 });
    }
    if (existing.status === 'running') {
      return NextResponse.json({ error: 'Scan already running (if stuck, PATCH to reset)', scanId: resumeScanId }, { status: 409 });
    }

    // Determine which phases still need to run
    const enabledPhases = phases || ALL_PHASES;
    const remainingPhases = enabledPhases.filter(p => !existing.phasesCompleted.includes(p));

    existing.status = 'running';
    log(existing, `--- RESUME --- phases done: [${existing.phasesCompleted.join(', ')}], remaining: [${remainingPhases.join(', ')}]`);
    saveScan(existing);

    runPipeline(resumeScanId, remainingPhases).catch((err) => {
      const s = getScan(resumeScanId);
      if (s) {
        s.status = 'failed';
        log(s, `Pipeline error: ${err.message}`);
        saveScan(s);
      }
    });

    const done = existing.entities.filter(e => e.status !== 'pending').length;
    return NextResponse.json({
      scanId: resumeScanId,
      status: 'resuming',
      entityCount: existing.entities.length,
      entitiesProcessed: done,
      phasesCompleted: existing.phasesCompleted,
      remainingPhases,
    });
  }

  // --- RESCAN INCOMPLETE: find brands with <19 dimensions and re-scan them ---
  if (rescan_incomplete) {
    const { db: sqlDb } = await import('@/lib/db/sqlite');
    const EXPECTED_DIMS = [
      'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
      'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
      'customer_acquisition', 'differentiators', 'visual_identity', 'context',
      'social', 'ads', 'reviews', 'finance',
    ];

    const rows = sqlDb.prepare(`
      SELECT b.slug, b.name, b.url, sr.data
      FROM brands b
      JOIN scan_results sr ON b.slug = sr.slug
    `).all() as Array<{ slug: string; name: string; url: string; data: string }>;

    const incomplete: Array<{ name: string; url: string; missing: string[] }> = [];
    for (const row of rows) {
      const data = JSON.parse(row.data);
      const dims = Object.keys(data).filter((k: string) => !k.startsWith('_'));
      const missing = EXPECTED_DIMS.filter(d => !dims.includes(d));
      if (missing.length > 0) {
        incomplete.push({ name: row.name, url: row.url, missing });
      }
    }

    if (incomplete.length === 0) {
      return NextResponse.json({ message: 'All scanned brands are complete (19/19 dimensions)', status: 'all_complete' });
    }

    // Create scan for incomplete brands — run ALL phases (resume logic will skip already-done phases)
    const scanId = randomUUID();
    const entities: EntityRecord[] = incomplete.map((c) => ({
      id: randomUUID(),
      name: c.name,
      url: c.url,
      nip: undefined,
      domain: undefined,
      data: {},
      status: 'pending' as const,
      errors: [],
    }));

    const scan: ScanRecord = {
      id: scanId,
      status: 'running',
      sectorId: 'catering-pl',
      entities,
      phasesCompleted: [],
      currentPhase: 'crawl',
      log: [],
      totalCostUsd: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    log(scan, `RESCAN_INCOMPLETE — ${incomplete.length} brands with missing dimensions`);
    for (const c of incomplete) {
      log(scan, `  ${c.name}: missing [${c.missing.join(', ')}]`);
    }
    saveScan(scan);

    runPipeline(scanId, ALL_PHASES).catch((err) => {
      const s = getScan(scanId);
      if (s) {
        s.status = 'failed';
        log(s, `Pipeline error: ${err.message}`);
        saveScan(s);
      }
    });

    return NextResponse.json({
      scanId,
      status: 'running',
      mode: 'rescan_incomplete',
      entityCount: incomplete.length,
      brands: incomplete.map(c => ({ name: c.name, missing: c.missing })),
    });
  }

  // --- BATCH MODE: pull next N unscanned brands from SQLite ---
  if (batch && batch > 0) {
    const batchSize = Math.min(batch, 20); // hard cap at 20
    const { db } = await import('@/lib/db/sqlite');
    const unscanned = db.prepare(`
      SELECT b.slug, b.name, b.url, b.domain
      FROM brands b
      LEFT JOIN scan_results sr ON b.slug = sr.slug
      WHERE sr.slug IS NULL AND b.url IS NOT NULL AND b.url != ''
      ORDER BY b.slug
      LIMIT ?
    `).all(batchSize) as Array<{ slug: string; name: string; url: string; domain: string }>;

    if (unscanned.length === 0) {
      const total = (db.prepare('SELECT COUNT(*) as c FROM brands').get() as { c: number }).c;
      const scanned = (db.prepare('SELECT COUNT(*) as c FROM scan_results').get() as { c: number }).c;
      return NextResponse.json({ message: `All brands scanned (${scanned}/${total})`, status: 'all_done' });
    }

    // Convert to companies array and fall through to normal scan creation
    const batchCompanies = unscanned.map(b => ({ name: b.name, url: b.url }));

    const enabledPhases = phases || ALL_PHASES;
    const scanId = randomUUID();
    const entities: EntityRecord[] = batchCompanies.map((c) => ({
      id: randomUUID(),
      name: c.name,
      url: c.url,
      nip: undefined,
      domain: undefined,
      data: {},
      status: 'pending' as const,
      errors: [],
    }));

    const scan: ScanRecord = {
      id: scanId,
      status: 'running',
      sectorId: 'catering-pl',
      entities,
      phasesCompleted: [],
      currentPhase: 'crawl',
      log: [],
      totalCostUsd: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    log(scan, `BATCH scan started — ${entities.length} entities (batch mode), phases: ${enabledPhases.join(', ')}`);
    saveScan(scan);

    runPipeline(scanId, enabledPhases).catch((err) => {
      const s = getScan(scanId);
      if (s) {
        s.status = 'failed';
        log(s, `Pipeline error: ${err.message}`);
        saveScan(s);
      }
    });

    return NextResponse.json({
      scanId,
      status: 'running',
      mode: 'batch',
      entityCount: entities.length,
      brands: batchCompanies.map(c => c.name),
    });
  }

  // --- NEW SCAN MODE ---
  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return NextResponse.json(
      { error: 'Provide companies array with name and url, or resume: scanId, or batch: N' },
      { status: 400 }
    );
  }

  const enabledPhases = phases || ALL_PHASES;

  const scanId = randomUUID();
  const entities: EntityRecord[] = companies.map((c) => ({
    id: randomUUID(),
    name: c.name,
    url: c.url,
    nip: c.nip,
    domain: undefined,
    data: {},
    status: 'pending' as const,
    errors: [],
  }));

  const scan: ScanRecord = {
    id: scanId,
    status: 'running',
    sectorId: 'catering-pl',
    entities,
    phasesCompleted: [],
    currentPhase: 'crawl',
    log: [],
    totalCostUsd: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  log(scan, `Scan started — ${entities.length} entities, phases: ${enabledPhases.join(', ')}`);
  saveScan(scan);

  // Run pipeline async (don't await — return immediately)
  runPipeline(scanId, enabledPhases).catch((err) => {
    const s = getScan(scanId);
    if (s) {
      s.status = 'failed';
      log(s, `Pipeline error: ${err.message}`);
      saveScan(s);
    }
  });

  return NextResponse.json({ scanId, status: 'running', entityCount: entities.length });
}

/** PATCH /api/scan — reset a stuck 'running' scan so it can be resumed */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { scanId } = body as { scanId: string };

  if (!scanId) {
    return NextResponse.json({ error: 'Provide scanId' }, { status: 400 });
  }

  const scan = getScan(scanId);
  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  if (scan.status !== 'running') {
    return NextResponse.json({ error: `Scan is ${scan.status}, not stuck` }, { status: 400 });
  }

  scan.status = 'failed';
  log(scan, `--- RESET: marked as failed (was stuck at ${scan.currentPhase}) ---`);
  saveScan(scan);

  return NextResponse.json({
    scanId,
    status: 'failed',
    currentPhase: scan.currentPhase,
    phasesCompleted: scan.phasesCompleted,
    message: 'Scan reset to failed. POST with { resume: scanId } to continue.',
  });
}

/** GET /api/scan — list all scans */
export async function GET(req: NextRequest) {
  const full = req.nextUrl.searchParams.get('full') === '1';
  const scans = getScans().map((s) => ({
    id: s.id,
    status: s.status,
    entityCount: s.entities.length,
    phasesCompleted: s.phasesCompleted,
    currentPhase: s.currentPhase,
    totalCostUsd: s.totalCostUsd,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    // Include entities (without rawHtml) when ?full=1
    ...(full ? {
      entities: s.entities.map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        domain: e.domain,
        nip: e.nip,
        krs: e.krs,
        status: e.status,
        errors: e.errors,
        data: e.data,
        financials: e.financials,
      })),
    } : {}),
  }));
  return NextResponse.json(scans);
}

// --- Pipeline execution ---

function log(scan: ScanRecord, message: string) {
  const timestamp = new Date().toISOString().slice(11, 19);
  scan.log.push(`[${timestamp}] ${message}`);
}

/**
 * Check if an entity already has data from a given phase.
 * Used for resume: skip entities that were already processed before crash.
 */
function entityHasPhaseData(entity: EntityRecord, phaseName: string): boolean {
  const d = entity.data as Record<string, unknown>;
  switch (phaseName) {
    case 'crawl':           return !!d._meta;
    case 'extract':         return !!d._extraction;
    case 'visual':          return !!(d.visual_identity && !(d.visual_identity as Record<string, unknown>).skipped);
    case 'context':         return !!d.context;
    case 'pricing_fallback': return !!(d.pricing && (d.pricing as Record<string, unknown>)._pricing_fallback_done);
    case 'discovery':       return !!d._discovery;
    case 'social':          return !!(d.social && !(d.social as Record<string, unknown>).skipped);
    case 'ads':             return !!d.ads;
    case 'reviews':         return !!d.reviews;
    case 'finance':         return !!(d.finance && !(d.finance as Record<string, unknown>).skipped);
    default:                return false;
  }
}

/** Run a phase for each entity, with logging and error handling */
async function runEntityPhase(
  scan: ScanRecord,
  phaseName: string,
  fn: (entity: EntityRecord) => Promise<EntityRecord>,
  opts?: { skipFailed?: boolean; requireKey?: string }
) {
  scan.currentPhase = phaseName;
  log(scan, `--- PHASE: ${phaseName.toUpperCase()} ---`);
  saveScan(scan);

  if (opts?.requireKey && !process.env[opts.requireKey]) {
    log(scan, `${opts.requireKey} not set — skipping ${phaseName}`);
    scan.phasesCompleted.push(phaseName);
    saveScan(scan);
    return;
  }

  // Count how many entities already have data from this phase (resume)
  const alreadyDone = scan.entities.filter(e => entityHasPhaseData(e, phaseName)).length;
  if (alreadyDone > 0) {
    log(scan, `Resuming: ${alreadyDone}/${scan.entities.length} entities already have ${phaseName} data`);
  }

  for (let i = 0; i < scan.entities.length; i++) {
    const entity = scan.entities[i];
    if (opts?.skipFailed && entity.status === 'failed') {
      log(scan, `Skipping ${entity.name} (previous failure)`);
      continue;
    }

    // Skip entities that already have data from this phase (resume support)
    if (entityHasPhaseData(entity, phaseName)) {
      continue;
    }

    log(scan, `[${phaseName}] ${entity.name}...`);
    saveScan(scan);

    try {
      scan.entities[i] = await fn(entity);

      // Track costs from all phases
      const eData = scan.entities[i].data as Record<string, unknown>;
      const ext = eData._extraction as Record<string, number> | undefined;
      if (ext?.costUsd) scan.totalCostUsd += ext.costUsd;
      // Aggregate _cost_* fields (context, pricing, discovery, social, reviews, finance)
      const costKey = `_cost_${phaseName}`;
      const phaseCost = eData[costKey] as Record<string, number> | undefined;
      if (phaseCost?.usd) scan.totalCostUsd += phaseCost.usd;
      // Finance tracks in PLN, convert
      if (phaseName === 'finance') {
        const fin = eData.finance as Record<string, number> | undefined;
        if (fin?.cost_pln) scan.totalCostUsd += fin.cost_pln * 0.25;
      }

      const e = scan.entities[i];
      const newStatus = e.status;
      const lastError = e.errors[e.errors.length - 1];

      // Phase-specific diagnostics
      let detail = '';
      const d = e.data as Record<string, unknown>;
      if (phaseName === 'crawl') {
        const meta = d._meta as Record<string, unknown> | undefined;
        detail = meta ? `${meta.contentLength} chars, ${meta.subpagesCrawled} subpages` : '';
        const socials = d._social_urls as Record<string, string> | undefined;
        if (socials) detail += `, social: ${Object.keys(socials).join('+')}`;
        const contact = d._contact_raw as Record<string, string> | undefined;
        if (contact?.nip) detail += `, NIP: ${contact.nip}`;
      } else if (phaseName === 'extract') {
        const ext = d._extraction as Record<string, number> | undefined;
        detail = ext ? `$${ext.costUsd?.toFixed(4)}` : '';
      } else if (phaseName === 'visual') {
        const vis = d.visual_identity as Record<string, unknown> | undefined;
        if (vis?.skipped) detail = `skipped: ${vis.reason}`;
        else if (vis) detail = `aesthetic: ${vis.overall_aesthetic}, quality: ${vis.visual_quality_score}/10, colors: ${(vis.dominant_colors as string[] || []).length}`;
      } else if (phaseName === 'social') {
        const social = d.social as Record<string, unknown> | undefined;
        if (social) detail = `${social.platformCount} platforms, ${social.totalFollowers} followers`;
      } else if (phaseName === 'ads') {
        const ads = d.ads as Record<string, unknown> | undefined;
        if (ads) detail = `${ads.activeAdsCount} active ads, intensity: ${ads.estimatedIntensity}`;
      } else if (phaseName === 'reviews') {
        const rev = d.reviews as Record<string, Record<string, unknown>> | undefined;
        if (rev) {
          const gRating = rev.google?.rating;
          const dRating = rev.dietly?.rating;
          const parts: string[] = [];
          if (gRating) parts.push(`Google: ${gRating}★`);
          if (dRating) parts.push(`Dietly: ${dRating}★`);
          detail = parts.length ? parts.join(', ') : 'no rating found';
        }
      } else if (phaseName === 'discovery') {
        const disc = d._discovery as Record<string, unknown> | undefined;
        if (disc) detail = `NIP: ${disc.nip || 'not found'} (${disc.nipSource})`;
      } else if (phaseName === 'context') {
        const ctx = d.context as Record<string, unknown> | undefined;
        if (ctx) {
          const parts: string[] = [];
          if (ctx.founder) parts.push(`founder: ${ctx.founder}`);
          if (ctx.foundedYear) parts.push(`est. ${ctx.foundedYear}`);
          if (ctx.trajectory) parts.push(`${ctx.trajectory}`);
          detail = parts.join(', ');
        }
      } else if (phaseName === 'pricing_fallback') {
        const pricing = d.pricing as Record<string, unknown> | undefined;
        if (pricing?._fallback) detail = `filled via perplexity: ${pricing.price_range_pln}`;
        else if (pricing?.cheapest_daily) detail = `already had: ${pricing.price_range_pln}`;
        else detail = 'no price found';
      } else if (phaseName === 'finance') {
        const fin = d.finance as Record<string, unknown> | undefined;
        if (fin?.skipped) detail = `skipped: ${fin.reason}`;
        else if (fin) detail = `${fin.years_fetched} years fetched, revenue: ${fin.revenue ?? 'n/a'}`;
      }

      log(scan, `  → ${newStatus === 'failed' ? 'FAILED: ' + (lastError || 'unknown') : 'OK'}${detail ? ' | ' + detail : ''}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      scan.entities[i].errors.push(`${phaseName}: ${msg}`);
      log(scan, `  → ERROR: ${msg}`);
    }

    saveScan(scan);
  }

  scan.phasesCompleted.push(phaseName);
  saveScan(scan);

  // Persist partial results to brands.json after each phase
  // So even if the server crashes mid-pipeline, completed phases are saved
  mergeScanIntoBrands(scan);
}

async function runPipeline(scanId: string, enabledPhases: string[]) {
  const scan = getScan(scanId)!;
  const has = (phase: string) => enabledPhases.includes(phase);

  // Phase 1: Crawl websites (get HTML, social URLs, NIP from footer)
  if (has('crawl')) {
    await runEntityPhase(scan, 'crawl', crawlEntity);
  }

  // Phase 2: Extract structured data via LLM (pricing, menu, delivery, etc.)
  if (has('extract')) {
    await runEntityPhase(scan, 'extract', extractEntity, {
      skipFailed: true,
      requireKey: 'ANTHROPIC_API_KEY',
    });
  }

  // Phase 2b: Visual identity — screenshot + Claude vision
  if (has('visual')) {
    await runEntityPhase(scan, 'visual', extractVisualIdentity, {
      skipFailed: true,
      requireKey: 'APIFY_API_TOKEN',
    });
  }

  // Phase 3: Perplexity context — BEFORE discovery!
  // Gets legalName + NIP + founder + trajectory via AI search.
  // Discovery then uses legalName to search rejestr.io accurately.
  if (has('context')) {
    await runEntityPhase(scan, 'context', enrichContext, {
      skipFailed: true,
      requireKey: 'PERPLEXITY_API_KEY',
    });
  }

  // Phase 3b: Pricing fallback — Dietly API (free) + Perplexity (non-Dietly)
  if (has('pricing_fallback')) {
    await runEntityPhase(scan, 'pricing_fallback', enrichPricingFallback, {
      skipFailed: true,
      // No requireKey — Dietly brands use free API, Perplexity only for non-Dietly
    });
  }

  // Phase 4: Discover NIP/KRS via rejestr.io
  // Uses context.legalName (brand→legal name bridge) for accurate search.
  // Falls back to brand name, then crawled legal pages.
  if (has('discovery')) {
    await runEntityPhase(scan, 'discovery', discoverEntity, {
      skipFailed: true,
    });
  }

  // Phase 5: Social media profiles (Apify required)
  if (has('social')) {
    await runEntityPhase(scan, 'social', enrichSocial, {
      skipFailed: true,
      requireKey: 'APIFY_API_TOKEN',
    });
  }

  // Phase 6: Meta Ads
  if (has('ads')) {
    await runEntityPhase(scan, 'ads', enrichAds, {
      skipFailed: true,
    });
  }

  // Phase 7: Google Reviews
  if (has('reviews')) {
    await runEntityPhase(scan, 'reviews', enrichReviews, {
      skipFailed: true,
    });
  }

  // Phase 8: KRS + Financial data (needs NIP from discovery)
  if (has('finance')) {
    await runEntityPhase(scan, 'finance', enrichFinance, {
      skipFailed: true,
      requireKey: 'REJESTR_IO_API_KEY',
    });
  }

  // Phase 8: Sector interpretation (runs once on full dataset, not per-entity)
  if (has('interpret')) {
    scan.currentPhase = 'interpret';
    log(scan, '--- PHASE: INTERPRET ---');
    saveScan(scan);

    if (!process.env.ANTHROPIC_API_KEY) {
      log(scan, 'ANTHROPIC_API_KEY not set — skipping interpretation');
    } else {
      log(scan, 'Generating sector report via Claude Sonnet...');
      saveScan(scan);

      const interpretation = await interpretDataset(scan.entities);
      if (interpretation) {
        scan.totalCostUsd += interpretation.costUsd;
        // Store report on scan record (not on individual entities)
        scan.interpretation = interpretation as unknown as Record<string, unknown>;
        log(scan, `  → report generated ($${interpretation.costUsd.toFixed(4)}, ${interpretation.inputTokens + interpretation.outputTokens} tokens)`);
      } else {
        log(scan, '  → no data to interpret');
      }
    }

    scan.phasesCompleted.push('interpret');
    saveScan(scan);
  }

  // Done — clean up and finalize
  scan.currentPhase = null;
  scan.status = 'completed';
  scan.completedAt = new Date().toISOString();

  // Strip rawHtml from stored entities (save space)
  scan.entities = scan.entities.map((e) => ({ ...e, rawHtml: undefined }));

  const succeeded = scan.entities.filter((e) => e.status !== 'failed').length;
  log(scan, `--- SCAN COMPLETE: ${succeeded}/${scan.entities.length} entities, $${scan.totalCostUsd.toFixed(4)} ---`);

  // Persist results into brands DB (survives redeploy)
  const merged = mergeScanIntoBrands(scan);
  log(scan, `--- MERGED: ${merged} brands updated ---`);

  // Post-scan validation: check completeness
  const EXPECTED_DIMS = [
    'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
    'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
    'customer_acquisition', 'differentiators', 'visual_identity', 'context',
    'social', 'ads', 'reviews', 'finance',
  ];
  let incomplete = 0;
  for (const entity of scan.entities) {
    const dims = Object.keys(entity.data).filter(k => !k.startsWith('_'));
    const missing = EXPECTED_DIMS.filter(d => !dims.includes(d));
    if (missing.length > 0) {
      incomplete++;
      // Find related errors for each missing dimension
      const reasons: string[] = [];
      for (const dim of missing) {
        // Map dimension → phase name(s) that produce it
        const relatedErrors = entity.errors.filter((e: string) => {
          const el = e.toLowerCase();
          if (dim === 'social' || dim === 'social_proof') return el.includes('social');
          if (dim === 'ads') return el.includes('ads') || el.includes('meta');
          if (dim === 'finance') return el.includes('finance') || el.includes('krs') || el.includes('rejestr');
          if (dim === 'reviews') return el.includes('review') || el.includes('google');
          if (dim === 'context') return el.includes('context') || el.includes('perplexity');
          if (dim === 'visual_identity') return el.includes('visual') || el.includes('screenshot');
          if (dim === 'pricing') return el.includes('pricing') || el.includes('dietly');
          return el.includes(dim.replace('_', ''));
        });
        if (relatedErrors.length > 0) {
          reasons.push(`${dim}: ${relatedErrors[0]}`);
        }
      }
      log(scan, `⚠ INCOMPLETE: ${entity.name} — missing ${missing.length}: [${missing.join(', ')}]`);
      if (reasons.length > 0) {
        for (const r of reasons) {
          log(scan, `    ↳ ${r}`);
        }
      } else if (entity.errors.length > 0) {
        log(scan, `    ↳ errors during scan: ${entity.errors.join(' | ')}`);
      } else {
        log(scan, `    ↳ no errors recorded — phase may have returned empty data`);
      }
    }
  }
  if (incomplete === 0) {
    log(scan, `✓ VALIDATION: all ${succeeded} entities have ${EXPECTED_DIMS.length}/19 dimensions`);
  } else {
    log(scan, `⚠ VALIDATION: ${incomplete}/${succeeded} entities incomplete — use rescan_incomplete to fix`);
  }

  saveScan(scan);
}
