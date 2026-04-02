import { getSession, getUser, checkScanLimit, getOrg } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ authenticated: false });
  }

  const user = await getUser(session.email);
  if (!user) {
    return Response.json({ authenticated: false });
  }

  const { remaining } = await checkScanLimit(user.email);

  // Include org info if user belongs to one
  let org = null;
  if (user.orgId) {
    const orgData = await getOrg(user.orgId);
    if (orgData) {
      org = {
        nip: orgData.nip,
        name: orgData.name,
        memberCount: orgData.members.length,
        isOwner: user.role === 'owner',
      };
    }
  }

  return Response.json({
    authenticated: true,
    user: {
      email: user.email,
      firstName: user.firstName,
      company: user.company,
      approved: user.approved,
      role: user.role,
      orgId: user.orgId,
    },
    org,
    scansRemaining: remaining,
  });
}
