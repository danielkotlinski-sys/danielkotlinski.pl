import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { saveScan, getScan, getScans, mergeScanIntoBrands } from '@/lib/db/store';
import { DB_PATH } from '@/lib/db/sqlite';
import type { ScanRecord, EntityRecord } from '@/lib/db/store';
import { crawlEntity } from '@/lib/pipeline/phases/crawl';
import { extractEntity } from '@/lib/pipeline/phases/extract';
import { discoverEntity } from '@/lib/pipeline/phases/discovery';
import { enrichSocial } from '@/lib/pipeline/phases/social';
import { enrichAds } from '@/lib/pipeline/phases/ads';
import { enrichReviews } from '@/lib/pipeline/phases/reviews';
import { enrichFinance } from '@/lib/pipeline/phases/finance';
import { enrichContext } from '@/lib/pipeline/phases/context';
import { computeSectorStats, createScorecardEnricher } from '@/lib/pipeline/phases/scorecard';
import { enrichPricingFallback } from '@/lib/pipeline/phases/pricing-fallback';
import { extractVisualIdentity } from '@/lib/pipeline/phases/visual';
import { analyzeVideo } from '@/lib/pipeline/phases/video';
import { analyzeYouTubeReviews } from '@/lib/pipeline/phases/youtube-reviews';
import { enrichInfluencerPress } from '@/lib/pipeline/phases/influencer-press';
import { enrichInfluencerIg } from '@/lib/pipeline/phases/influencer-ig';
import { enrichGoogleAds } from '@/lib/pipeline/phases/google-ads';

// All phases in order. Context before discovery (provides legalName for rejestr.io).
// Visual runs after crawl (needs URL), uses Apify screenshot + Haiku vision.
// Video runs after social (needs post URLs), uses yt-dlp + Gemini + Sonnet.
const ALL_PHASES = [
  'crawl', 'extract', 'visual', 'context', 'pricing_fallback', 'discovery',
  'social', 'video', 'youtube_reviews', 'ads', 'google_ads', 'reviews', 'finance', 'influencer_press', 'influencer_ig', 'scorecard'
];

/** POST /api/scan — start a new scan, resume, or batch from unscanned brands */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companies, phases, resume: resumeScanId, batch, rescan_incomplete, slugs } = body as {
    companies?: Array<{ name: string; url: string; nip?: string }>;
    phases?: string[];
    resume?: string;  // scan ID to resume
    batch?: number;   // pull N unscanned brands from SQLite
    rescan_incomplete?: boolean;  // re-scan brands with <19 dimensions
    slugs?: string[];  // scan specific brands by slug
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
      'video', 'youtube_reviews', 'google_ads', 'influencer_press', 'influencer_ig',
    ];

    const rows = sqlDb.prepare(`
      SELECT b.slug, b.name, b.url, sr.data
      FROM brands b
      JOIN scan_results sr ON b.slug = sr.slug
    `).all() as Array<{ slug: string; name: string; url: string; data: string }>;

    const incomplete: Array<{ name: string; url: string; missing: string[]; data: Record<string, unknown> }> = [];
    for (const row of rows) {
      const data = JSON.parse(row.data);
      const dims = Object.keys(data).filter((k: string) => !k.startsWith('_'));
      const missing = EXPECTED_DIMS.filter(d => !dims.includes(d));
      if (missing.length > 0) {
        incomplete.push({ name: row.name, url: row.url, missing, data });
      }
    }

    if (incomplete.length === 0) {
      return NextResponse.json({ message: `All scanned brands are complete (${EXPECTED_DIMS.length}/${EXPECTED_DIMS.length} dimensions)`, status: 'all_complete' });
    }

    // Create scan for incomplete brands — run ALL phases (resume logic will skip already-done phases)
    // Load existing data so dependent phases (e.g. video needs social) work
    const scanId = randomUUID();
    const entities: EntityRecord[] = incomplete.map((c) => ({
      id: randomUUID(),
      name: c.name,
      url: c.url,
      nip: undefined,
      domain: undefined,
      data: c.data,
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

  // --- CUSTOM RANGE: scan specific brands by slug ---
  if (slugs && Array.isArray(slugs) && slugs.length > 0) {
    if (slugs.length > 20) {
      return NextResponse.json({ error: `Max 20 brands per scan, got ${slugs.length}` }, { status: 400 });
    }
    const { stmts: sqlStmts } = await import('@/lib/db/sqlite');
    const selectedBrands = slugs.map(s => sqlStmts.getBrand.get(s) as { slug: string; name: string; url: string; domain: string } | undefined).filter(Boolean) as Array<{ slug: string; name: string; url: string; domain: string }>;

    if (selectedBrands.length === 0) {
      return NextResponse.json({ error: 'No matching brands found for provided slugs' }, { status: 404 });
    }

    const enabledPhases = phases || ALL_PHASES;
    const scanId = randomUUID();
    const entities: EntityRecord[] = selectedBrands.map(b => {
      // Load existing scan data so dependent phases (e.g. video needs social) work
      const existingRow = sqlStmts.getScanResult.get(b.slug) as { data: string } | undefined;
      const existingData = existingRow ? JSON.parse(existingRow.data) : {};
      return {
        id: randomUUID(),
        name: b.name,
        url: b.url,
        nip: undefined,
        domain: b.domain,
        data: existingData,
        status: 'pending' as const,
        errors: [],
      };
    });

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

    log(scan, `CUSTOM scan started — ${entities.length} brands: [${selectedBrands.map(b => b.slug).join(', ')}], phases: [${enabledPhases.join(', ')}]`);
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
      mode: 'custom',
      entityCount: entities.length,
      phases: enabledPhases,
      brands: selectedBrands.map(b => b.name),
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
    case 'video': {
      const vid = d.video as Record<string, unknown> | undefined;
      if (!vid || vid.skipped) return false;
      // Treat 0 analyzed as incomplete — worth retrying
      return (vid.analyzed_count as number) > 0;
    }
    case 'youtube_reviews': {
      const ytr = d.youtube_reviews as Record<string, unknown> | undefined;
      if (!ytr || ytr.skipped) return false;
      // Treat 0 analyzed as incomplete — worth retrying
      return (ytr.reviews_analyzed as number) > 0;
    }
    case 'google_ads':      return !!(d.google_ads && !(d.google_ads as Record<string, unknown>).skipped);
    case 'influencer_press': return !!d.influencer_press;
    case 'influencer_ig':   return !!(d.influencer_ig && !(d.influencer_ig as Record<string, unknown>).skipped);
    case 'scorecard':       return !!(d.scorecard && !(d.scorecard as Record<string, unknown>).skipped);
    case 'ads':             return !!d.ads;
    case 'reviews':         return !!d.reviews;
    case 'finance':         return !!(d.finance && !(d.finance as Record<string, unknown>).skipped);
    default:                return false;
  }
}

/** Run a phase for each entity, with logging, error handling, and circuit breaker */
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

  // Circuit breaker: if the same phase throws N consecutive REAL errors (not "no data"),
  // it's likely a systemic issue (API down, key expired, rate limit). Stop early.
  const CIRCUIT_BREAKER_THRESHOLD = 3;
  let consecutiveErrors = 0;
  let lastErrorMsg = '';

  for (let i = 0; i < scan.entities.length; i++) {
    const entity = scan.entities[i];
    if (opts?.skipFailed && entity.status === 'failed') {
      log(scan, `Skipping ${entity.name} (previous failure)`);
      continue;
    }

    // Skip entities that already have data from this phase (resume support)
    if (entityHasPhaseData(entity, phaseName)) {
      consecutiveErrors = 0; // reset — we have working data
      continue;
    }

    log(scan, `[${phaseName}] ${entity.name}...`);
    saveScan(scan);

    try {
      scan.entities[i] = await fn(entity);
      consecutiveErrors = 0; // reset on success

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
      } else if (phaseName === 'video') {
        const vid = d.video as Record<string, unknown> | undefined;
        if (vid?.skipped) detail = `skipped: ${vid.reason}`;
        else if (vid) detail = `${vid.analyzed_count}/${(vid.analyzed_count as number) + (vid.failed_count as number)} videos analyzed, platforms: ${(vid.platforms as string[])?.join('+') || 'none'}`;
      } else if (phaseName === 'youtube_reviews') {
        const ytr = d.youtube_reviews as Record<string, unknown> | undefined;
        if (ytr?.skipped) detail = `skipped: ${ytr.reason}`;
        else if (ytr) detail = `${ytr.reviews_analyzed}/${ytr.reviews_found} reviews analyzed, cost: $${(ytr.cost_usd as number)?.toFixed(4) || '0'}`;
      } else if (phaseName === 'google_ads') {
        const gads = d.google_ads as Record<string, unknown> | undefined;
        if (gads?.skipped) detail = `skipped: ${gads.reason}`;
        else if (gads) detail = `${gads.totalAdsFound} ads, intensity: ${gads.estimatedIntensity}, formats: ${Object.keys((gads.formats as Record<string, number>) || {}).join('+')}`;
      } else if (phaseName === 'influencer_ig') {
        const iig = d.influencer_ig as Record<string, unknown> | undefined;
        if (iig?.skipped) detail = `skipped: ${iig.reason}`;
        else if (iig) detail = `${iig.unique_influencers} influencers from ${iig.tagged_posts_found} tagged posts, reach: ${((iig.total_reach_followers as number) || 0).toLocaleString()}`;
      } else if (phaseName === 'scorecard') {
        const sc = d.scorecard as Record<string, unknown> | undefined;
        if (sc?.skipped) detail = `skipped: ${sc.reason}`;
        else if (sc) {
          const scores = sc.scores as Record<string, number | null> | undefined;
          detail = `overall: ${scores?.overall ?? 'n/a'}/100, segment: ${sc.segment}, tags: ${((sc.tags as string[]) || []).length}`;
        }
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
      const isTransient = /timeout|timed out|econnreset|socket|429|rate.?limit|5\d\d|internal server/i.test(msg);

      // Auto-retry once for transient errors (with delay)
      if (isTransient) {
        log(scan, `  → TRANSIENT ERROR: ${msg} — retrying in 5s...`);
        saveScan(scan);
        await new Promise(r => setTimeout(r, 5000));

        try {
          scan.entities[i] = await fn(entity);
          consecutiveErrors = 0;
          log(scan, `  → RETRY OK`);
          saveScan(scan);
          continue;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          scan.entities[i].errors.push(`${phaseName}: ${retryMsg} (after retry)`);
          log(scan, `  → RETRY FAILED: ${retryMsg}`);
        }
      } else {
        scan.entities[i].errors.push(`${phaseName}: ${msg}`);
        log(scan, `  → ERROR: ${msg}`);
      }

      consecutiveErrors++;
      lastErrorMsg = msg;

      // Circuit breaker: N consecutive real errors → systemic problem, stop the phase
      if (consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
        log(scan, `CIRCUIT BREAKER: ${phaseName} failed ${consecutiveErrors}x in a row. Last error: ${lastErrorMsg}`);
        log(scan, `   Stopping phase ${phaseName}. Fix the issue, then use rescan_incomplete to retry.`);
        log(scan, `   Remaining entities skipped: ${scan.entities.length - i - 1}`);
        break;
      }
    }

    saveScan(scan);
  }

  scan.phasesCompleted.push(phaseName);
  saveScan(scan);

  // Persist partial results to SQLite after each phase
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

  // Phase 5b: Video analysis — yt-dlp + Gemini Flash + Sonnet (needs social data)
  if (has('video')) {
    await runEntityPhase(scan, 'video', analyzeVideo, {
      skipFailed: true,
      requireKey: 'GEMINI_API_KEY',
    });
  }

  // Phase 5c: YouTube Reviews — YouTube Data API + yt-dlp + Gemini Flash + Sonnet
  if (has('youtube_reviews')) {
    await runEntityPhase(scan, 'youtube_reviews', analyzeYouTubeReviews, {
      skipFailed: true,
      requireKey: 'YOUTUBE_API_KEY',
    });
  }

  // Phase 6: Meta Ads
  if (has('ads')) {
    await runEntityPhase(scan, 'ads', enrichAds, {
      skipFailed: true,
    });
  }

  // Phase 6b: Google Ads — Apify Ads Transparency scraper
  if (has('google_ads')) {
    await runEntityPhase(scan, 'google_ads', enrichGoogleAds, {
      skipFailed: true,
      requireKey: 'APIFY_API_TOKEN',
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

  // Phase 9: Influencer Press — scrape trade portals for brand partnerships (runs ONCE per scan)
  if (has('influencer_press')) {
    scan.currentPhase = 'influencer_press';
    log(scan, '--- PHASE: INFLUENCER_PRESS ---');
    saveScan(scan);

    if (!process.env.ANTHROPIC_API_KEY) {
      log(scan, 'ANTHROPIC_API_KEY not set — skipping influencer press');
    } else {
      log(scan, 'Scraping nowymarketing.pl + wirtualnemedia.pl for brand partnerships...');
      saveScan(scan);

      const result = await enrichInfluencerPress(scan);
      scan.totalCostUsd += result.costUsd;
      log(scan, `  → ${result.totalArticles} articles scraped, ${result.totalPartnerships} partnerships mapped to entities ($${result.costUsd.toFixed(4)})`);

      // Persist partial results
      mergeScanIntoBrands(scan);
    }

    scan.phasesCompleted.push('influencer_press');
    saveScan(scan);
  }

  // Phase 9b: Influencer IG — tagged posts per brand (needs social data for IG handle)
  if (has('influencer_ig')) {
    await runEntityPhase(scan, 'influencer_ig', enrichInfluencerIg, {
      skipFailed: true,
      requireKey: 'APIFY_API_TOKEN',
    });
  }

  // Phase 10: Scorecard — per-entity scoring with sector context
  if (has('scorecard')) {
    // Pre-compute sector stats once before the per-entity loop
    log(scan, '--- PHASE: SCORECARD (computing sector stats) ---');
    const sectorStats = computeSectorStats(scan.entities);
    log(scan, `  → sector: ${sectorStats.entityCount} entities, median price: ${sectorStats.pricing.median ?? 'n/a'} PLN, median followers: ${sectorStats.social.medianFollowers ?? 'n/a'}`);
    saveScan(scan);

    const enrichScorecard = createScorecardEnricher(sectorStats);
    await runEntityPhase(scan, 'scorecard', enrichScorecard, {
      skipFailed: true,
      requireKey: 'ANTHROPIC_API_KEY',
    });
  }

  // Auto-backup database after scan (timestamped, non-overwriting)
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = DB_PATH.replace('.db', `_backup_${ts}.db`);
    execSync(`sqlite3 "${DB_PATH}" ".backup '${backupPath}'"`, { timeout: 30000 });
    // Keep only last 10 backups to avoid filling disk
    const backupDir = DB_PATH.replace('/catscan.db', '');
    execSync(`ls -t "${backupDir}"/catscan_backup_*.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null`, { timeout: 10000 });
    log(scan, `Auto-backup saved: ${backupPath.split('/').pop()}`);
  } catch (backupErr) {
    log(scan, `Auto-backup failed: ${backupErr instanceof Error ? backupErr.message : String(backupErr)}`);
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
    'social', 'ads', 'reviews', 'finance', 'scorecard',
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
