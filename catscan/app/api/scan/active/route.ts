import { NextResponse } from 'next/server';
import { getActiveScan } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

/** GET /api/scan/active — returns the currently running scan, or null */
export async function GET() {
  const scan = getActiveScan();

  if (!scan) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    id: scan.id,
    status: scan.status,
    currentPhase: scan.currentPhase,
    phasesCompleted: scan.phasesCompleted,
    entityCount: scan.entities.length,
    totalCostUsd: scan.totalCostUsd,
    createdAt: scan.createdAt,
  });
}
