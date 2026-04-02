import { NextRequest } from 'next/server';
import { listOrgs } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgs = await listOrgs();
  return Response.json({ orgs });
}
