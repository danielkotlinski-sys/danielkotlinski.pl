import { NextRequest, NextResponse } from 'next/server';
import { db, stmts } from '@/lib/db/sqlite';

const EXPECTED_DIMS = [
  'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
  'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
  'customer_acquisition', 'differentiators', 'visual_identity', 'context',
  'social', 'ads', 'reviews', 'finance',
];

/**
 * GET /api/scan/stats — database stats for the dashboard
 *
 * Optimized vs original: batch-loads scan audit logs instead of N+1 queries.
 * brandList is lazy-loaded via ?brands=1 query param.
 */
export async function GET(req: NextRequest) {
  const totalBrands = (stmts.countBrands.get() as { count: number }).count;

  const allResults = stmts.getAllScanResults.all() as Array<{
    slug: string;
    data: string;
    phase_count: number;
    phases: string;
    updated_at: string;
  }>;

  const scannedBrands = allResults.length;

  const incompleteList: Array<{ slug: string; name: string; dims: number; missing: string[]; errors: string[] }> = [];
  let completeBrands = 0;
  const completeSlugs: string[] = [];

  // Parse data JSON for each result to determine completeness
  const incompleteRows: Array<{ slug: string; data: Record<string, unknown> }> = [];

  for (const row of allResults) {
    let dataObj: Record<string, unknown> = {};
    try { dataObj = JSON.parse(row.data); } catch { /* empty */ }

    const presentDims = EXPECTED_DIMS.filter(d => {
      const val = dataObj[d];
      return val !== undefined && val !== null && val !== '';
    });

    if (presentDims.length >= EXPECTED_DIMS.length) {
      completeBrands++;
      completeSlugs.push(row.slug);
    } else {
      incompleteRows.push({ slug: row.slug, data: dataObj });
    }
  }

  // Batch-load brand info and scan audit logs for incomplete brands
  if (incompleteRows.length > 0) {
    const slugs = incompleteRows.map(r => r.slug);
    const placeholders = slugs.map(() => '?').join(',');

    const brandRows = db.prepare(
      `SELECT slug, name, domain, last_scan_id FROM brands WHERE slug IN (${placeholders})`
    ).all(...slugs) as Array<{ slug: string; name: string; domain: string; last_scan_id: string | null }>;
    const brandMap = new Map(brandRows.map(b => [b.slug, b]));

    // Batch-load scan audit logs for error extraction
    const scanIds = Array.from(new Set(brandRows.map(b => b.last_scan_id).filter((id): id is string => id != null)));
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
      const brand = brandMap.get(row.slug);
      const presentDims = EXPECTED_DIMS.filter(d => {
        const val = row.data[d];
        return val !== undefined && val !== null && val !== '';
      });
      const missing = EXPECTED_DIMS.filter(d => !presentDims.includes(d));

      const errors: string[] = [];
      if (brand?.last_scan_id && scanMap.has(brand.last_scan_id)) {
        try {
          const entities = JSON.parse(scanMap.get(brand.last_scan_id)!) as Array<{ name: string; domain?: string; errors: string[] }>;
          const match = entities.find(e => e.domain === brand.domain || e.name === brand.name);
          if (match?.errors?.length) {
            errors.push(...match.errors);
          }
        } catch { /* parse error — skip */ }
      }

      incompleteList.push({
        slug: row.slug,
        name: brand?.name || row.slug,
        dims: presentDims.length,
        missing,
        errors,
      });
    }

    incompleteList.sort((a, b) => a.dims - b.dims);
  }

  const financialYears = (db.prepare('SELECT COUNT(*) as count FROM financial_years').get() as { count: number }).count;
  const socialPosts = (db.prepare('SELECT COUNT(*) as count FROM social_posts').get() as { count: number }).count;

  const recentScans = allResults.slice(0, 20).map(r => ({
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
    const scannedSet = new Set(allResults.map(r => r.slug));
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
    completeBrands,
    incompleteBrands: incompleteList.length,
    financialYears,
    socialPosts,
    incompleteList,
    recentScans,
    ...(brandList ? { brandList } : {}),
  });
}
