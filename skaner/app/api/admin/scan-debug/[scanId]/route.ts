import { NextRequest } from 'next/server';
import { getScanDebug, getScanMeta } from '@/lib/redis';
import { searchExternalDiscourse } from '@/lib/perplexity';

/**
 * Admin: fetch raw source texts that fed into a scan's analysis.
 *
 * Why this exists: ScannerReport (what /raport/[scanId] shows) stores only
 * the final Claude output + citation URLs. When a user questions a specific
 * figure — "skąd wzięły się przychody w Krajobrazie kategorii?" — they need
 * to see the raw Perplexity text Claude interpreted, not just the downstream
 * narrative. ScanDebug stores exactly that: websiteText + externalDiscourse
 * + citations per brand, saved alongside the report.
 *
 * Old scans (before we added saveScanDebug) have no debug blob. For those,
 * pass ?regenerate=true to re-run Perplexity fresh against the brand list
 * from ScanMeta. Regenerated data comes from today's web index, so it may
 * differ from what the original scan saw — but it's the best we can do
 * without re-running the whole expensive pipeline.
 *
 * GET /api/admin/scan-debug/<scanId>
 *   Headers: x-admin-secret: ADMIN_SECRET
 *   Query:   ?regenerate=true  — re-run Perplexity if debug blob is missing
 *
 * Response shape:
 *   {
 *     scanId, createdAt, source: 'saved' | 'regenerated' | null,
 *     brands: { [brandName]: { websiteText, externalDiscourse, citations } }
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { scanId: string } }
) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { scanId } = params;
  if (!scanId) {
    return Response.json({ error: 'scanId required' }, { status: 400 });
  }

  // Happy path: saved debug blob exists (scans run after this feature shipped)
  const saved = await getScanDebug(scanId);
  if (saved) {
    return Response.json({
      scanId,
      createdAt: saved.createdAt,
      source: 'saved',
      brands: saved.brands,
    });
  }

  // No saved blob. Check if caller wants us to regenerate via fresh Perplexity.
  const { searchParams } = new URL(request.url);
  const regenerate = searchParams.get('regenerate') === 'true';

  if (!regenerate) {
    return Response.json(
      {
        error: 'No saved debug data for this scan',
        hint: 'Scan was run before scan-debug storage was added. Pass ?regenerate=true to re-run Perplexity queries from scratch. Note: results may differ from original scan because web content has changed.',
        scanId,
      },
      { status: 404 }
    );
  }

  // Regenerate path: read scan meta to find the brand list, re-query Perplexity.
  const meta = await getScanMeta(scanId);
  if (!meta) {
    return Response.json(
      { error: 'Scan not found — cannot regenerate without scan meta', scanId },
      { status: 404 }
    );
  }

  const allBrandNames = [
    meta.input.clientBrand.name,
    ...meta.input.competitors.map((c) => c.name),
  ];

  console.log(
    `[admin:scan-debug] regenerating for scan ${scanId} — ` +
      `${allBrandNames.length} brands: ${allBrandNames.join(', ')}`
  );

  // Run all brand queries in parallel (same as pipeline does)
  const results = await Promise.all(
    allBrandNames.map(async (name) => {
      const { text, citations } = await searchExternalDiscourse(name, meta.input.category);
      return [name, { websiteText: '', externalDiscourse: text, citations }] as const;
    })
  );

  return Response.json({
    scanId,
    createdAt: meta.createdAt,
    source: 'regenerated',
    warning: 'Perplexity was re-queried today — content may differ from the original scan date.',
    brands: Object.fromEntries(results),
  });
}
