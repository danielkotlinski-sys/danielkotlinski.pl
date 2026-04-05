'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ── Types ──

interface ScanStatus {
  id: string;
  status: string;
  entities: Array<{
    id: string;
    name: string;
    url: string;
    domain?: string;
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
  mode?: string;
  brands?: Array<{ name: string; missing?: string[] }>;
}

interface DbStats {
  totalBrands: number;
  scannedBrands: number;
  completeBrands: number;
  incompleteBrands: number;
  financialYears: number;
  socialPosts: number;
  incompleteList: Array<{ slug: string; name: string; dims: number; missing: string[] }>;
  recentScans: Array<{ slug: string; phase_count: number; updated_at: string }>;
}

const EXPECTED_DIMS = [
  'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
  'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
  'customer_acquisition', 'differentiators', 'visual_identity', 'context',
  'social', 'ads', 'reviews', 'finance',
];

const ALL_PHASES = [
  'crawl', 'extract', 'visual', 'context', 'pricing_fallback', 'discovery',
  'social', 'ads', 'reviews', 'finance', 'interpret'
];

// ── Main Component ──

export default function ScanDashboard() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // which action is loading
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'manual' | 'log'>('dashboard');
  const logRef = useRef<HTMLDivElement>(null);

  // Manual scan fields
  const [manualName, setManualName] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  // ── Fetch DB stats ──
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Poll active scan ──
  const pollScan = useCallback(async () => {
    if (!activeScanId) return;
    try {
      const res = await fetch(`/api/scan/${activeScanId}`);
      if (res.ok) {
        const data: ScanStatus = await res.json();
        setScanStatus(data);
        if (data.status === 'completed' || data.status === 'failed') {
          fetchStats(); // refresh stats when done
        }
      }
    } catch { /* ignore */ }
  }, [activeScanId, fetchStats]);

  useEffect(() => {
    if (!activeScanId) return;
    pollScan();
    const interval = setInterval(pollScan, 3000);
    return () => clearInterval(interval);
  }, [activeScanId, pollScan]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [scanStatus?.log.length]);

  // ── Actions ──

  const startBatch = async (size: number) => {
    setLoading('batch');
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: size }),
      });
      const data = await res.json();
      if (data.scanId) {
        setActiveScanId(data.scanId);
        setScanStatus(null);
        setTab('log');
      } else {
        setError(data.message || data.error || 'Unknown response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const startRescanIncomplete = async () => {
    setLoading('rescan');
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescan_incomplete: true }),
      });
      const data = await res.json();
      if (data.scanId) {
        setActiveScanId(data.scanId);
        setScanStatus(null);
        setTab('log');
      } else {
        setError(data.message || data.error || 'Unknown response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const startManualScan = async () => {
    if (!manualName || !manualUrl) { setError('Podaj nazwę i URL'); return; }
    setLoading('manual');
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: [{ name: manualName, url: manualUrl }] }),
      });
      const data = await res.json();
      if (data.scanId) {
        setActiveScanId(data.scanId);
        setScanStatus(null);
        setTab('log');
        setManualName('');
        setManualUrl('');
      } else {
        setError(data.error || 'Unknown response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const resetStuckScan = async (scanId: string) => {
    setLoading('reset');
    try {
      await fetch('/api/scan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId }),
      });
      fetchStats();
      if (activeScanId === scanId) {
        pollScan();
      }
    } catch { /* ignore */ } finally {
      setLoading(null);
    }
  };

  // ── Computed ──
  const isRunning = scanStatus?.status === 'running';
  const isComplete = scanStatus?.status === 'completed';
  const isFailed = scanStatus?.status === 'failed';
  const progressPct = stats ? Math.round((stats.completeBrands / stats.totalBrands) * 100) : 0;

  return (
    <div className="min-h-screen p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-silver hover:text-cs-black">
            ← CATSCAN
          </Link>
          <h1 className="font-display text-cs-2xl font-bold mt-1">COMMAND_CENTER</h1>
        </div>
        <div className="flex gap-3">
          {['dashboard', 'manual', 'log'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t as typeof tab)}
              className={`font-mono text-cs-xs uppercase tracking-[0.12em] px-3 py-1.5 border transition-colors ${
                tab === t ? 'border-cs-black bg-cs-black text-white' : 'border-cs-border text-cs-gray hover:border-cs-black'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 font-mono text-cs-sm text-red-600 border border-red-300 bg-red-50 p-3 flex justify-between items-center">
          <span>ERROR: {error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* ─── DASHBOARD TAB ─── */}
      {tab === 'dashboard' && stats && (
        <div>
          {/* Progress overview */}
          <div className="border border-cs-border mb-6">
            <div className="bg-cs-canvas p-4 border-b border-cs-border">
              <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray">SCAN_PROGRESS</div>
            </div>
            <div className="p-4">
              {/* Progress bar */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 h-3 bg-cs-canvas border border-cs-border">
                  <div
                    className="h-full bg-cs-black transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="font-mono text-cs-md font-bold w-16 text-right">{progressPct}%</div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-5 gap-4">
                <Stat label="TOTAL" value={stats.totalBrands} />
                <Stat label="SCANNED" value={stats.scannedBrands} />
                <Stat label="COMPLETE" value={stats.completeBrands} color="green" />
                <Stat label="INCOMPLETE" value={stats.incompleteBrands} color={stats.incompleteBrands > 0 ? 'red' : undefined} />
                <Stat label="REMAINING" value={stats.totalBrands - stats.scannedBrands} />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-cs-border">
                <Stat label="FINANCIAL_YEARS" value={stats.financialYears} />
                <Stat label="SOCIAL_POSTS" value={stats.socialPosts} />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <button
              onClick={() => startBatch(20)}
              disabled={!!loading || isRunning}
              className="border-2 border-cs-black bg-cs-black text-white p-4 font-mono text-cs-sm uppercase tracking-[0.1em] hover:bg-cs-ink transition-colors disabled:opacity-40 text-left"
            >
              <div className="font-bold text-cs-md mb-1">BATCH_20</div>
              <div className="text-cs-xs text-gray-400">Skanuj kolejne 20 marek</div>
            </button>

            <button
              onClick={() => startBatch(5)}
              disabled={!!loading || isRunning}
              className="border-2 border-cs-black p-4 font-mono text-cs-sm uppercase tracking-[0.1em] hover:bg-cs-black hover:text-white transition-colors disabled:opacity-40 text-left"
            >
              <div className="font-bold text-cs-md mb-1">BATCH_5</div>
              <div className="text-cs-xs text-cs-silver">Mniejszy batch (test)</div>
            </button>

            <button
              onClick={startRescanIncomplete}
              disabled={!!loading || isRunning || stats.incompleteBrands === 0}
              className={`border-2 p-4 font-mono text-cs-sm uppercase tracking-[0.1em] transition-colors disabled:opacity-40 text-left ${
                stats.incompleteBrands > 0
                  ? 'border-red-500 text-red-600 hover:bg-red-500 hover:text-white'
                  : 'border-cs-border text-cs-silver'
              }`}
            >
              <div className="font-bold text-cs-md mb-1">RESCAN_INCOMPLETE</div>
              <div className="text-cs-xs">{stats.incompleteBrands} marek do naprawy</div>
            </button>
          </div>

          {/* Incomplete brands */}
          {stats.incompleteList.length > 0 && (
            <div className="border border-red-300 mb-6">
              <div className="bg-red-50 p-3 border-b border-red-300">
                <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-red-600">
                  INCOMPLETE_BRANDS ({stats.incompleteList.length})
                </div>
              </div>
              <div className="divide-y divide-red-100">
                {stats.incompleteList.map(b => (
                  <div key={b.slug} className="p-3 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-cs-sm font-semibold">{b.name}</span>
                      <span className="font-mono text-cs-xs text-cs-silver ml-2">{b.slug}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-cs-xs text-red-500">{b.dims}/19</span>
                      <div className="font-mono text-[0.5rem] text-red-400">{b.missing.join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent scans */}
          {stats.recentScans.length > 0 && (
            <div className="border border-cs-border">
              <div className="bg-cs-canvas p-3 border-b border-cs-border">
                <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray">
                  RECENTLY_SCANNED ({stats.recentScans.length})
                </div>
              </div>
              <div className="divide-y divide-cs-border max-h-[300px] overflow-y-auto">
                {stats.recentScans.map(b => (
                  <div key={b.slug} className="p-2.5 flex items-center justify-between font-mono text-cs-sm">
                    <span>{b.slug}</span>
                    <div className="flex items-center gap-3">
                      <span className={b.phase_count >= 19 ? 'text-green-600' : 'text-red-500'}>
                        {b.phase_count}/19
                      </span>
                      <span className="text-cs-xs text-cs-silver">{b.updated_at?.slice(0, 16)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MANUAL TAB ─── */}
      {tab === 'manual' && (
        <div>
          <div className="border border-cs-border mb-6">
            <div className="bg-cs-canvas p-4 border-b border-cs-border">
              <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray">MANUAL_SCAN</div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-cs-gray block mb-1">NAZWA</label>
                  <input
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="np. Kuchnia Vikinga"
                    className="w-full font-mono text-cs-base p-3 border border-cs-border focus:outline-none focus:border-cs-black"
                  />
                </div>
                <div>
                  <label className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-cs-gray block mb-1">URL</label>
                  <input
                    value={manualUrl}
                    onChange={e => setManualUrl(e.target.value)}
                    placeholder="https://kuchniavikinga.pl"
                    className="w-full font-mono text-cs-base p-3 border border-cs-border focus:outline-none focus:border-cs-black"
                  />
                </div>
              </div>
              <button
                onClick={startManualScan}
                disabled={!!loading || isRunning}
                className="font-mono text-cs-sm uppercase tracking-[0.1em] bg-cs-black text-white px-6 py-2.5 hover:bg-cs-ink transition-colors disabled:opacity-40"
              >
                {loading === 'manual' ? 'STARTING...' : 'START_SCAN'}
              </button>
            </div>
          </div>

          {/* Active scan status if running */}
          {activeScanId && scanStatus && (
            <ActiveScanCard
              scanStatus={scanStatus}
              isRunning={isRunning}
              isComplete={!!isComplete}
              isFailed={!!isFailed}
              onReset={() => resetStuckScan(activeScanId)}
            />
          )}
        </div>
      )}

      {/* ─── LOG TAB ─── */}
      {tab === 'log' && (
        <div>
          {!activeScanId && !scanStatus && (
            <div className="font-mono text-cs-sm text-cs-silver p-8 text-center border border-cs-border">
              Brak aktywnego skanu. Uruchom batch lub skan manualny.
            </div>
          )}

          {activeScanId && scanStatus && (
            <>
              <ActiveScanCard
                scanStatus={scanStatus}
                isRunning={isRunning}
                isComplete={!!isComplete}
                isFailed={!!isFailed}
                onReset={() => resetStuckScan(activeScanId)}
              />

              {/* Entity progress */}
              <div className="border border-cs-border mb-4">
                <div className="bg-cs-canvas p-3 border-b border-cs-border">
                  <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray">
                    ENTITIES ({scanStatus.entities.length})
                  </div>
                </div>
                <div className="divide-y divide-cs-border max-h-[200px] overflow-y-auto">
                  {scanStatus.entities.map(e => {
                    const dimCount = Object.keys(e.data || {}).filter(k => !k.startsWith('_')).length;
                    return (
                      <div key={e.id} className="p-2.5 flex items-center justify-between font-mono text-cs-sm">
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            e.status === 'enriched' || e.status === 'extracted' ? 'bg-green-500' :
                            e.status === 'failed' ? 'bg-red-500' :
                            e.status === 'pending' ? 'bg-gray-300' : 'bg-yellow-500 animate-pulse'
                          }`} />
                          <span>{e.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-cs-xs text-cs-silver">{dimCount}/19</span>
                          <span className={`text-[0.5rem] uppercase tracking-wider px-1.5 py-0.5 border ${
                            e.status === 'enriched' ? 'border-green-300 text-green-600' :
                            e.status === 'failed' ? 'border-red-300 text-red-500' :
                            'border-cs-border text-cs-silver'
                          }`}>{e.status}</span>
                          {e.errors.length > 0 && (
                            <span className="text-[0.5rem] text-red-400">{e.errors.length} err</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Full log */}
              <div className="border border-cs-border">
                <div className="bg-cs-canvas p-3 border-b border-cs-border flex items-center justify-between">
                  <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray">PIPELINE_LOG</div>
                  <div className="font-mono text-[0.5rem] text-cs-silver">{scanStatus.log.length} entries</div>
                </div>
                <div
                  ref={logRef}
                  className="bg-cs-black text-cs-white p-4 font-mono text-[0.6875rem] leading-[1.7] max-h-[500px] overflow-y-auto"
                >
                  {scanStatus.log.map((line, i) => (
                    <div key={i} className={
                      line.includes('ERROR') || line.includes('FAILED') ? 'text-red-400' :
                      line.includes('INCOMPLETE') ? 'text-yellow-400' :
                      line.includes('COMPLETE') || line.includes('VALIDATION') || line.includes('MERGED') ? 'text-green-400 font-semibold' :
                      line.includes('--- PHASE:') ? 'text-blue-400 font-semibold mt-1' :
                      line.includes('→ OK') ? 'text-gray-400' :
                      'text-gray-500'
                    }>
                      {line}
                    </div>
                  ))}
                  {isRunning && <div className="text-yellow-400 animate-pulse mt-1">▌</div>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── No stats yet ─── */}
      {tab === 'dashboard' && !stats && (
        <div className="font-mono text-cs-sm text-cs-silver p-8 text-center">
          Loading stats...
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver">{label}</div>
      <div className={`font-display text-cs-xl font-bold ${
        color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-500' : ''
      }`}>{value}</div>
    </div>
  );
}

function ActiveScanCard({ scanStatus, isRunning, isComplete, isFailed, onReset }: {
  scanStatus: ScanStatus;
  isRunning: boolean;
  isComplete: boolean;
  isFailed: boolean;
  onReset: () => void;
}) {
  return (
    <div className={`border-2 mb-4 p-4 ${
      isRunning ? 'border-yellow-400 bg-yellow-50' :
      isComplete ? 'border-green-500 bg-green-50' :
      isFailed ? 'border-red-400 bg-red-50' : 'border-cs-border'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${
            isRunning ? 'bg-yellow-500 animate-pulse' :
            isComplete ? 'bg-green-600' : 'bg-red-500'
          }`} />
          <span className="font-mono text-cs-sm uppercase tracking-[0.1em] font-bold">
            {scanStatus.status}
          </span>
          {scanStatus.currentPhase && (
            <span className="font-mono text-cs-xs text-cs-silver">// {scanStatus.currentPhase.toUpperCase()}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-cs-xs text-cs-gray">
            {scanStatus.phasesCompleted.length}/{ALL_PHASES.length} faz
          </span>
          <span className="font-mono text-cs-xs text-cs-gray">
            ${scanStatus.totalCostUsd.toFixed(4)}
          </span>
          {isRunning && (
            <button
              onClick={onReset}
              className="font-mono text-[0.5rem] uppercase px-2 py-1 border border-red-300 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
            >
              FORCE_STOP
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 font-mono text-cs-xs text-cs-silver">
        ID: {scanStatus.id} | Entities: {scanStatus.entities.length} | Started: {scanStatus.createdAt?.slice(0, 19)}
      </div>
    </div>
  );
}
