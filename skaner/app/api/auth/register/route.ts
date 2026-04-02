import { NextRequest } from 'next/server';
import { getUser, saveUser, hashPassword, notifyNewRegistration } from '@/lib/auth';
import type { User } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, phone, company, nip } = await request.json();

    if (!email || !password || !firstName || !phone) {
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
    const user: User = {
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      firstName: firstName.trim(),
      phone: phone.trim(),
      company: company?.trim() || undefined,
      nip: nip?.trim() || undefined,
      approved: false,
      createdAt: now.toISOString(),
      scansThisMonth: 0,
      lastScanReset: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    };

    await saveUser(user);
    await notifyNewRegistration(user);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Register error:', error);
    return Response.json({ error: 'Błąd rejestracji' }, { status: 500 });
  }
}
