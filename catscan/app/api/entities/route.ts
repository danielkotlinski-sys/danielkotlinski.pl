import { NextResponse } from 'next/server';
import { getScans, getBrands } from '@/lib/db/store';

/** GET /api/entities — list all extracted entities across all scans */
export async function GET() {
  const scans = getScans();

  // Deduplicate: keep only the most recent scan's version of each entity (by URL)
  const seen = new Map<string, Record<string, unknown>>();
  scans
    .filter((s) => s.status === 'completed')
    .reverse() // newest scans first
    .flatMap((s) =>
      s.entities
        .filter((e) => e.status !== 'failed')
        .map((e) => ({
          id: e.id,
          name: e.name,
          url: e.url,
          domain: e.domain,
          nip: e.nip,
          krs: e.krs,
          data: e.data,
          financials: e.financials,
          status: e.status,
          scanId: s.id,
        }))
    )
    .forEach((e) => {
      const key = e.url || e.name;
      if (!seen.has(key)) seen.set(key, e);
    });

  // Fallback: if no scan results, serve enriched brands from brands.json
  // This covers the case where scans.json was lost (redeploy) but brands.json persists in git
  if (seen.size === 0) {
    const brands = getBrands();
    const enriched = brands.filter((b) => b.data && Object.keys(b.data as Record<string, unknown>).length > 0);
    enriched.forEach((b) => {
      seen.set(b.url || b.name, {
        id: b.slug,
        name: b.name,
        url: b.url,
        domain: b.domain,
        nip: b.nip,
        krs: b.krs,
        data: b.data,
        financials: b.financials,
        status: 'enriched',
        source: 'brands.json',
      });
    });
  }

  return NextResponse.json(Array.from(seen.values()));
}
