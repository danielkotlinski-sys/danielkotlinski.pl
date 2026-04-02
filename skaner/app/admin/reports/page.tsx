'use client';

import { useState } from 'react';
import type { ScanMeta } from '@/lib/redis';

interface UserData {
  email: string;
  firstName: string;
  phone: string;
  company?: string;
  nip?: string;
  approved: boolean;
  createdAt: string;
  scansThisMonth: number;
}

type Tab = 'scans' | 'users';

export default function AdminReportsPage() {
  const [secret, setSecret] = useState('');
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('scans');

  const headers = { 'x-admin-secret': secret };

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [scansRes, usersRes] = await Promise.all([
        fetch('/api/admin/scans', { headers }),
        fetch('/api/admin/users', { headers }),
      ]);
      if (!scansRes.ok || !usersRes.ok) {
        setError(scansRes.status === 401 ? 'Nieprawidłowy klucz' : 'Błąd serwera');
        return;
      }
      const [scansData, usersData] = await Promise.all([scansRes.json(), usersRes.json()]);
      setScans(scansData.scans || []);
      setUsers(usersData.users || []);
      setLoaded(true);
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = async (email: string, approved: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, approved }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.email === email ? { ...u, approved } : u))
        );
      }
    } catch {
      // silently fail
    }
  };

  if (!loaded) {
    return (
      <main className="min-h-screen bg-beige py-24 px-6">
        <div className="max-w-md mx-auto">
          <h1 className="font-heading text-3xl text-text-primary mb-8">Admin Panel</h1>
          <input
            type="password"
            placeholder="ADMIN_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchAll()}
            className="w-full px-4 py-3 rounded-xl border border-beige-dark bg-white text-text-primary mb-4"
          />
          <button
            onClick={fetchAll}
            disabled={loading || !secret}
            className="w-full px-6 py-3 bg-dk-teal text-white rounded-pill font-medium hover:bg-dk-teal-hover transition-all disabled:opacity-50"
          >
            {loading ? 'Ładowanie...' : 'Zaloguj'}
          </button>
          {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-beige py-12 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Tab navigation */}
        <div className="flex items-center gap-6 mb-8">
          <button
            onClick={() => setTab('scans')}
            className={`font-heading text-2xl transition-colors ${tab === 'scans' ? 'text-text-primary' : 'text-text-gray/40 hover:text-text-gray'}`}
          >
            Skany ({scans.length})
          </button>
          <button
            onClick={() => setTab('users')}
            className={`font-heading text-2xl transition-colors ${tab === 'users' ? 'text-text-primary' : 'text-text-gray/40 hover:text-text-gray'}`}
          >
            Użytkownicy ({users.length})
          </button>
          <div className="flex-1" />
          <button
            onClick={fetchAll}
            className="text-sm px-4 py-2 bg-white rounded-pill text-text-muted hover:text-text-primary transition-colors"
          >
            Odśwież
          </button>
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          <div className="space-y-3">
            {users.length === 0 ? (
              <p className="text-text-gray">Brak zarejestrowanych użytkowników.</p>
            ) : (
              users.map((user) => (
                <div key={user.email} className="bg-white rounded-card p-5 flex items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-heading text-lg text-text-primary">{user.firstName}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-pill uppercase font-medium ${
                        user.approved
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {user.approved ? 'Aktywne' : 'Czeka'}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted">{user.email}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-text-gray">
                      <span>{user.phone}</span>
                      {user.company && <span>{user.company}</span>}
                      {user.nip && <span>NIP: {user.nip}</span>}
                      <span>{new Date(user.createdAt).toLocaleDateString('pl-PL')}</span>
                      <span>Skanów w tym miesiącu: {user.scansThisMonth}/3</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleApproval(user.email, !user.approved)}
                    className={`shrink-0 text-xs px-4 py-2 rounded-pill font-medium transition-colors ${
                      user.approved
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                    }`}
                  >
                    {user.approved ? 'Zablokuj' : 'Zatwierdź'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Scans tab */}
        {tab === 'scans' && (
          <>
            {scans.length === 0 ? (
              <p className="text-text-gray">Brak skanów w bazie.</p>
            ) : (
              <div className="space-y-4">
                {scans.map((scan) => (
                  <div key={scan.scanId} className="bg-white rounded-card p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div>
                        <h2 className="font-heading text-xl text-text-primary">
                          {scan.input.clientBrand.name}
                        </h2>
                        <p className="text-sm text-text-gray">
                          {new Date(scan.createdAt).toLocaleString('pl-PL')}
                        </p>
                      </div>
                      <a
                        href={scan.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 bg-dk-teal text-white rounded-pill hover:bg-dk-teal-hover transition-colors"
                      >
                        Otwórz raport
                      </a>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-beige">
                      <div>
                        <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Kontakt</p>
                        <p className="text-sm text-text-primary font-medium">{scan.lead.firstName}</p>
                        <p className="text-sm text-text-muted">{scan.lead.email}</p>
                        {scan.lead.company && (
                          <p className="text-sm text-text-muted">{scan.lead.company}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Kategoria</p>
                        <p className="text-sm text-text-muted">{scan.input.category}</p>
                        <span className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill uppercase">
                          {scan.input.categoryType}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Cel kategorii</p>
                        <p className="text-sm text-text-muted line-clamp-3">{scan.input.categoryPurpose}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-text-gray uppercase tracking-wider mb-2">Marki</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs px-3 py-1 bg-dk-teal/10 text-dk-teal rounded-pill font-medium">
                          {scan.input.clientBrand.name}
                        </span>
                        {scan.input.competitors.map((c, i) => (
                          <span key={i} className="text-xs px-3 py-1 bg-beige-light text-text-muted rounded-pill">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    {scan.input.clientDescription && (
                      <div className="mt-4 pt-4 border-t border-beige">
                        <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Opis klienta</p>
                        <p className="text-sm text-text-muted">{scan.input.clientDescription}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
