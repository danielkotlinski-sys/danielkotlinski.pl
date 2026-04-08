import { NextRequest } from 'next/server';
import { getReport, saveReport } from '@/lib/redis';

/**
 * Admin: copy a scan report from one scanId to another.
 *
 * Use case: a user receives an email with a link to a scan that turned
 * out buggy (e.g. images not extracted, atomic analysis failed). We
 * re-run the same input, get a good report under a NEW scanId, then
 * use this endpoint to overwrite the OLD scanId's report data with
 * the new one. The user's original email link now transparently
 * resolves to the corrected report — no action needed on their side.
 *
 * Body: { fromScanId, toScanId, secret }
 * Auth: ADMIN_SECRET matching server env.
 *
 * Example:
 *   curl -X POST https://skaner.danielkotlinski.pl/api/admin/copy-report \
 *     -H 'Content-Type: application/json' \
 *     -d '{"fromScanId":"new-good-id","toScanId":"old-buggy-id","secret":"ADMIN_SECRET"}'
 */
export async function POST(request: NextRequest) {
  const { fromScanId, toScanId, secret } = await request.json();

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!fromScanId || !toScanId || typeof fromScanId !== 'string' || typeof toScanId !== 'string') {
    return Response.json(
      { error: 'fromScanId and toScanId required (both strings)' },
      { status: 400 }
    );
  }

  if (fromScanId === toScanId) {
    return Response.json(
      { error: 'fromScanId and toScanId must be different' },
      { status: 400 }
    );
  }

  const sourceReport = await getReport(fromScanId);
  if (!sourceReport) {
    return Response.json(
      { error: `Source report not found: ${fromScanId}` },
      { status: 404 }
    );
  }

  // Peek at destination for safety: log what we're overwriting so the
  // action is auditable in server logs. We do NOT block on existence
  // because the intended flow is overwrite.
  const existingDest = await getReport(toScanId);
  console.log(
    `[admin] copy-report: ${fromScanId} → ${toScanId} ` +
      `(destination ${existingDest ? 'exists, will be overwritten' : 'empty'})`
  );

  await saveReport(toScanId, sourceReport);

  return Response.json({
    ok: true,
    fromScanId,
    toScanId,
    overwritten: existingDest !== null,
    message: `Report copied from ${fromScanId} to ${toScanId}${
      existingDest ? ' (old report overwritten)' : ''
    }`,
  });
}
