'use client';

import { useState } from 'react';

interface AuthGateProps {
  onAuthenticated: (user: { email: string; firstName: string; company?: string }, scansRemaining: number) => void;
}

type Mode = 'login' | 'register' | 'pending';

export default function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regFirstName, setRegFirstName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regNip, setRegNip] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');

  const inputStyles =
    'w-full px-4 py-3 bg-white border border-beige-dark/30 rounded-card text-[15px] text-text-primary placeholder:text-text-gray/50 focus:outline-none focus:border-dk-teal/40 focus:ring-1 focus:ring-dk-teal/20 transition-colors';
  const labelStyles = 'block text-sm font-medium text-text-secondary mb-2';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.pendingApproval) {
        setMode('pending');
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Błąd logowania');
        return;
      }

      // Fetch session to get scansRemaining
      const sessionRes = await fetch('/api/auth/session');
      const sessionData = await sessionRes.json();

      onAuthenticated(data.user, sessionData.scansRemaining ?? 3);
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (regPassword !== regPasswordConfirm) {
      setError('Hasła nie są identyczne');
      setLoading(false);
      return;
    }

    if (regPassword.length < 8) {
      setError('Hasło musi mieć min. 8 znaków');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          firstName: regFirstName,
          phone: regPhone,
          company: regCompany || undefined,
          nip: regNip || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Błąd rejestracji');
        return;
      }

      setMode('pending');
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'pending') {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-card p-8 md:p-10 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
              <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="font-heading text-2xl text-text-primary mb-3">
            Konto czeka na aktywację
          </h2>
          <p className="text-text-muted text-[15px] leading-relaxed mb-6">
            Twoje konto zostało utworzone. Otrzymasz powiadomienie email, gdy zostanie zatwierdzone. Zwykle zajmuje to do 24 godzin.
          </p>
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className="text-sm text-dk-teal hover:text-dk-teal/80 transition-colors"
          >
            Wróć do logowania
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-card p-8 md:p-10">
        <h2 className="font-heading text-3xl text-text-primary mb-2">
          {mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
        </h2>
        <p className="text-text-muted text-sm mb-8">
          {mode === 'login'
            ? 'Zaloguj się, żeby uruchomić skan kategorii.'
            : 'Rejestracja wymaga ręcznego zatwierdzenia konta.'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200/50 rounded-xl px-4 py-3 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className={labelStyles}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputStyles}
                placeholder="twoj@email.pl"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>Hasło</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyles}
                placeholder="Min. 8 znaków"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-dk-orange text-white rounded-card font-medium text-[15px] hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
            >
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className={labelStyles}>Imię *</label>
              <input
                type="text"
                value={regFirstName}
                onChange={(e) => setRegFirstName(e.target.value)}
                className={inputStyles}
                placeholder="Jan"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>Email *</label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className={inputStyles}
                placeholder="jan@firma.pl"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>Telefon *</label>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                className={inputStyles}
                placeholder="+48 600 000 000"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>Firma *</label>
              <input
                type="text"
                value={regCompany}
                onChange={(e) => setRegCompany(e.target.value)}
                className={inputStyles}
                placeholder="Nazwa firmy"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>NIP *</label>
              <input
                type="text"
                value={regNip}
                onChange={(e) => setRegNip(e.target.value)}
                className={inputStyles}
                placeholder="1234567890"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>Hasło *</label>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className={inputStyles}
                placeholder="Min. 8 znaków"
                required
              />
            </div>
            <div>
              <label className={labelStyles}>Powtórz hasło *</label>
              <input
                type="password"
                value={regPasswordConfirm}
                onChange={(e) => setRegPasswordConfirm(e.target.value)}
                className={inputStyles}
                placeholder="Min. 8 znaków"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-dk-orange text-white rounded-card font-medium text-[15px] hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
            >
              {loading ? 'Rejestruję...' : 'Utwórz konto'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          {mode === 'login' ? (
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className="text-sm text-dk-teal hover:text-dk-teal/80 transition-colors"
            >
              Nie masz konta? Zarejestruj się
            </button>
          ) : (
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className="text-sm text-dk-teal hover:text-dk-teal/80 transition-colors"
            >
              Masz już konto? Zaloguj się
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
