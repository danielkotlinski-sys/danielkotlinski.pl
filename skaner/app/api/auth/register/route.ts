import { NextRequest } from 'next/server';
import { getUser, saveUser, hashPassword, notifyNewRegistration, getOrg, saveOrg } from '@/lib/auth';
import type { User, Organization } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, phone, company, nip } = await request.json();

    if (!email || !password || !firstName || !phone || !company || !nip) {
      return Response.json({ error: 'Wypełnij wszystkie wymagane pola' }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: 'Hasło musi mieć min. 8 znaków' }, { status: 400 });
    }

    const existing = await getUser(email);
    if (existing) {
      return Response.json({ error: 'Konto z tym adresem email już istnieje' }, { status: 409 });
    }

    const now = new Date();
    const cleanNip = nip.trim().replace(/[\s-]/g, '');
    const cleanEmail = email.toLowerCase().trim();

    // Check if an org with this NIP already exists
    const existingOrg = await getOrg(cleanNip);
    const isOwner = !existingOrg; // first user with this NIP becomes owner

    const user: User = {
      email: cleanEmail,
      passwordHash: await hashPassword(password),
      firstName: firstName.trim(),
      phone: phone.trim(),
      company: company.trim(),
      nip: cleanNip,
      orgId: cleanNip,
      role: isOwner ? 'owner' : 'member',
      approved: false,
      createdAt: now.toISOString(),
      scansThisMonth: 0,
      lastScanReset: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    };

    await saveUser(user);

    if (isOwner) {
      // Create new organization
      const org: Organization = {
        nip: cleanNip,
        name: company.trim(),
        ownerEmail: cleanEmail,
        members: [cleanEmail],
        scansThisMonth: 0,
        lastScanReset: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        createdAt: now.toISOString(),
      };
      await saveOrg(org);
    } else {
      // Add to existing org as member (pending admin approval like everyone)
      existingOrg.members.push(cleanEmail);
      await saveOrg(existingOrg);
    }

    await notifyNewRegistration(user);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Register error:', error);
    return Response.json({ error: 'Błąd rejestracji' }, { status: 500 });
  }
}
