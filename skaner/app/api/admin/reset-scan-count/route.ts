import { NextRequest } from 'next/server';
import { resetScanCount } from '@/lib/auth';

/**
 * Admin: reset the monthly scan counter for a given user.
 *
 * Used during QA / dev testing when a tester (often the dev themselves)
 * burns through the 3-scan-per-month quota and needs more runs to verify
 * fixes. Resets the org-level counter if the user belongs to an org,
 * otherwise the user-level counter.
 *
 * Auth: requires ADMIN_SECRET in the request body to match server env.
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/admin/reset-scan-count \
 *     -H 'Content-Type: application/json' \
 *     -d '{"email":"daniel@example.com","secret":"YOUR_ADMIN_SECRET"}'
 */
export async function POST(request: NextRequest) {
  const { email, secret } = await request.json();

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!email || typeof email !== 'string') {
    return Response.json({ error: 'Email required' }, { status: 400 });
  }

  const result = await resetScanCount(email);
  if (!result) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  console.log(`[admin] Scan count reset for ${email} (scope=${result.scope}, identifier=${result.identifier})`);

  return Response.json({
    ok: true,
    message: `Scan count reset for ${email}`,
    scope: result.scope,
    identifier: result.identifier,
  });
}
