'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Company {
  name: string;
  url: string;
  nip: string;
}

interface ScanStatus {
  id: string;
  status: string;
  sectorId: string;
  entities: Array<{
    id: string;
    name: string;
    url: string;
    status: string;
    data: Record<string, unknown>;
    errors: string[];
  }>;
  phasesCompleted: string[];
  currentPhase: string | null;
  log: string[];
  totalCostUsd: number;
  createdAt: string;
  completedAt: string | null;
}

const PRESET_COMPANIES: Company[] = [
  { name: 'Dietly Box (Maczfit)', url: 'https://maczfit.pl', nip: '' },
  { name: 'Kuchnia Vikinga', url: 'https://kuchniavikinga.pl', nip: '' },
  { name: 'Cateromarket', url: 'https://cateromarket.pl', nip: '' },
];

function EntityDataPreview({ data }: { data: Record<string, Record<string, unknown>> }) {
  const positioning = data.brand_identity?.positioning;
  const priceRange = data.pricing?.price_range_pln;
  const deliveryModel = data.delivery?.delivery_model;
  const tone = data.brand_identity?.emotional_register;

  return (
    <>
      {positioning ? (
        <div className="font-editorial text-cs-md text-cs-ink italic mb-2">
          &ldquo;{String(positioning)}&rdquo;
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-4 mt-2">
        {priceRange ? (
          <div>
            <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver">PRICING</div>
            <div className="font-mono text-cs-sm font-semibold">{String(priceRange)}</div>
          </div>
        ) : null}
        {deliveryModel ? (
          <div>
            <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver">DELIVERY</div>
            <div className="font-mono text-cs-sm font-semibold">{String(deliveryModel)}</div>
          </div>
        ) : null}
        {tone ? (
          <div>
            <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver">TONE</div>
            <div className="font-mono text-cs-sm font-semibold">{String(tone)}</div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function ScanPage() {
  const [companies, setCompanies] = useState<Company[]>(PRESET_COMPANIES);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add company row
  const addCompany = () => {
    setCompanies([...companies, { name: '', url: '', nip: '' }]);
  };

  const removeCompany = (idx: number) => {
    setCompanies(companies.filter((_, i) => i !== idx));
  };

  const updateCompany = (idx: number, field: keyof Company, value: string) => {
    const updated = [...companies];
    updated[idx] = { ...updated[idx], [field]: value };
    setCompanies(updated);
  };

  // Start scan
  const startScan = async () => {
    const valid = companies.filter((c) => c.name && c.url);
    if (valid.length === 0) {
      setError('Dodaj przynajmniej jedną firmę z nazwą i URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: valid }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setScanId(data.scanId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Poll scan status
  const pollStatus = useCallback(async () => {
    if (!scanId) return;
    try {
      const res = await fetch(`/api/scan/${scanId}`);
      if (res.ok) {
        const data: ScanStatus = await res.json();
        setScanStatus(data);
      }
    } catch {
      // ignore poll errors
    }
  }, [scanId]);

  useEffect(() => {
    if (!scanId) return;
    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [scanId, pollStatus]);

  const isRunning = scanStatus?.status === 'running';
  const isComplete = scanStatus?.status === 'completed';

  return (
    <div className="min-h-screen p-8 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <div>
          <Link href="/" className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-silver hover:text-cs-black">
            ← CATSCAN
          </Link>
          <h1 className="font-display text-cs-2xl font-bold mt-2">SCAN_ENGINE</h1>
        </div>
        {isComplete && (
          <Link
            href="/chat"
            className="font-mono text-cs-sm uppercase tracking-[0.1em] border-2 border-cs-black px-4 py-2 hover:bg-cs-black hover:text-cs-white transition-colors"
          >
            Query_Results →
          </Link>
        )}
      </div>

      {/* Input form */}
      {!scanId && (
        <div className="mb-12">
          <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray mb-4">
            TARGET_ENTITIES
          </div>

          <div className="border border-cs-border">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1.5fr_0.8fr_40px] gap-0 bg-cs-canvas border-b border-cs-border">
              <div className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-cs-gray p-3 border-r border-cs-border">NAZWA</div>
              <div className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-cs-gray p-3 border-r border-cs-border">URL</div>
              <div className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-cs-gray p-3 border-r border-cs-border">NIP</div>
              <div></div>
            </div>

            {/* Rows */}
            {companies.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1.5fr_0.8fr_40px] gap-0 border-b border-cs-border last:border-b-0"
              >
                <input
                  value={c.name}
                  onChange={(e) => updateCompany(i, 'name', e.target.value)}
                  placeholder="Nazwa firmy"
                  className="font-mono text-cs-base p-3 bg-cs-white border-r border-cs-border focus:outline-none focus:bg-cs-canvas"
                />
                <input
                  value={c.url}
                  onChange={(e) => updateCompany(i, 'url', e.target.value)}
                  placeholder="https://example.pl"
                  className="font-mono text-cs-base p-3 bg-cs-white border-r border-cs-border focus:outline-none focus:bg-cs-canvas"
                />
                <input
                  value={c.nip}
                  onChange={(e) => updateCompany(i, 'nip', e.target.value)}
                  placeholder="opcjonalnie"
                  className="font-mono text-cs-base p-3 bg-cs-white border-r border-cs-border focus:outline-none focus:bg-cs-canvas"
                />
                <button
                  onClick={() => removeCompany(i)}
                  className="font-mono text-cs-silver hover:text-cs-black flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-4 mt-4">
            <button
              onClick={addCompany}
              className="font-mono text-cs-sm uppercase tracking-[0.1em] border border-cs-border px-4 py-2 hover:border-cs-black transition-colors"
            >
              + Dodaj_Firmę
            </button>
            <button
              onClick={startScan}
              disabled={loading}
              className="font-mono text-cs-sm uppercase tracking-[0.1em] bg-cs-black text-cs-white px-6 py-2 hover:bg-cs-ink transition-colors disabled:opacity-50"
            >
              {loading ? 'INITIATING...' : 'INITIATE_SCAN'}
            </button>
          </div>

          {error && (
            <div className="mt-4 font-mono text-cs-sm text-red-600 border border-red-300 bg-red-50 p-3">
              ERROR: {error}
            </div>
          )}
        </div>
      )}

      {/* Scan status */}
      {scanStatus && (
        <div>
          {/* Status bar */}
          <div className="flex items-center gap-4 mb-6 border-b border-cs-black pb-4">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : isComplete ? 'bg-green-600' : 'bg-red-500'}`} />
            <div className="font-mono text-cs-sm uppercase tracking-[0.1em]">
              {scanStatus.status}
            </div>
            {scanStatus.currentPhase && (
              <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-silver">
                // PHASE: {scanStatus.currentPhase}
              </div>
            )}
            <div className="ml-auto font-mono text-cs-xs text-cs-gray">
              COST: ${scanStatus.totalCostUsd.toFixed(4)}
            </div>
          </div>

          {/* Entity cards */}
          <div className="grid gap-4 mb-8">
            {scanStatus.entities.map((entity) => (
              <div key={entity.id} className="border border-cs-border bg-cs-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display text-cs-md font-bold uppercase">
                    {entity.name}
                  </div>
                  <div className={`font-mono text-[0.5625rem] uppercase tracking-[0.12em] px-2 py-0.5 border ${
                    entity.status === 'extracted' || entity.status === 'enriched'
                      ? 'border-green-600 text-green-700 bg-green-50'
                      : entity.status === 'failed'
                        ? 'border-red-400 text-red-600 bg-red-50'
                        : 'border-cs-border text-cs-gray'
                  }`}>
                    {entity.status}
                  </div>
                </div>
                <div className="font-mono text-cs-xs text-cs-silver">{entity.url}</div>

                {/* Show extracted data preview */}
                {entity.data && Object.keys(entity.data).filter(k => !k.startsWith('_')).length > 0 && (
                  <div className="mt-3 border-t border-cs-border pt-3">
                    <EntityDataPreview data={entity.data as Record<string, Record<string, unknown>>} />
                  </div>
                )}

                {entity.errors.length > 0 && (
                  <div className="mt-2 font-mono text-[0.5625rem] text-red-500">
                    {entity.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Log */}
          <div>
            <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray mb-2">
              PIPELINE_LOG
            </div>
            <div className="bg-cs-black text-cs-white p-4 font-mono text-[0.6875rem] leading-[1.6] max-h-[400px] overflow-y-auto">
              {scanStatus.log.map((line, i) => (
                <div key={i} className={line.startsWith('[') ? 'text-cs-silver' : line.includes('---') ? 'text-green-400 font-semibold mt-1' : ''}>
                  {line}
                </div>
              ))}
              {isRunning && <div className="text-yellow-400 animate-pulse mt-1">▌</div>}
            </div>
          </div>

          {/* Actions */}
          {isComplete && (
            <div className="flex gap-4 mt-6">
              <Link
                href="/chat"
                className="font-mono text-cs-sm uppercase tracking-[0.1em] bg-cs-black text-cs-white px-6 py-2 hover:bg-cs-ink transition-colors"
              >
                QUERY_DATA →
              </Link>
              <button
                onClick={() => { setScanId(null); setScanStatus(null); }}
                className="font-mono text-cs-sm uppercase tracking-[0.1em] border border-cs-border px-4 py-2 hover:border-cs-black transition-colors"
              >
                NEW_SCAN
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
