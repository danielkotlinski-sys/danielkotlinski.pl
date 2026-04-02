import { NextRequest } from 'next/server';
import { sendPasswordResetEmail, resetPassword } from '@/lib/auth';

// POST /api/auth/reset-password — request reset (send email)
export async function POST(request: NextRequest) {
  const { email, token, newPassword } = await request.json();

  // If token + newPassword provided → actually reset the password
  if (token && newPassword) {
    if (newPassword.length < 8) {
      return Response.json({ error: 'Hasło musi mieć min. 8 znaków' }, { status: 400 });
    }

    const success = await resetPassword(token, newPassword);
    if (!success) {
      return Response.json({ error: 'Link wygasł lub jest nieprawidłowy. Poproś o nowy.' }, { status: 400 });
    }

    return Response.json({ success: true });
  }

  // Otherwise → send reset email
  if (!email) {
    return Response.json({ error: 'Podaj adres email' }, { status: 400 });
  }

  // Always return success to prevent email enumeration
  await sendPasswordResetEmail(email);
  return Response.json({ success: true });
}
