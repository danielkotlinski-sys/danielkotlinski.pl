import { NextRequest } from 'next/server';
import { getSession, getUser, getOrg, saveUser, hashPassword, addMemberToOrg, removeMemberFromOrg } from '@/lib/auth';
import type { User } from '@/lib/auth';

// GET /api/team — list org members
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUser(session.email);
  if (!user?.orgId) return Response.json({ error: 'Nie należysz do żadnej organizacji' }, { status: 400 });

  const org = await getOrg(user.orgId);
  if (!org) return Response.json({ error: 'Organizacja nie istnieje' }, { status: 404 });

  // Fetch all member details
  const members = await Promise.all(
    org.members.map(async (email) => {
      const member = await getUser(email);
      if (!member) return null;
      return {
        email: member.email,
        firstName: member.firstName,
        role: member.role || 'member',
        approved: member.approved,
        createdAt: member.createdAt,
      };
    })
  );

  return Response.json({
    org: {
      nip: org.nip,
      name: org.name,
      ownerEmail: org.ownerEmail,
      scansThisMonth: org.scansThisMonth,
      memberCount: org.members.length,
    },
    members: members.filter(Boolean),
    isOwner: user.role === 'owner',
  });
}

// POST /api/team — invite a new member (owner only)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const owner = await getUser(session.email);
  if (!owner?.orgId || owner.role !== 'owner') {
    return Response.json({ error: 'Tylko właściciel organizacji może zapraszać członków' }, { status: 403 });
  }

  const org = await getOrg(owner.orgId);
  if (!org) return Response.json({ error: 'Organizacja nie istnieje' }, { status: 404 });

  const { email, firstName, password } = await request.json();
  if (!email || !firstName || !password) {
    return Response.json({ error: 'Podaj email, imię i hasło nowego członka' }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: 'Hasło musi mieć min. 8 znaków' }, { status: 400 });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existing = await getUser(cleanEmail);
  if (existing) {
    // If user exists but not in this org, we can't re-assign
    if (existing.orgId && existing.orgId !== org.nip) {
      return Response.json({ error: 'Ten użytkownik należy już do innej organizacji' }, { status: 409 });
    }
    // If already in this org
    if (existing.orgId === org.nip) {
      return Response.json({ error: 'Ten użytkownik jest już członkiem Twojej organizacji' }, { status: 409 });
    }
    // User exists without org — link them
    existing.orgId = org.nip;
    existing.role = 'member';
    await saveUser(existing);
    await addMemberToOrg(org.nip, cleanEmail);
    return Response.json({ success: true, message: 'Użytkownik dodany do organizacji' });
  }

  // Create new user account for the invited member
  const now = new Date();
  const newUser: User = {
    email: cleanEmail,
    passwordHash: await hashPassword(password),
    firstName: firstName.trim(),
    phone: '',
    company: org.name,
    nip: org.nip,
    orgId: org.nip,
    role: 'member',
    approved: true, // auto-approved when invited by owner
    createdAt: now.toISOString(),
    scansThisMonth: 0,
    lastScanReset: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
  };

  await saveUser(newUser);
  await addMemberToOrg(org.nip, cleanEmail);

  return Response.json({ success: true, message: 'Nowy członek został dodany' });
}

// DELETE /api/team — remove a member (owner only)
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const owner = await getUser(session.email);
  if (!owner?.orgId || owner.role !== 'owner') {
    return Response.json({ error: 'Tylko właściciel organizacji może usuwać członków' }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email) return Response.json({ error: 'Podaj email członka' }, { status: 400 });

  if (email.toLowerCase() === owner.email) {
    return Response.json({ error: 'Nie możesz usunąć siebie z organizacji' }, { status: 400 });
  }

  const success = await removeMemberFromOrg(owner.orgId, email);
  if (!success) {
    return Response.json({ error: 'Nie udało się usunąć członka' }, { status: 400 });
  }

  return Response.json({ success: true });
}
