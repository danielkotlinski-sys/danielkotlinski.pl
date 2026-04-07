'use client';

import { useState } from 'react';
import type { ScanMeta } from '@/lib/redis';

interface UserData {
  email: string;
  firstName: string;
  phone: string;
  company?: string;
  nip?: string;
  orgId?: string;
  role?: 'owner' | 'member';
  approved: boolean;
  createdAt: string;
  scansThisMonth: number;
}

interface OrgData {
  nip: string;
  name: string;
  ownerEmail: string;
  members: string[];
  scansThisMonth: number;
  createdAt: string;
}

interface MonthCost {
  month: string;
  totalUsd: number;
  scanCount: number;
  byProvider: { anthropic: number; perplexity: number; jina: number; apify: number };
}

interface RecentScanCost {
  scanId: string;
  totalUsd: number;
  byProvider: Record<string, number>;
  createdAt: string;
}

type Tab = 'scans' | 'users' | 'orgs' | 'costs';

export default function AdminReportsPage() {
  const [secret, setSecret] = useState('');
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [monthlyCosts, setMonthlyCosts] = useState<MonthCost[]>([]);
  const [recentScanCosts, setRecentScanCosts] = useState<RecentScanCost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('scans');

  const headers = { 'x-admin-secret': secret };

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [scansRes, usersRes, orgsRes, costsRes] = await Promise.all([
        fetch('/api/admin/scans', { headers }),
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/orgs', { headers }),
        fetch('/api/admin/costs', { headers }),
      ]);
      if (!scansRes.ok || !usersRes.ok) {
        setError(scansRes.status === 401 ? 'Nieprawidłowy klucz' : 'Błąd serwera');
        return;
      }
      const [scansData, usersData, orgsData, costsData] = await Promise.all([scansRes.json(), usersRes.json(), orgsRes.json(), costsRes.json()]);
      setScans(scansData.scans || []);
      setUsers(usersData.users || []);
      setOrgs(orgsData.orgs || []);
      setMonthlyCosts(costsData.months || []);
      setRecentScanCosts(costsData.recentScans || []);
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
          <button
            onClick={() => setTab('orgs')}
            className={`font-heading text-2xl transition-colors ${tab === 'orgs' ? 'text-text-primary' : 'text-text-gray/40 hover:text-text-gray'}`}
          >
            Organizacje ({orgs.length})
          </button>
          <button
            onClick={() => setTab('costs')}
            className={`font-heading text-2xl transition-colors ${tab === 'costs' ? 'text-text-primary' : 'text-text-gray/40 hover:text-text-gray'}`}
          >
            Koszty
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
                      {user.role && <span className="text-dk-teal">{user.role === 'owner' ? 'Właściciel' : 'Członek'} org.</span>}
                      <span>{new Date(user.createdAt).toLocaleDateString('pl-PL')}</span>
                      <span>Wykorzystane skany: {user.scansThisMonth} z 3</span>
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

        {/* Orgs tab */}
        {tab === 'orgs' && (
          <div className="space-y-3">
            {orgs.length === 0 ? (
              <p className="text-text-gray">Brak organizacji.</p>
            ) : (
              orgs.map((org) => (
                <div key={org.nip} className="bg-white rounded-card p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-heading text-lg text-text-primary">{org.name}</span>
                    <span className="text-xs text-text-gray">NIP: {org.nip}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-gray mb-3">
                    <span>Właściciel: {org.ownerEmail}</span>
                    <span>Członków: {org.members.length}</span>
                    <span>Wykorzystane skany: {org.scansThisMonth} z 3</span>
                    <span>{new Date(org.createdAt).toLocaleDateString('pl-PL')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {org.members.map((email) => (
                      <span key={email} className={`text-[11px] px-2 py-0.5 rounded-pill ${
                        email === org.ownerEmail
                          ? 'bg-dk-teal/10 text-dk-teal'
                          : 'bg-beige text-text-muted'
                      }`}>
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Costs tab */}
        {tab === 'costs' && (
          <div className="space-y-6">
            {/* Monthly summary */}
            {monthlyCosts.length === 0 ? (
              <p className="text-text-gray">Brak danych o kosztach. Dane pojawią się po pierwszym skanie z włączonym trackingiem.</p>
            ) : (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  {monthlyCosts.map((m) => (
                    <div key={m.month} className="bg-white rounded-card p-5">
                      <p className="text-xs text-text-gray uppercase tracking-wider mb-2">{m.month}</p>
                      <p className="font-heading text-2xl text-text-primary">${m.totalUsd.toFixed(2)}</p>
                      <p className="text-xs text-text-gray mt-1">{m.scanCount} skanów</p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Claude</span>
                          <span className="text-text-primary font-medium">${m.byProvider.anthropic.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Perplexity</span>
                          <span className="text-text-primary font-medium">${m.byProvider.perplexity.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Apify</span>
                          <span className="text-text-primary font-medium">${m.byProvider.apify.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Jina</span>
                          <span className="text-text-primary font-medium">${m.byProvider.jina.toFixed(2)}</span>
                        </div>
                      </div>
                      {m.scanCount > 0 && (
                        <p className="text-[10px] text-text-gray mt-3 pt-2 border-t border-beige">
                          Średnio ${(m.totalUsd / m.scanCount).toFixed(2)} / skan
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Recent scans breakdown */}
                {recentScanCosts.length > 0 && (
                  <div>
                    <h3 className="font-heading text-lg text-text-primary mb-3">Ostatnie skany</h3>
                    <div className="space-y-2">
                      {recentScanCosts.map((scan) => (
                        <div key={scan.scanId} className="bg-white rounded-card px-5 py-3 flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary font-medium truncate">{scan.scanId.slice(0, 8)}...</p>
                            <p className="text-xs text-text-gray">{new Date(scan.createdAt).toLocaleString('pl-PL')}</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-text-muted shrink-0">
                            <span title="Claude">C: ${scan.byProvider.anthropic?.toFixed(2)}</span>
                            <span title="Perplexity">P: ${scan.byProvider.perplexity?.toFixed(2)}</span>
                            <span title="Apify">A: ${scan.byProvider.apify?.toFixed(2)}</span>
                            <span title="Jina">J: ${scan.byProvider.jina?.toFixed(2)}</span>
                          </div>
                          <span className="font-heading text-lg text-text-primary shrink-0">${scan.totalUsd.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
                        href={`/raport/${scan.scanId}`}
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
