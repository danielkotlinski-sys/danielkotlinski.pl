import { getSession, getUser, checkScanLimit } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ authenticated: false });
  }

  // Fetch fresh user data (approval status may have changed)
  const user = await getUser(session.email);
  if (!user) {
    return Response.json({ authenticated: false });
  }

  const { remaining } = await checkScanLimit(user.email);

  return Response.json({
    authenticated: true,
    user: {
      email: user.email,
      firstName: user.firstName,
      company: user.company,
      approved: user.approved,
    },
    scansRemaining: remaining,
  });
}
