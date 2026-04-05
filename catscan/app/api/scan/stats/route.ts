import { NextResponse } from 'next/server';
import { db, stmts } from '@/lib/db/sqlite';

const EXPECTED_DIMS = [
  'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
  'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
  'customer_acquisition', 'differentiators', 'visual_identity', 'context',
  'social', 'ads', 'reviews', 'finance',
];

/** GET /api/scan/stats — database stats for the dashboard */
export async function GET() {
  const totalBrands = (stmts.countBrands.get() as { count: number }).count;

  const allResults = stmts.getAllScanResults.all() as Array<{
    slug: string;
    data: string;
    phase_count: number;
    phases: string;
    updated_at: string;
  }>;

  const scannedBrands = allResults.length;

  const incompleteList: Array<{ slug: string; name: string; dims: number; missing: string[] }> = [];
  let completeBrands = 0;

  for (const row of allResults) {
    let dataObj: Record<string, unknown> = {};
    try { dataObj = JSON.parse(row.data); } catch { /* empty */ }

    const presentDims = EXPECTED_DIMS.filter(d => {
      const val = dataObj[d];
      return val !== undefined && val !== null && val !== '';
    });
    const missing = EXPECTED_DIMS.filter(d => !presentDims.includes(d));

    if (missing.length === 0) {
      completeBrands++;
    } else {
      const brand = stmts.getBrand.get(row.slug) as { name: string } | undefined;
      incompleteList.push({
        slug: row.slug,
        name: brand?.name || row.slug,
        dims: presentDims.length,
        missing,
      });
    }
  }

  const financialYears = (db.prepare('SELECT COUNT(*) as count FROM financial_years').get() as { count: number }).count;
  const socialPosts = (db.prepare('SELECT COUNT(*) as count FROM social_posts').get() as { count: number }).count;

  const recentScans = allResults.slice(0, 20).map(r => ({
    slug: r.slug,
    phase_count: r.phase_count,
    updated_at: r.updated_at,
  }));

  return NextResponse.json({
    totalBrands,
    scannedBrands,
    completeBrands,
    incompleteBrands: incompleteList.length,
    financialYears,
    socialPosts,
    incompleteList: incompleteList.sort((a, b) => a.dims - b.dims),
    recentScans,
  });
}
