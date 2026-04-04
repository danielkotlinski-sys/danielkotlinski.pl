import { NextResponse } from 'next/server';
import { getScans } from '@/lib/db/store';

/** GET /api/entities — list all extracted entities across all scans */
export async function GET() {
  const scans = getScans();

  const entities = scans
    .filter((s) => s.status === 'completed')
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
    );

  return NextResponse.json(entities);
}
