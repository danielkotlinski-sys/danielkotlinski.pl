'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputStyles =
    'w-full px-4 py-3 bg-white border border-beige-dark/30 rounded-card text-[15px] text-text-primary placeholder:text-text-gray/50 focus:outline-none focus:border-dk-teal/40 focus:ring-1 focus:ring-dk-teal/20 transition-colors';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Hasła nie są identyczne');
      return;
    }
    if (newPassword.length < 8) {
      setError('Hasło musi mieć min. 8 znaków');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Błąd resetu hasła');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="max-w-md mx-auto text-center">
            <h2 className="font-heading text-2xl text-text-primary mb-4">Nieprawidłowy link</h2>
            <p className="text-text-muted text-sm mb-6">Link do resetu hasła jest nieprawidłowy lub wygasł.</p>
            <a href="/" className="text-sm text-dk-teal hover:text-dk-teal/80 transition-colors">
              Wróć do logowania
            </a>
          </div>
        </main>
      </>
    );
  }

  if (success) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="font-heading text-2xl text-text-primary mb-4">Hasło zmienione</h2>
            <p className="text-text-muted text-sm mb-6">Możesz się teraz zalogować nowym hasłem.</p>
            <a
              href="/"
              className="inline-flex items-center px-6 py-3 bg-dk-orange text-white rounded-pill font-medium hover:bg-dk-orange-hover transition-all"
            >
              Zaloguj się
            </a>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen py-24 px-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-card p-8 md:p-10">
            <h2 className="font-heading text-3xl text-text-primary mb-2">Ustaw nowe hasło</h2>
            <p className="text-text-muted text-sm mb-8">Wpisz nowe hasło do swojego konta.</p>

            {error && (
              <div className="bg-red-50 border border-red-200/50 rounded-xl px-4 py-3 mb-6">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Nowe hasło</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputStyles}
                  placeholder="Min. 8 znaków"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Powtórz hasło</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputStyles}
                  placeholder="Min. 8 znaków"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-dk-orange text-white rounded-card font-medium text-[15px] hover:bg-dk-orange-hover transition-all disabled:opacity-50"
              >
                {loading ? 'Zmieniam...' : 'Zmień hasło'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="flex justify-center">
            <span className="inline-block w-6 h-6 border-2 border-dk-teal border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      </>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
