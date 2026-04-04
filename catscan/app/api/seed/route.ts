import { NextRequest, NextResponse } from 'next/server';
import { runSeed } from '@/lib/pipeline/phases/seed';

/** POST /api/seed — crawl Dietly.pl to get company list */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { maxPages } = body as { maxPages?: number };

  try {
    const entities = await runSeed(maxPages || 5);
    return NextResponse.json({
      count: entities.length,
      companies: entities.map(e => ({
        name: e.name,
        url: e.url,
        city: (e.data as Record<string, Record<string, string>>)?._seed?.city || '',
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
