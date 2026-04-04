import { NextRequest, NextResponse } from 'next/server';
import { getScan } from '@/lib/db/store';

/** GET /api/scan/[id] — get scan status and results */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const scan = getScan(params.id);

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  return NextResponse.json(scan);
}
