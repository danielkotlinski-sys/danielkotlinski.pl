import { NextRequest } from 'next/server';
import { clearRateLimit } from '@/lib/redis';

export async function POST(request: NextRequest) {
  const { email, secret } = await request.json();

  if (secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!email) {
    return Response.json({ error: 'Email required' }, { status: 400 });
  }

  await clearRateLimit(email);
  return Response.json({ ok: true, message: `Rate limit cleared for ${email}` });
}
