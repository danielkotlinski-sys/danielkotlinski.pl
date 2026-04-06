import { NextRequest, NextResponse } from 'next/server';
import { db, stmts } from '@/lib/db/sqlite';

const EXPECTED_DIMS = [
  'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
  'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
  'customer_acquisition', 'differentiators', 'visual_identity', 'context',
  'social', 'ads', 'reviews', 'finance',
];

const TOTAL_DIMS = EXPECTED_DIMS.length; // 19

/**
 * GET /api/scan/stats — database stats for the dashboard
 *
 * Optimized: avoids loading full JSON data blobs.
 * Uses phase_count as a proxy for completeness (19 = complete).
 * Only loads full data for incomplete brands (to show missing dims).
 * brandList is lazy-loaded via ?brands=1 query param.
 */
export async function GET(req: NextRequest) {
  const totalBrands = (stmts.countBrands.get() as { count: number }).count;

  // Light query: only slug, phase_count, phases, updated_at — no data blob
  const lightResults = db.prepare(
    `SELECT slug, phase_count, phases, updated_at FROM scan_results ORDER BY updated_at DESC`
  ).all() as Array<{
    slug: string;
    phase_count: number;
    phases: string;
    updated_at: string;
  }>;

  const scannedBrands = lightResults.length;

  // Split into complete vs incomplete using phase_count
  const completeSlugs: string[] = [];
  const incompleteSlugs: string[] = [];

  for (const row of lightResults) {
    if (row.phase_count >= TOTAL_DIMS) {
      completeSlugs.push(row.slug);
    } else {
      incompleteSlugs.push(row.slug);
    }
  }

  // Only load full data for incomplete brands (to compute missing dims)
  const incompleteList: Array<{ slug: string; name: string; dims: number; missing: string[]; errors: string[] }> = [];

  if (incompleteSlugs.length > 0) {
    const placeholders = incompleteSlugs.map(() => '?').join(',');
    const incompleteRows = db.prepare(
      `SELECT sr.slug, sr.data, b.name, b.domain, b.last_scan_id
       FROM scan_results sr
       JOIN brands b ON b.slug = sr.slug
       WHERE sr.slug IN (${placeholders})`
    ).all(...incompleteSlugs) as Array<{
      slug: string;
      data: string;
      name: string;
      domain: string;
      last_scan_id: string | null;
    }>;

    // Batch-load scan audit logs for error extraction
    const scanIds = Array.from(new Set(incompleteRows.map(r => r.last_scan_id).filter((id): id is string => id != null)));
    const scanMap = new Map<string, string>();
    if (scanIds.length > 0) {
      const scanPlaceholders = scanIds.map(() => '?').join(',');
      const scanRows = db.prepare(
        `SELECT id, entities FROM scans WHERE id IN (${scanPlaceholders})`
      ).all(...scanIds) as Array<{ id: string; entities: string }>;
      for (const s of scanRows) {
        scanMap.set(s.id, s.entities);
      }
    }

    for (const row of incompleteRows) {
      let dataObj: Record<string, unknown> = {};
      try { dataObj = JSON.parse(row.data); } catch { /* empty */ }

      const presentDims = EXPECTED_DIMS.filter(d => {
        const val = dataObj[d];
        return val !== undefined && val !== null && val !== '';
      });
      const missing = EXPECTED_DIMS.filter(d => !presentDims.includes(d));

      const errors: string[] = [];
      if (row.last_scan_id && scanMap.has(row.last_scan_id)) {
        try {
          const entities = JSON.parse(scanMap.get(row.last_scan_id)!) as Array<{ name: string; domain?: string; errors: string[] }>;
          const match = entities.find(e => e.domain === row.domain || e.name === row.name);
          if (match?.errors?.length) {
            errors.push(...match.errors);
          }
        } catch { /* parse error — skip */ }
      }

      incompleteList.push({
        slug: row.slug,
        name: row.name || row.slug,
        dims: presentDims.length,
        missing,
        errors,
      });
    }

    incompleteList.sort((a, b) => a.dims - b.dims);
  }

  const financialYears = (db.prepare('SELECT COUNT(*) as count FROM financial_years').get() as { count: number }).count;
  const socialPosts = (db.prepare('SELECT COUNT(*) as count FROM social_posts').get() as { count: number }).count;

  const recentScans = lightResults.slice(0, 20).map(r => ({
    slug: r.slug,
    phase_count: r.phase_count,
    updated_at: r.updated_at,
  }));

  // brandList is only needed when custom scan config is open — lazy load via query param
  const includeBrands = req.nextUrl.searchParams.get('brands') === '1';
  let brandList: Array<{ slug: string; name: string; url: string; status: string }> | undefined;

  if (includeBrands) {
    const allBrands = stmts.getAllBrands.all() as Array<{
      slug: string; name: string; url: string; domain: string;
    }>;
    const scannedSet = new Set(lightResults.map(r => r.slug));
    const completeSet = new Set(completeSlugs);

    brandList = allBrands.map(b => ({
      slug: b.slug,
      name: b.name,
      url: b.url,
      status: completeSet.has(b.slug) ? 'complete'
        : scannedSet.has(b.slug) ? 'incomplete'
        : 'unscanned',
    }));
  }

  return NextResponse.json({
    totalBrands,
    scannedBrands,
    completeBrands: completeSlugs.length,
    incompleteBrands: incompleteList.length,
    financialYears,
    socialPosts,
    incompleteList,
    recentScans,
    ...(brandList ? { brandList } : {}),
  });
}
