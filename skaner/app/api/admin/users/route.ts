import { NextRequest } from 'next/server';
import { listUsers, getUser, saveUser, notifyAccountApproved } from '@/lib/auth';

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

  const wasApproved = user.approved;
  user.approved = approved;
  await saveUser(user);

  // Send email when approving (not when blocking)
  if (approved && !wasApproved) {
    console.log('[admin] User newly approved, sending notification to', user.email);
    await notifyAccountApproved(user);
  } else {
    console.log('[admin] Approval state:', { wasApproved, approved, email: user.email });
  }

  return Response.json({ success: true, user: { email: user.email, approved: user.approved } });
}
