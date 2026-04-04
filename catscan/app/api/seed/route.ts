import { NextRequest, NextResponse } from 'next/server';
import { runSeed, loadBrands } from '@/lib/pipeline/phases/seed';

/** GET /api/seed — return current brand database */
export async function GET() {
  const brands = loadBrands();
  return NextResponse.json({
    count: brands.length,
    bySource: {
      dietly: brands.filter(b => b.source === 'dietly').length,
      dietlyCity: brands.filter(b => b.source === 'dietly-city').length,
      search: brands.filter(b => b.source === 'search').length,
      ranking: brands.filter(b => b.source === 'ranking').length,
    },
    withDomain: brands.filter(b => b.domain).length,
    withoutDomain: brands.filter(b => !b.domain).length,
    brands: brands.map(b => ({
      name: b.name,
      domain: b.domain,
      source: b.source,
      dietlySlug: b.dietlySlug,
      rating: b.dietly?.rating ?? null,
      reviewCount: b.dietly?.reviewCount ?? null,
    })),
  });
}

/** POST /api/seed — run seeding process */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dietly = true, search = true } = body as {
    dietly?: boolean;
    search?: boolean;
  };

  const log: string[] = [];

  try {
    const brands = await runSeed({
      dietly,
      search,
      onProgress: (msg) => log.push(msg),
    });

    return NextResponse.json({
      count: brands.length,
      bySource: {
        dietly: brands.filter(b => b.source === 'dietly').length,
        dietlyCity: brands.filter(b => b.source === 'dietly-city').length,
        search: brands.filter(b => b.source === 'search').length,
      },
      withDomain: brands.filter(b => b.domain).length,
      withoutDomain: brands.filter(b => !b.domain).length,
      log,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), log },
      { status: 500 }
    );
  }
}
