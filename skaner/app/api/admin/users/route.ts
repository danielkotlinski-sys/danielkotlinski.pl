import { NextRequest } from 'next/server';
import { listUsers, getUser, saveUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await listUsers();
  return Response.json({ users });
}

export async function PATCH(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, approved } = await request.json();
  if (!email || typeof approved !== 'boolean') {
    return Response.json({ error: 'Missing email or approved field' }, { status: 400 });
  }

  const user = await getUser(email);
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  user.approved = approved;
  await saveUser(user);

  return Response.json({ success: true, user: { email: user.email, approved: user.approved } });
}
