import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { saveScan, getScan, getScans } from '@/lib/db/store';
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

/** POST /api/scan — start a new scan */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companies, phases } = body as {
    companies: Array<{ name: string; url: string; nip?: string }>;
    phases?: string[];
  };

  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return NextResponse.json(
      { error: 'Provide companies array with name and url' },
      { status: 400 }
    );
  }

  // Default: all phases. Can be overridden to run subset.
  const enabledPhases = phases || [
    'crawl', 'extract', 'discovery', 'context', 'social', 'ads', 'reviews', 'finance', 'interpret'
  ];

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

  for (let i = 0; i < scan.entities.length; i++) {
    const entity = scan.entities[i];
    if (opts?.skipFailed && entity.status === 'failed') {
      log(scan, `Skipping ${entity.name} (previous failure)`);
      continue;
    }

    log(scan, `[${phaseName}] ${entity.name}...`);
    saveScan(scan);

    try {
      scan.entities[i] = await fn(entity);

      // Track extraction cost
      const ext = scan.entities[i].data._extraction as Record<string, number> | undefined;
      if (ext?.costUsd) {
        scan.totalCostUsd += ext.costUsd;
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
}

async function runPipeline(scanId: string, enabledPhases: string[]) {
  const scan = getScan(scanId)!;
  const has = (phase: string) => enabledPhases.includes(phase);

  // Phase 1: Crawl websites
  if (has('crawl')) {
    await runEntityPhase(scan, 'crawl', crawlEntity);
  }

  // Phase 2: Extract structured data via LLM
  if (has('extract')) {
    await runEntityPhase(scan, 'extract', extractEntity, {
      skipFailed: true,
      requireKey: 'ANTHROPIC_API_KEY',
    });
  }

  // Phase 3: Discover NIP/KRS
  if (has('discovery')) {
    await runEntityPhase(scan, 'discovery', discoverEntity, {
      skipFailed: true,
    });
  }

  // Phase 4: Perplexity context (market intelligence)
  if (has('context')) {
    await runEntityPhase(scan, 'context', enrichContext, {
      skipFailed: true,
      requireKey: 'PERPLEXITY_API_KEY',
    });
  }

  // Phase 5: Social media profiles (Apify required)
  if (has('social')) {
    await runEntityPhase(scan, 'social', enrichSocial, {
      skipFailed: true,
      requireKey: 'APIFY_API_TOKEN',
    });
  }

  // Phase 5: Meta Ads
  if (has('ads')) {
    await runEntityPhase(scan, 'ads', enrichAds, {
      skipFailed: true,
    });
  }

  // Phase 6: Google Reviews
  if (has('reviews')) {
    await runEntityPhase(scan, 'reviews', enrichReviews, {
      skipFailed: true,
    });
  }

  // Phase 7: KRS + Financial data
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
  saveScan(scan);
}
