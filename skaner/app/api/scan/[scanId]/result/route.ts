import { NextRequest } from 'next/server';
import { getReport } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { scanId: string } }
) {
  const { scanId } = params;

  const report = await getReport(scanId);

  if (!report) {
    return Response.json(
      { error: 'Raport nie został znaleziony lub wygasł' },
      { status: 404 }
    );
  }

  return Response.json(report);
}
