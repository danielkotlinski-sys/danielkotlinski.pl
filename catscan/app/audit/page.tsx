'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface EntityData {
  id: string;
  name: string;
  url: string;
  domain?: string;
  nip?: string;
  krs?: string;
  status: string;
  errors: string[];
  data: Record<string, unknown>;
  financials?: Record<string, unknown>;
}

interface ScanInfo {
  id: string;
  status: string;
  phasesCompleted: string[];
  createdAt: string;
  completedAt: string | null;
  totalCostUsd: number;
  entityCount: number;
}

// Define which data sections we expect per entity and how to evaluate them
const SECTIONS: Array<{
  key: string;
  label: string;
  phase: string;
  dataPath: string; // dot-separated path in entity.data
  fields: string[]; // expected sub-fields to check
}> = [
  {
    key: 'meta',
    label: 'CRAWL // Metadata',
    phase: 'crawl',
    dataPath: '_meta',
    fields: ['title', 'description', 'crawledUrl', 'contentLength', 'subpagesCrawled'],
  },
  {
    key: 'social_urls',
    label: 'CRAWL // Social URLs',
    phase: 'crawl',
    dataPath: '_social_urls',
    fields: ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'],
  },
  {
    key: 'contact_raw',
    label: 'CRAWL // Contact (raw)',
    phase: 'crawl',
    dataPath: '_contact_raw',
    fields: ['nip', 'email', 'phone'],
  },
  {
    key: 'brand_identity',
    label: 'EXTRACT // Brand Identity',
    phase: 'extract',
    dataPath: 'brand_identity',
    fields: ['brand_name', 'tagline', 'positioning', 'emotional_register'],
  },
  {
    key: 'pricing',
    label: 'EXTRACT // Pricing',
    phase: 'extract',
    dataPath: 'pricing',
    fields: ['price_range_pln', 'cheapest_daily', 'most_expensive_daily', 'trial_offer'],
  },
  {
    key: 'menu',
    label: 'EXTRACT // Menu & Diets',
    phase: 'extract',
    dataPath: 'menu',
    fields: ['diet_types', 'calorie_options', 'cuisine_style'],
  },
  {
    key: 'delivery',
    label: 'EXTRACT // Delivery',
    phase: 'extract',
    dataPath: 'delivery',
    fields: ['delivery_model', 'delivery_cities', 'delivery_time'],
  },
  {
    key: 'technology',
    label: 'EXTRACT // Technology',
    phase: 'extract',
    dataPath: 'technology',
    fields: ['has_online_ordering', 'has_mobile_app', 'has_meal_customization'],
  },
  {
    key: 'social_proof',
    label: 'EXTRACT // Social Proof',
    phase: 'extract',
    dataPath: 'social_proof',
    fields: ['testimonials_visible', 'media_mentions', 'certifications', 'dietitian_team'],
  },
  {
    key: 'contact',
    label: 'EXTRACT // Contact',
    phase: 'extract',
    dataPath: 'contact',
    fields: ['city', 'phone', 'email', 'nip'],
  },
  {
    key: 'discovery',
    label: 'DISCOVERY // NIP/KRS',
    phase: 'discovery',
    dataPath: '_discovery',
    fields: ['nip', 'nipValid', 'krs', 'source'],
  },
  {
    key: 'social',
    label: 'SOCIAL // Apify',
    phase: 'social',
    dataPath: 'social',
    fields: ['platformCount', 'totalFollowers', 'method'],
  },
  {
    key: 'social_ig',
    label: 'SOCIAL // Instagram',
    phase: 'social',
    dataPath: 'social.instagram',
    fields: ['handle', 'followers', 'bio', 'engagementRate'],
  },
  {
    key: 'social_fb',
    label: 'SOCIAL // Facebook',
    phase: 'social',
    dataPath: 'social.facebook',
    fields: ['handle', 'followers', 'likes', 'rating'],
  },
  {
    key: 'social_tt',
    label: 'SOCIAL // TikTok',
    phase: 'social',
    dataPath: 'social.tiktok',
    fields: ['handle', 'followers', 'totalLikes'],
  },
  {
    key: 'ads',
    label: 'ADS // Meta Ad Library',
    phase: 'ads',
    dataPath: 'ads',
    fields: ['activeAdsCount', 'estimatedIntensity', 'adCopySnippets', 'longestRunningAdDays'],
  },
  {
    key: 'reviews',
    label: 'REVIEWS // Google',
    phase: 'reviews',
    dataPath: 'reviews',
    fields: ['googleRating', 'googleReviewCount', 'reviewSnippets', 'sentimentEstimate'],
  },
  {
    key: 'finance',
    label: 'FINANCE // rejestr.io',
    phase: 'finance',
    dataPath: 'finance',
    fields: ['revenue', 'netIncome', 'totalAssets', 'equity', 'org_name', 'krs_number', 'years_fetched'],
  },
  {
    key: 'youtube_reviews',
    label: 'YOUTUBE // Recenzje',
    phase: 'youtube_reviews',
    dataPath: 'youtube_reviews',
    fields: ['reviews_found', 'reviews_analyzed', 'avg_sentiment', 'total_views', 'sponsored_count'],
  },
  {
    key: 'google_ads',
    label: 'GOOGLE ADS // Transparency',
    phase: 'google_ads',
    dataPath: 'google_ads',
    fields: ['totalAdsFound', 'estimatedIntensity', 'longestRunningAdDays', 'advertiserVerified', 'formats'],
  },
  {
    key: 'influencer_ig',
    label: 'INFLUENCER // Instagram',
    phase: 'influencer_ig',
    dataPath: 'influencer_ig',
    fields: ['unique_influencers', 'tagged_posts_found', 'sponsored_posts', 'total_reach_followers'],
  },
  {
    key: 'influencer_press',
    label: 'INFLUENCER // Prasa',
    phase: 'influencer_press',
    dataPath: 'influencer_press',
    fields: ['partnerships', 'partnership_count'],
  },
  {
    key: 'scorecard',
    label: 'SCORECARD // Analiza',
    phase: 'scorecard',
    dataPath: 'scorecard',
    fields: ['description', 'scores', 'tags', 'signals', 'segment', 'positioning', 'strengths', 'weaknesses'],
  },
];

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

type SectionStatus = 'full' | 'partial' | 'empty' | 'error' | 'skipped';

function evaluateSection(
  entity: EntityData,
  section: typeof SECTIONS[0]
): { status: SectionStatus; filled: number; total: number; data: unknown; message?: string } {
  const raw = getNestedValue(entity.data, section.dataPath);

  if (raw === undefined || raw === null) {
    return { status: 'empty', filled: 0, total: section.fields.length, data: null };
  }

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;

    // Check for skip/error markers
    if (obj.skipped) {
      return { status: 'skipped', filled: 0, total: section.fields.length, data: raw, message: String(obj.reason || 'skipped') };
    }
    if (obj.error) {
      return { status: 'error', filled: 0, total: section.fields.length, data: raw, message: String(obj.error) };
    }

    let filled = 0;
    for (const field of section.fields) {
      const val = obj[field];
      if (val !== undefined && val !== null && val !== '' && val !== 0) {
        if (Array.isArray(val) && val.length === 0) continue;
        filled++;
      }
    }

    const status: SectionStatus = filled === 0 ? 'empty' : filled >= section.fields.length * 0.6 ? 'full' : 'partial';
    return { status, filled, total: section.fields.length, data: raw };
  }

  return { status: 'partial', filled: 1, total: section.fields.length, data: raw };
}

const STATUS_COLORS: Record<SectionStatus, { bg: string; border: string; text: string; dot: string }> = {
  full:    { bg: 'bg-green-50',  border: 'border-green-300', text: 'text-green-700', dot: 'bg-green-500' },
  partial: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  empty:   { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-600',    dot: 'bg-red-500' },
  error:   { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-700',    dot: 'bg-red-600' },
  skipped: { bg: 'bg-gray-50',   border: 'border-gray-300',   text: 'text-gray-500',   dot: 'bg-gray-400' },
};

function StatusBadge({ status, filled, total }: { status: SectionStatus; filled: number; total: number }) {
  const c = STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${c.bg} ${c.border} ${c.text} border rounded`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status === 'skipped' ? 'SKIP' : status === 'error' ? 'ERR' : `${filled}/${total}`}
    </span>
  );
}

function DataViewer({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-cs-silver italic">null</span>;

  const json = JSON.stringify(data, null, 2);
  return (
    <pre className="font-mono text-[11px] leading-relaxed text-cs-ink bg-cs-canvas border border-cs-border p-3 rounded overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words">
      {json}
    </pre>
  );
}

function EntityAudit({ entity }: { entity: EntityData }) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(SECTIONS.map(s => s.key)));
  const collapseAll = () => setOpenSections(new Set());

  // Compute stats
  const results = SECTIONS.map(s => ({ section: s, ...evaluateSection(entity, s) }));
  const fullCount = results.filter(r => r.status === 'full').length;
  const partialCount = results.filter(r => r.status === 'partial').length;
  const emptyCount = results.filter(r => r.status === 'empty').length;
  const errorCount = results.filter(r => r.status === 'error' || r.status === 'skipped').length;

  return (
    <div>
      {/* Entity header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-cs-silver">{entity.domain}</span>
          {entity.nip && <span className="font-mono text-[10px] text-cs-gray">NIP: {entity.nip}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="font-mono text-[10px] text-cs-silver hover:text-cs-black underline">rozwiń</button>
          <button onClick={collapseAll} className="font-mono text-[10px] text-cs-silver hover:text-cs-black underline">zwiń</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 font-mono text-[10px]">
        <span className="text-green-600">{fullCount} OK</span>
        <span className="text-yellow-600">{partialCount} PARTIAL</span>
        <span className="text-red-500">{emptyCount} EMPTY</span>
        {errorCount > 0 && <span className="text-red-700">{errorCount} ERR/SKIP</span>}
        <span className="text-cs-silver ml-auto">status: {entity.status}</span>
      </div>

      {/* Errors */}
      {entity.errors.length > 0 && (
        <div className="mb-4 border border-red-300 bg-red-50 p-3 rounded">
          <div className="font-mono text-[10px] uppercase tracking-wider text-red-700 mb-1">ENTITY ERRORS</div>
          {entity.errors.map((e, i) => (
            <div key={i} className="font-mono text-[11px] text-red-600">{e}</div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-1">
        {results.map(({ section, status, filled, total, data, message }) => {
          const isOpen = openSections.has(section.key);
          const c = STATUS_COLORS[status];

          return (
            <div key={section.key} className={`border ${c.border} rounded overflow-hidden`}>
              <button
                onClick={() => toggle(section.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 ${c.bg} hover:brightness-95 transition-all text-left`}
              >
                <span className={`text-[10px] ${isOpen ? 'rotate-90' : ''} transition-transform inline-block`}>&#9654;</span>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider flex-1">
                  {section.label}
                </span>
                {message && <span className="font-mono text-[10px] italic opacity-70">{message}</span>}
                <StatusBadge status={status} filled={filled} total={total} />
              </button>
              {isOpen && (
                <div className="p-3 bg-white border-t border-cs-border">
                  {/* Field checklist */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                    {section.fields.map((field) => {
                      const obj = (typeof data === 'object' && data !== null) ? data as Record<string, unknown> : {};
                      const val = obj[field];
                      const hasValue = val !== undefined && val !== null && val !== '' &&
                        !(Array.isArray(val) && val.length === 0) && val !== 0;
                      return (
                        <span key={field} className={`font-mono text-[10px] ${hasValue ? 'text-green-700' : 'text-red-400'}`}>
                          {hasValue ? '✓' : '✗'} {field}
                        </span>
                      );
                    })}
                  </div>
                  {/* Raw JSON */}
                  <DataViewer data={data} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [scanInfo, setScanInfo] = useState<ScanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Load latest scan info
        const scanRes = await fetch('/api/scan?full=1');
        if (scanRes.ok) {
          const scans = await scanRes.json();
          const latest = scans[scans.length - 1];
          if (latest) {
            setScanInfo({
              id: latest.id,
              status: latest.status,
              phasesCompleted: latest.phasesCompleted || [],
              createdAt: latest.createdAt,
              completedAt: latest.completedAt,
              totalCostUsd: latest.totalCostUsd || 0,
              entityCount: latest.entities?.length || 0,
            });

            // Use entities directly from the scan (with full data)
            const ents: EntityData[] = (latest.entities || []).map((e: EntityData) => ({
              id: e.id,
              name: e.name,
              url: e.url,
              domain: e.domain,
              nip: e.nip,
              krs: e.krs,
              status: e.status,
              errors: e.errors || [],
              data: e.data || {},
              financials: e.financials,
            }));
            setEntities(ents);
            if (ents.length > 0) setSelectedEntity(ents[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load audit data', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeEntity = entities.find(e => e.id === selectedEntity);

  // Overall stats
  const allResults = entities.flatMap(entity =>
    SECTIONS.map(section => evaluateSection(entity, section).status)
  );
  const totalSections = allResults.length;
  const totalFull = allResults.filter(s => s === 'full').length;
  const totalPartial = allResults.filter(s => s === 'partial').length;
  const totalEmpty = allResults.filter(s => s === 'empty').length;

  return (
    <div className="min-h-screen p-8 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.14em] text-cs-silver hover:text-cs-black">
            ← CATSCAN
          </Link>
          <h1 className="font-display text-2xl font-bold mt-1">DATA_AUDIT</h1>
          <p className="font-mono text-[11px] text-cs-gray mt-1">
            Weryfikacja danych ze skanu — co jest, co brakuje, co się wysypało
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/scan" className="font-mono text-[11px] uppercase tracking-wider border border-cs-border px-3 py-1.5 hover:border-cs-black">
            SCAN
          </Link>
          <Link href="/chat" className="font-mono text-[11px] uppercase tracking-wider border border-cs-border px-3 py-1.5 hover:border-cs-black">
            CHAT
          </Link>
        </div>
      </div>

      {loading && (
        <div className="font-mono text-cs-sm text-cs-gray animate-pulse">Loading scan data...</div>
      )}

      {!loading && entities.length === 0 && (
        <div className="border border-cs-border p-8 text-center">
          <div className="font-mono text-cs-gray">Brak danych. Najpierw uruchom skan.</div>
          <Link href="/scan" className="font-mono text-[11px] text-cs-black underline mt-2 inline-block">
            Przejdź do SCAN →
          </Link>
        </div>
      )}

      {!loading && entities.length > 0 && (
        <>
          {/* Scan info bar */}
          {scanInfo && (
            <div className="flex items-center gap-6 mb-6 border border-cs-border bg-white px-4 py-3 rounded font-mono text-[11px]">
              <span className="text-cs-gray">SCAN: <span className="text-cs-black">{scanInfo.id.slice(0, 8)}</span></span>
              <span className="text-cs-gray">STATUS: <span className={scanInfo.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}>{scanInfo.status}</span></span>
              <span className="text-cs-gray">FAZY: <span className="text-cs-black">{scanInfo.phasesCompleted.join(', ') || '—'}</span></span>
              <span className="text-cs-gray">KOSZT: <span className="text-cs-black">${scanInfo.totalCostUsd.toFixed(4)}</span></span>
              <span className="ml-auto text-cs-gray">
                COVERAGE: <span className="text-green-600">{totalFull}</span> / <span className="text-yellow-600">{totalPartial}</span> / <span className="text-red-500">{totalEmpty}</span>
                <span className="text-cs-silver ml-1">z {totalSections}</span>
              </span>
            </div>
          )}

          {/* Entity tabs + content */}
          <div className="flex gap-0 border border-cs-border rounded overflow-hidden">
            {/* Entity list sidebar */}
            <div className="w-[220px] border-r border-cs-border bg-white shrink-0">
              <div className="font-mono text-[10px] uppercase tracking-wider text-cs-gray px-3 py-2 border-b border-cs-border bg-cs-canvas">
                ENTITIES ({entities.length})
              </div>
              {entities.map((entity) => {
                const results = SECTIONS.map(s => evaluateSection(entity, s).status);
                const full = results.filter(s => s === 'full').length;
                const empty = results.filter(s => s === 'empty' || s === 'error' || s === 'skipped').length;
                const isActive = selectedEntity === entity.id;

                return (
                  <button
                    key={entity.id}
                    onClick={() => setSelectedEntity(entity.id)}
                    className={`w-full text-left px-3 py-3 border-b border-cs-border transition-colors ${
                      isActive ? 'bg-cs-canvas' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-display text-[13px] font-bold">{entity.name}</div>
                    <div className="font-mono text-[10px] text-cs-silver mt-0.5">{entity.domain}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {/* Mini progress bar */}
                      <div className="flex h-1.5 flex-1 rounded overflow-hidden bg-gray-200">
                        <div className="bg-green-500" style={{ width: `${(full / SECTIONS.length) * 100}%` }} />
                        <div className="bg-yellow-400" style={{ width: `${((SECTIONS.length - full - empty) / SECTIONS.length) * 100}%` }} />
                        <div className="bg-red-400" style={{ width: `${(empty / SECTIONS.length) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[9px] text-cs-silver">{full}/{SECTIONS.length}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Main content */}
            <div className="flex-1 bg-white p-5 min-h-[600px] overflow-y-auto">
              {activeEntity ? (
                <>
                  <h2 className="font-display text-xl font-bold mb-1">{activeEntity.name}</h2>
                  <EntityAudit entity={activeEntity} />
                </>
              ) : (
                <div className="font-mono text-cs-gray text-center mt-20">Wybierz firmę z listy</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
