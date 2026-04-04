import { NextResponse } from 'next/server';
import { getScans } from '@/lib/db/store';

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

  return NextResponse.json(Array.from(seen.values()));
}
