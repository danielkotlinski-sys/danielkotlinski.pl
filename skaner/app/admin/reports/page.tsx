'use client';

import { useState } from 'react';
import type { ScanMeta } from '@/lib/redis';

export default function AdminReportsPage() {
  const [secret, setSecret] = useState('');
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchScans = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/scans', {
        headers: { 'x-admin-secret': secret },
      });
      if (!res.ok) {
        setError(res.status === 401 ? 'Nieprawidłowy klucz' : 'Błąd serwera');
        return;
      }
      const data = await res.json();
      setScans(data.scans || []);
      setLoaded(true);
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
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
            onKeyDown={(e) => e.key === 'Enter' && fetchScans()}
            className="w-full px-4 py-3 rounded-xl border border-beige-dark bg-white text-text-primary mb-4"
          />
          <button
            onClick={fetchScans}
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-heading text-3xl text-text-primary">
            Skany ({scans.length})
          </h1>
          <button
            onClick={fetchScans}
            className="text-sm px-4 py-2 bg-white rounded-pill text-text-muted hover:text-text-primary transition-colors"
          >
            Odśwież
          </button>
        </div>

        {scans.length === 0 ? (
          <p className="text-text-gray">Brak skanów w bazie.</p>
        ) : (
          <div className="space-y-4">
            {scans.map((scan) => (
              <div key={scan.scanId} className="bg-white rounded-card p-6">
                {/* Header row */}
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

                {/* Lead info */}
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

                {/* Brands */}
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

                {/* Client description if provided */}
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
      </div>
    </main>
  );
}
