import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { saveScan, appendLog, getScan, getScans } from '@/lib/db/store';
import type { ScanRecord, EntityRecord } from '@/lib/db/store';
import { crawlEntity } from '@/lib/pipeline/phases/crawl';
import { extractEntity } from '@/lib/pipeline/phases/extract';
import { enrichFinance } from '@/lib/pipeline/phases/finance';

/** POST /api/scan — start a new scan */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companies } = body as {
    companies: Array<{ name: string; url: string; nip?: string }>;
  };

  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return NextResponse.json(
      { error: 'Provide companies array with name and url' },
      { status: 400 }
    );
  }

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

  saveScan(scan);
  appendLog(scanId, `Scan started — ${entities.length} entities`);

  // Run pipeline async (don't await — return immediately)
  runPipeline(scanId).catch((err) => {
    const s = getScan(scanId);
    if (s) {
      s.status = 'failed';
      appendLog(scanId, `Pipeline error: ${err.message}`);
      saveScan(s);
    }
  });

  return NextResponse.json({ scanId, status: 'running', entityCount: entities.length });
}

/** GET /api/scan — list all scans */
export async function GET() {
  const scans = getScans().map((s) => ({
    id: s.id,
    status: s.status,
    entityCount: s.entities.length,
    phasesCompleted: s.phasesCompleted,
    currentPhase: s.currentPhase,
    totalCostUsd: s.totalCostUsd,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
  }));
  return NextResponse.json(scans);
}

// --- Pipeline execution ---

async function runPipeline(scanId: string) {
  let scan = getScan(scanId)!;

  // Phase 1: Crawl
  scan.currentPhase = 'crawl';
  saveScan(scan);
  appendLog(scanId, '--- PHASE: CRAWL ---');

  for (let i = 0; i < scan.entities.length; i++) {
    appendLog(scanId, `Crawling ${scan.entities[i].name} (${scan.entities[i].url})...`);
    scan.entities[i] = await crawlEntity(scan.entities[i]);
    const status = scan.entities[i].status;
    const contentLen = scan.entities[i].rawHtml?.length || 0;
    appendLog(scanId, `  → ${status} (${contentLen} chars)`);
    saveScan(scan);
  }

  scan.phasesCompleted.push('crawl');
  saveScan(scan);

  // Phase 2: Extract
  scan.currentPhase = 'extract';
  saveScan(scan);
  appendLog(scanId, '--- PHASE: EXTRACT ---');

  for (let i = 0; i < scan.entities.length; i++) {
    if (scan.entities[i].status === 'failed') {
      appendLog(scanId, `Skipping ${scan.entities[i].name} (failed crawl)`);
      continue;
    }
    appendLog(scanId, `Extracting ${scan.entities[i].name}...`);
    scan.entities[i] = await extractEntity(scan.entities[i]);
    const ext = scan.entities[i].data._extraction as Record<string, number> | undefined;
    if (ext) {
      scan.totalCostUsd += ext.costUsd || 0;
      appendLog(scanId, `  → extracted ($${ext.costUsd?.toFixed(4)})`);
    } else {
      appendLog(scanId, `  → ${scan.entities[i].status}`);
    }
    saveScan(scan);
  }

  scan.phasesCompleted.push('extract');
  saveScan(scan);

  // Phase 3: Finance (if API key available)
  scan.currentPhase = 'finance';
  saveScan(scan);
  appendLog(scanId, '--- PHASE: FINANCE ---');

  if (!process.env.REJESTR_IO_API_KEY) {
    appendLog(scanId, 'REJESTR_IO_API_KEY not set — skipping finance phase');
  } else {
    for (let i = 0; i < scan.entities.length; i++) {
      if (scan.entities[i].status === 'failed') continue;
      appendLog(scanId, `Fetching finance data for ${scan.entities[i].name}...`);
      scan.entities[i] = await enrichFinance(scan.entities[i]);
      const fin = scan.entities[i].data._finance as Record<string, unknown> | undefined;
      appendLog(scanId, `  → ${fin?.skipped ? 'skipped: ' + fin.reason : 'enriched'}`);
      saveScan(scan);
    }
  }

  scan.phasesCompleted.push('finance');

  // Done
  scan.currentPhase = null;
  scan.status = 'completed';
  scan.completedAt = new Date().toISOString();

  // Strip rawHtml from stored entities (save space)
  scan.entities = scan.entities.map((e) => ({ ...e, rawHtml: undefined }));

  saveScan(scan);

  const succeeded = scan.entities.filter((e) => e.status !== 'failed').length;
  appendLog(scanId, `--- SCAN COMPLETE: ${succeeded}/${scan.entities.length} entities, $${scan.totalCostUsd.toFixed(4)} ---`);
}
