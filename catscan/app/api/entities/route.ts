import { NextResponse } from 'next/server';
import { getScannedBrands } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

/** GET /api/entities — list all brands with scan data from scan_results table */
export async function GET() {
  const brands = getScannedBrands();

  const entities = brands.map(b => ({
    id: b.slug,
    name: b.name,
    url: b.url,
    domain: b.domain,
    nip: b.nip,
    krs: b.krs,
    data: b.data,
    status: 'enriched',
    errors: [],
    phase_count: b.phase_count,
  }));

  return NextResponse.json(entities);
}
