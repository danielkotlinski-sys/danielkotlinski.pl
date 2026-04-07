import { NextRequest } from 'next/server';
import { listOrgs, getOrg, saveOrg } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgs = await listOrgs();
  return Response.json({ orgs });
}

export async function PATCH(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { nip, action } = await request.json();
  if (!nip || action !== 'reset-scans') {
    return Response.json({ error: 'Missing nip or invalid action' }, { status: 400 });
  }

  const org = await getOrg(nip);
  if (!org) {
    return Response.json({ error: 'Org not found' }, { status: 404 });
  }

  org.scansThisMonth = 0;
  await saveOrg(org);

  return Response.json({ success: true, org });
}
