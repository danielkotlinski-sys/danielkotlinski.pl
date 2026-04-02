import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
// ===================== TYPES =====================

export interface Organization {
  nip: string;
  name: string; // company name
  ownerEmail: string;
  members: string[]; // all member emails (including owner)
  scansThisMonth: number;
  lastScanReset: string;
  createdAt: string;
}

export interface User {
  email: string;
  passwordHash: string;
  firstName: string;
  phone: string;
  company?: string;
  nip?: string;
  orgId?: string; // NIP of the organization
  role?: 'owner' | 'member';
  approved: boolean;
  createdAt: string;
  scansThisMonth: number; // kept for backwards compat, org counter is primary
  lastScanReset: string;
}

export interface SessionPayload {
  email: string;
  firstName: string;
  approved: boolean;
}

// ===================== JWT =====================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'dev-fallback-secret-change-me'
);
const COOKIE_NAME = 'skaner_session';

export async function createSession(user: User): Promise<string> {
  const token = await new SignJWT({
    email: user.email,
    firstName: user.firstName,
    approved: user.approved,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(JWT_SECRET);

  return token;
}

export function setSessionCookie(token: string) {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ===================== PASSWORD =====================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ===================== USER STORAGE (Redis) =====================

// Dynamic import to avoid circular deps
async function getRedisClient() {
  const { getRedisRaw, memGet, memSet } = await import('./redis');
  return { getRedis: getRedisRaw, memGet, memSet };
}

export async function saveUser(user: User): Promise<void> {
  const json = JSON.stringify(user);
  const { getRedis, memSet } = await getRedisClient();
  const r = await getRedis();
  if (r) {
    await r.set(`user:${user.email.toLowerCase()}`, json);
    await r.sadd('users:all', user.email.toLowerCase());
  } else {
    memSet(`user:${user.email.toLowerCase()}`, json, 365 * 24 * 60 * 60);
  }
}

export async function getUser(email: string): Promise<User | null> {
  const { getRedis, memGet } = await getRedisClient();
  const r = await getRedis();
  const data = r
    ? await r.get(`user:${email.toLowerCase()}`)
    : memGet(`user:${email.toLowerCase()}`);
  if (!data) return null;
  return JSON.parse(data) as User;
}

export async function listUsers(): Promise<User[]> {
  const { getRedis } = await getRedisClient();
  const r = await getRedis();
  if (!r) return [];

  const emails = await r.smembers('users:all');
  if (emails.length === 0) return [];

  const pipeline = r.pipeline();
  for (const email of emails) {
    pipeline.get(`user:${email}`);
  }
  const results = await pipeline.exec();
  if (!results) return [];

  return results
    .map(([err, data]) => {
      if (err || !data) return null;
      try { return JSON.parse(data as string) as User; } catch { return null; }
    })
    .filter((u): u is User => u !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// ===================== ORGANIZATION STORAGE (Redis) =====================

export async function saveOrg(org: Organization): Promise<void> {
  const json = JSON.stringify(org);
  const { getRedis, memSet } = await getRedisClient();
  const r = await getRedis();
  if (r) {
    await r.set(`org:${org.nip}`, json);
    await r.sadd('orgs:all', org.nip);
  } else {
    memSet(`org:${org.nip}`, json, 365 * 24 * 60 * 60);
  }
}

export async function getOrg(nip: string): Promise<Organization | null> {
  const { getRedis, memGet } = await getRedisClient();
  const r = await getRedis();
  const data = r
    ? await r.get(`org:${nip}`)
    : memGet(`org:${nip}`);
  if (!data) return null;
  return JSON.parse(data) as Organization;
}

export async function listOrgs(): Promise<Organization[]> {
  const { getRedis } = await getRedisClient();
  const r = await getRedis();
  if (!r) return [];

  const nips = await r.smembers('orgs:all');
  if (nips.length === 0) return [];

  const pipeline = r.pipeline();
  for (const nip of nips) {
    pipeline.get(`org:${nip}`);
  }
  const results = await pipeline.exec();
  if (!results) return [];

  return results
    .map(([err, data]) => {
      if (err || !data) return null;
      try { return JSON.parse(data as string) as Organization; } catch { return null; }
    })
    .filter((o): o is Organization => o !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function addMemberToOrg(nip: string, email: string): Promise<boolean> {
  const org = await getOrg(nip);
  if (!org) return false;
  const lowerEmail = email.toLowerCase();
  if (!org.members.includes(lowerEmail)) {
    org.members.push(lowerEmail);
    await saveOrg(org);
  }
  return true;
}

export async function removeMemberFromOrg(nip: string, email: string): Promise<boolean> {
  const org = await getOrg(nip);
  if (!org) return false;
  const lowerEmail = email.toLowerCase();
  if (lowerEmail === org.ownerEmail) return false; // can't remove owner
  org.members = org.members.filter((m) => m !== lowerEmail);
  await saveOrg(org);

  // Deactivate removed member and clear org reference
  const user = await getUser(email);
  if (user) {
    user.orgId = undefined;
    user.role = undefined;
    user.approved = false;
    await saveUser(user);
  }
  return true;
}

// ===================== SCAN LIMITS =====================

const MONTHLY_SCAN_LIMIT = 3;

function resetIfNewMonth(entity: { scansThisMonth: number; lastScanReset: string }): boolean {
  const now = new Date();
  const resetDate = new Date(entity.lastScanReset);
  if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    entity.scansThisMonth = 0;
    entity.lastScanReset = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return true;
  }
  return false;
}

export async function checkScanLimit(email: string): Promise<{ allowed: boolean; remaining: number }> {
  const user = await getUser(email);
  if (!user) return { allowed: false, remaining: 0 };

  // If user belongs to an org, use org-level counter
  if (user.orgId) {
    const org = await getOrg(user.orgId);
    if (org) {
      if (resetIfNewMonth(org)) await saveOrg(org);
      const remaining = MONTHLY_SCAN_LIMIT - org.scansThisMonth;
      return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
    }
  }

  // Fallback to user-level counter
  if (resetIfNewMonth(user)) await saveUser(user);
  const remaining = MONTHLY_SCAN_LIMIT - user.scansThisMonth;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
}

export async function incrementScanCount(email: string): Promise<void> {
  const user = await getUser(email);
  if (!user) return;

  // If user belongs to an org, increment org counter
  if (user.orgId) {
    const org = await getOrg(user.orgId);
    if (org) {
      if (resetIfNewMonth(org)) {
        org.scansThisMonth = 1;
      } else {
        org.scansThisMonth++;
      }
      await saveOrg(org);
      return;
    }
  }

  // Fallback to user-level counter
  const now = new Date();
  const resetDate = new Date(user.lastScanReset);
  if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    user.scansThisMonth = 1;
    user.lastScanReset = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  } else {
    user.scansThisMonth++;
  }
  await saveUser(user);
}

// ===================== EMAIL NOTIFICATION =====================

export async function notifyNewRegistration(user: User): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!resendApiKey || !notifyEmail) {
    console.log('[auth] No RESEND_API_KEY or NOTIFY_EMAIL — skipping notification');
    return;
  }

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Skaner Kategorii <skaner@danielkotlinski.pl>',
        to: notifyEmail,
        subject: `Nowa rejestracja: ${user.firstName} (${user.company || 'brak firmy'})`,
        html: `
          <h2>Nowa rejestracja w Skanerze Kategorii</h2>
          <p><strong>Imię:</strong> ${user.firstName}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Telefon:</strong> ${user.phone}</p>
          <p><strong>Firma:</strong> ${user.company || '—'}</p>
          <p><strong>NIP:</strong> ${user.nip || '—'}</p>
          <p><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</p>
          <br>
          <p>Zaloguj się do <a href="https://skaner.danielkotlinski.pl/admin/reports">panelu admina</a>, żeby zatwierdzić konto.</p>
        `,
      }),
    });
    console.log('[auth] Registration notification sent');
  } catch (err) {
    console.error('[auth] Failed to send notification:', err);
  }
}

export async function notifyAccountApproved(user: User): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.log('[auth] No RESEND_API_KEY — cannot send approval email');
    return;
  }

  console.log('[auth] Sending approval email to', user.email);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Skaner Kategorii <skaner@danielkotlinski.pl>',
        to: user.email,
        subject: 'Twoje konto w Skanerze Kategorii zostało aktywowane',
        html: `
          <p>Cześć ${user.firstName},</p>
          <p>Twoje konto w Skanerze Kategorii zostało zatwierdzone. Możesz się teraz zalogować i uruchomić pierwszy skan.</p>
          <p><a href="https://skaner.danielkotlinski.pl" style="display:inline-block;padding:12px 24px;background:#E8734A;color:white;text-decoration:none;border-radius:24px;font-weight:500;">Zaloguj się do Skanera</a></p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Masz 3 bezpłatne skany miesięcznie. Każdy skan analizuje komunikację 3-5 marek w Twojej kategorii.</p>
          <p>Daniel Kotliński</p>
        `,
      }),
    });
    const resBody = await res.text();
    console.log('[auth] Approval email response:', res.status, resBody);
  } catch (err) {
    console.error('[auth] Failed to send approval notification:', err);
  }
}

// ===================== SCAN COMPLETE NOTIFICATION =====================

export async function notifyScanComplete(email: string, category: string, brandName: string, reportUrl: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  const user = await getUser(email);
  if (!user) return;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Skaner Kategorii <skaner@danielkotlinski.pl>',
        to: user.email,
        subject: `Raport gotowy: ${brandName} w kategorii ${category}`,
        html: `
          <p>Cześć ${user.firstName},</p>
          <p>Twój skan kategorii <strong>${category}</strong> dla marki <strong>${brandName}</strong> jest gotowy.</p>
          <p><a href="${reportUrl}" style="display:inline-block;padding:12px 24px;background:#E8734A;color:white;text-decoration:none;border-radius:24px;font-weight:500;">Zobacz raport</a></p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Raport możesz też pobrać w formacie PDF, Markdown lub TXT po zalogowaniu.</p>
          <p>Daniel Kotliński</p>
        `,
      }),
    });
    const resBody = await res.text();
    console.log('[auth] Scan complete email:', res.status, resBody);
  } catch (err) {
    console.error('[auth] Failed to send scan complete notification:', err);
  }
}

// ===================== PASSWORD RESET =====================

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await getUser(email);
  if (!user) return null;

  const token = await new SignJWT({ email: user.email, purpose: 'password-reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(JWT_SECRET);

  return token;
}

export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== 'password-reset') return null;
    return payload.email as string;
  } catch {
    return null;
  }
}

export async function sendPasswordResetEmail(email: string): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.log('[auth] No RESEND_API_KEY — cannot send reset email');
    return false;
  }

  const token = await createPasswordResetToken(email);
  if (!token) return false;

  const resetUrl = `https://skaner.danielkotlinski.pl/reset-hasla?token=${token}`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Skaner Kategorii <skaner@danielkotlinski.pl>',
        to: email,
        subject: 'Reset hasła — Skaner Kategorii',
        html: `
          <p>Ktoś poprosił o reset hasła dla tego adresu email w Skanerze Kategorii.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#E8734A;color:white;text-decoration:none;border-radius:24px;font-weight:500;">Ustaw nowe hasło</a></p>
          <p style="color:#888;font-size:13px;">Link jest ważny przez 1 godzinę. Jeśli to nie Ty — zignoruj tę wiadomość.</p>
        `,
      }),
    });
    console.log('[auth] Password reset email sent to', email);
    return true;
  } catch (err) {
    console.error('[auth] Failed to send reset email:', err);
    return false;
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const email = await verifyPasswordResetToken(token);
  if (!email) return false;

  const user = await getUser(email);
  if (!user) return false;

  user.passwordHash = await hashPassword(newPassword);
  await saveUser(user);
  return true;
}
