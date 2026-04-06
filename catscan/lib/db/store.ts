/**
 * CATSCAN data store — SQLite backend.
 *
 * Public API unchanged from JSON version:
 *   getScans, getScan, saveScan, appendLog,
 *   getBrands, mergeScanIntoBrands
 *
 * New SQLite-powered functions:
 *   getScanResult, getAllScanResults, getScannedBrands,
 *   saveScanResult, saveFinancialYears, saveSocialPosts
 */

import { db, stmts } from './sqlite';

// ── Interfaces (unchanged) ──

export interface ScanRecord {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sectorId: string;
  entities: EntityRecord[];
  phasesCompleted: string[];
  currentPhase: string | null;
  log: string[];
  totalCostUsd: number;
  interpretation?: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface EntityRecord {
  id: string;
  name: string;
  url: string;
  nip?: string;
  krs?: string;
  domain?: string;
  rawHtml?: string;
  data: Record<string, unknown>;
  financials?: Record<string, unknown>;
  status: 'pending' | 'crawled' | 'extracted' | 'enriched' | 'failed';
  errors: string[];
}

// ── Scans (audit log) ──

export function getScans(): ScanRecord[] {
  const rows = stmts.getAllScans.all() as Array<Record<string, unknown>>;
  return rows.map(rowToScan);
}

export function getScan(id: string): ScanRecord | undefined {
  const row = stmts.getScan.get(id) as Record<string, unknown> | undefined;
  return row ? rowToScan(row) : undefined;
}

export function getActiveScan(): ScanRecord | undefined {
  const row = stmts.getActiveScan.get() as Record<string, unknown> | undefined;
  return row ? rowToScan(row) : undefined;
}

export function saveScan(scan: ScanRecord) {
  stmts.upsertScan.run({
    id: scan.id,
    status: scan.status,
    entities: JSON.stringify(scan.entities),
    phasesCompleted: JSON.stringify(scan.phasesCompleted),
    currentPhase: scan.currentPhase,
    log: JSON.stringify(scan.log),
    totalCostUsd: scan.totalCostUsd,
    interpretation: scan.interpretation ? JSON.stringify(scan.interpretation) : null,
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
  });
}

export function appendLog(scanId: string, message: string) {
  const scan = getScan(scanId);
  if (!scan) return;
  const timestamp = new Date().toISOString().slice(11, 19);
  scan.log.push(`[${timestamp}] ${message}`);
  saveScan(scan);
}

function rowToScan(row: Record<string, unknown>): ScanRecord {
  return {
    id: row.id as string,
    status: row.status as ScanRecord['status'],
    sectorId: 'catering',
    entities: JSON.parse((row.entities as string) || '[]'),
    phasesCompleted: JSON.parse((row.phases_completed as string) || '[]'),
    currentPhase: (row.current_phase as string) || null,
    log: JSON.parse((row.log as string) || '[]'),
    totalCostUsd: (row.total_cost_usd as number) || 0,
    interpretation: row.interpretation ? JSON.parse(row.interpretation as string) : undefined,
    createdAt: (row.created_at as string) || '',
    completedAt: (row.completed_at as string) || null,
  };
}

// ── Brands ──

interface BrandRecord {
  slug: string;
  name: string;
  domain?: string;
  url: string;
  [key: string]: unknown;
}

export function getBrands(): BrandRecord[] {
  const rows = stmts.getAllBrands.all() as Array<Record<string, unknown>>;
  return rows.map(rowToBrand);
}

function rowToBrand(row: Record<string, unknown>): BrandRecord {
  return {
    slug: row.slug as string,
    name: row.name as string,
    domain: (row.domain as string) || undefined,
    url: (row.url as string) || '',
    dietlySlug: row.dietly_slug || null,
    dietlyUrl: row.dietly_url || null,
    nip: row.nip || undefined,
    krs: row.krs || undefined,
    source: row.source || undefined,
    seededAt: row.seeded_at || undefined,
    lastScanId: row.last_scan_id || undefined,
    lastScannedAt: row.last_scanned_at || undefined,
  };
}

/**
 * Merge scan results into brands + scan_results tables.
 * Matches by domain (primary) or name (fallback).
 * Also normalizes financial_years and social_posts.
 */
export function mergeScanIntoBrands(scan: ScanRecord): number {
  let updated = 0;

  const mergeAll = db.transaction(() => {
    for (const entity of scan.entities) {
      if (entity.status === 'failed' && Object.keys(entity.data).length === 0) continue;

      const entityDomain = entity.domain || (() => { try { return new URL(entity.url).hostname.replace('www.', ''); } catch { return ''; } })();

      // Find matching brand
      let brand = stmts.getBrandByDomain.get(entityDomain, entityDomain) as Record<string, unknown> | undefined;
      if (!brand) {
        brand = stmts.getBrandByName.get(entity.name) as Record<string, unknown> | undefined;
      }

      const slug = (brand?.slug as string) || entityDomain.replace(/\./g, '-');

      // Upsert brand
      stmts.upsertBrand.run({
        slug,
        name: entity.name,
        domain: entityDomain || null,
        url: entity.url,
        dietlySlug: null,
        dietlyUrl: null,
        source: null,
        nip: entity.nip || null,
        krs: entity.krs || null,
        seededAt: null,
        lastScanId: scan.id,
        lastScannedAt: scan.completedAt || new Date().toISOString(),
      });

      // Merge data (smart merge: preserve existing, don't overwrite with empty)
      const existingResult = stmts.getScanResult.get(slug) as Record<string, unknown> | undefined;
      const existingData = existingResult ? JSON.parse(existingResult.data as string) : {};
      const newData = entity.data || {};
      const merged = { ...existingData };

      for (const [key, value] of Object.entries(newData)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const obj = value as Record<string, unknown>;
          const isEmpty = Object.keys(obj).length === 0
            || (Object.keys(obj).length === 1 && obj.skipped);
          if (isEmpty && existingData[key] && typeof existingData[key] === 'object') {
            continue;
          }
        }
        if (Array.isArray(value) && value.length === 0 && Array.isArray(existingData[key]) && (existingData[key] as unknown[]).length > 0) {
          continue;
        }
        merged[key] = value;
      }

      // Count non-internal phases
      const phases = Object.keys(merged).filter(k => !k.startsWith('_'));

      stmts.upsertScanResult.run({
        slug,
        data: JSON.stringify(merged),
        phaseCount: phases.length,
        phases: JSON.stringify(phases),
      });

      // Normalize financial years
      const finance = merged.finance as Record<string, unknown> | undefined;
      if (finance && Array.isArray(finance.financial_statements)) {
        for (const stmt of finance.financial_statements as Array<Record<string, unknown>>) {
          const ratios = (stmt.ratios || {}) as Record<string, unknown>;
          stmts.upsertFinancialYear.run({
            slug,
            yearStart: stmt.periodStart || null,
            yearEnd: stmt.periodEnd || null,
            revenue: stmt.revenue ?? null,
            netIncome: stmt.netIncome ?? null,
            operatingProfit: stmt.operatingProfit ?? null,
            grossProfit: stmt.grossProfit ?? null,
            totalAssets: stmt.totalAssets ?? null,
            equity: stmt.equity ?? null,
            totalLiabilities: stmt.totalLiabilities ?? null,
            cash: stmt.cash ?? null,
            wages: stmt.wages ?? null,
            depreciation: stmt.depreciation ?? null,
            netMargin: ratios.netMargin ?? null,
            roe: ratios.roe ?? null,
            roa: ratios.roa ?? null,
            revenueSource: finance.revenue_source || 'krs',
            rawData: JSON.stringify(stmt),
          });
        }
      }

      // Normalize social posts — Instagram
      const social = merged.social as Record<string, unknown> | undefined;
      if (social) {
        const ig = social.instagram as Record<string, unknown> | undefined;
        if (ig?.content) {
          const content = ig.content as Record<string, unknown>;
          const posts = (content.posts || []) as Array<Record<string, unknown>>;
          for (const post of posts) {
            stmts.upsertSocialPost.run({
              slug,
              platform: 'instagram',
              postId: post.id || post.url || `ig_${Date.now()}_${Math.random()}`,
              url: post.url || null,
              caption: post.caption || null,
              hashtags: JSON.stringify(post.hashtags || []),
              timestamp: post.timestamp || null,
              likes: post.likes ?? null,
              comments: post.comments ?? null,
              views: null,
              shares: null,
              sampleBucket: post.sampleBucket || null,
            });
          }
        }

        // TikTok
        const tt = social.tiktok as Record<string, unknown> | undefined;
        if (tt?.content) {
          const content = tt.content as Record<string, unknown>;
          const posts = (content.posts || []) as Array<Record<string, unknown>>;
          for (const post of posts) {
            stmts.upsertSocialPost.run({
              slug,
              platform: 'tiktok',
              postId: post.id || post.url || `tt_${Date.now()}_${Math.random()}`,
              url: post.url || null,
              caption: post.caption || null,
              hashtags: JSON.stringify(post.hashtags || []),
              timestamp: post.timestamp || null,
              likes: post.likes ?? null,
              comments: post.comments ?? null,
              views: post.views ?? null,
              shares: post.shares ?? null,
              sampleBucket: post.sampleBucket || null,
            });
          }
        }
      }

      updated++;
    }
  });

  mergeAll();
  return updated;
}

// ── New SQLite-powered queries ──

export interface ScanResultRow {
  slug: string;
  data: Record<string, unknown>;
  phase_count: number;
  phases: string[];
  updated_at: string;
}

export function getScanResult(slug: string): ScanResultRow | null {
  const row = stmts.getScanResult.get(slug) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    slug: row.slug as string,
    data: JSON.parse(row.data as string),
    phase_count: row.phase_count as number,
    phases: JSON.parse(row.phases as string),
    updated_at: row.updated_at as string,
  };
}

export function getAllScanResults(): ScanResultRow[] {
  const rows = stmts.getAllScanResults.all() as Array<Record<string, unknown>>;
  return rows.map(row => ({
    slug: row.slug as string,
    data: JSON.parse(row.data as string),
    phase_count: row.phase_count as number,
    phases: JSON.parse(row.phases as string),
    updated_at: row.updated_at as string,
  }));
}

/** Get brands that have scan data — the "scanned brands" view */
export function getScannedBrands(): Array<BrandRecord & { data: Record<string, unknown>; phase_count: number }> {
  const rows = stmts.getScannedBrands.all() as Array<Record<string, unknown>>;
  return rows.map(row => ({
    ...rowToBrand(row),
    data: JSON.parse((row.data as string) || '{}'),
    phase_count: (row.phase_count as number) || 0,
  }));
}
