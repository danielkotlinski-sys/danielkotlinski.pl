import { NextRequest } from 'next/server';
import { getUser, verifyPassword, createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: 'Podaj email i hasło' }, { status: 400 });
    }

    const user = await getUser(email);
    if (!user) {
      return Response.json({ error: 'Nieprawidłowy email lub hasło' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: 'Nieprawidłowy email lub hasło' }, { status: 401 });
    }

    if (!user.approved) {
      return Response.json({
        error: 'Twoje konto czeka na aktywację. Otrzymasz powiadomienie email, gdy konto zostanie zatwierdzone.',
        pendingApproval: true,
      }, { status: 403 });
    }

    const token = await createSession(user);
    setSessionCookie(token);

    return Response.json({
      success: true,
      user: {
        email: user.email,
        firstName: user.firstName,
        company: user.company,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return Response.json({ error: 'Błąd logowania' }, { status: 500 });
  }
}
