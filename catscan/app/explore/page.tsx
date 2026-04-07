'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dimension definitions — each tab maps to a data path + fields
// ---------------------------------------------------------------------------

interface DimensionField {
  key: string;
  label: string;
  format?: 'currency' | 'number' | 'list' | 'boolean' | 'rating' | 'url';
}

interface Dimension {
  id: string;
  label: string;
  dataPath: string; // dot path into entity.data
  fields: DimensionField[];
}

const DIMENSIONS: Dimension[] = [
  {
    id: 'brand',
    label: 'Brand',
    dataPath: 'brand_identity',
    fields: [
      { key: 'brand_name', label: 'Nazwa' },
      { key: 'tagline', label: 'Tagline' },
      { key: 'positioning', label: 'Pozycjonowanie' },
      { key: 'emotional_register', label: 'Ton' },
      { key: 'language', label: 'Jezyk' },
    ],
  },
  {
    id: 'pricing',
    label: 'Cennik',
    dataPath: 'pricing',
    fields: [
      { key: 'price_range_pln', label: 'Zakres cen' },
      { key: 'cheapest_daily', label: 'Min PLN/dzien', format: 'currency' },
      { key: 'most_expensive_daily', label: 'Max PLN/dzien', format: 'currency' },
      { key: 'price_1500kcal', label: '1500 kcal/dzien', format: 'currency' },
      { key: 'price_2000kcal', label: '2000 kcal/dzien', format: 'currency' },
      { key: 'trial_offer', label: 'Oferta proba' },
      { key: 'subscription_discount', label: 'Rabat subskrypcja', format: 'boolean' },
      { key: 'diet_prices', label: 'Cennik diet', format: 'list' },
    ],
  },
  {
    id: 'menu',
    label: 'Menu',
    dataPath: 'menu',
    fields: [
      { key: 'diet_types', label: 'Typy diet', format: 'list' },
      { key: 'calorie_options', label: 'Opcje kcal', format: 'list' },
      { key: 'cuisine_style', label: 'Styl kuchni' },
      { key: 'dietary_restrictions', label: 'Restrykcje', format: 'list' },
    ],
  },
  {
    id: 'delivery',
    label: 'Dostawa',
    dataPath: 'delivery',
    fields: [
      { key: 'delivery_model', label: 'Model' },
      { key: 'delivery_cities', label: 'Miasta', format: 'list' },
      { key: 'delivery_time', label: 'Czas dostawy' },
      { key: 'weekend_delivery', label: 'Weekendy', format: 'boolean' },
    ],
  },
  {
    id: 'technology',
    label: 'Tech',
    dataPath: 'technology',
    fields: [
      { key: 'has_online_ordering', label: 'Zamowienia online', format: 'boolean' },
      { key: 'has_mobile_app', label: 'Aplikacja', format: 'boolean' },
      { key: 'has_meal_customization', label: 'Personalizacja', format: 'boolean' },
      { key: 'payment_methods', label: 'Platnosci', format: 'list' },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    dataPath: 'social',
    fields: [
      { key: 'totalFollowers', label: 'Followers total', format: 'number' },
      { key: 'platformCount', label: 'Platformy', format: 'number' },
    ],
  },
  {
    id: 'social_ig',
    label: 'Instagram',
    dataPath: 'social.instagram',
    fields: [
      { key: 'handle', label: 'Handle' },
      { key: 'followers', label: 'Followers', format: 'number' },
      { key: 'posts', label: 'Posty', format: 'number' },
      { key: 'bio', label: 'Bio' },
      { key: 'engagementRate', label: 'Engagement %', format: 'number' },
      { key: 'content.sampleSize', label: 'Probka postow', format: 'number' },
      { key: 'content.postingFrequency', label: 'Czestotliwosc' },
      { key: 'content.avgLikesRecent', label: 'Avg likes (recent)', format: 'number' },
      { key: 'content.avgLikesHistorical', label: 'Avg likes (hist.)', format: 'number' },
      { key: 'content.engagementTrend', label: 'Trend' },
      { key: 'content.topHashtags', label: 'Top hashtagi', format: 'list' },
    ],
  },
  {
    id: 'social_fb',
    label: 'Facebook',
    dataPath: 'social.facebook',
    fields: [
      { key: 'handle', label: 'Handle' },
      { key: 'followers', label: 'Followers', format: 'number' },
      { key: 'likes', label: 'Likes', format: 'number' },
      { key: 'rating', label: 'Ocena', format: 'rating' },
    ],
  },
  {
    id: 'ads',
    label: 'Reklamy',
    dataPath: 'ads',
    fields: [
      { key: 'activeAdsCount', label: 'Aktywne reklamy', format: 'number' },
      { key: 'estimatedIntensity', label: 'Intensywnosc' },
      { key: 'longestRunningAdDays', label: 'Najdluzsza (dni)', format: 'number' },
      { key: 'adCopySnippets', label: 'Copy', format: 'list' },
    ],
  },
  {
    id: 'reviews',
    label: 'Opinie',
    dataPath: 'reviews',
    fields: [
      { key: 'google.rating', label: 'Google ocena', format: 'rating' },
      { key: 'google.reviewCount', label: 'Google ilosc', format: 'number' },
      { key: 'dietly.rating', label: 'Dietly ocena', format: 'rating' },
      { key: 'dietly.reviewCount', label: 'Dietly ilosc', format: 'number' },
      { key: 'google.snippets', label: 'Snippets', format: 'list' },
    ],
  },
  {
    id: 'finance',
    label: 'Finanse',
    dataPath: 'finance',
    fields: [
      { key: 'org_name', label: 'Nazwa prawna' },
      { key: 'krs_number', label: 'KRS' },
      { key: 'revenue', label: 'Przychod', format: 'currency' },
      { key: 'netIncome', label: 'Zysk netto', format: 'currency' },
      { key: 'totalAssets', label: 'Aktywa', format: 'currency' },
      { key: 'equity', label: 'Kapital', format: 'currency' },
      { key: 'operatingProfit', label: 'Zysk operacyjny', format: 'currency' },
      { key: 'years_fetched', label: 'Lata', format: 'number' },
    ],
  },
  {
    id: 'context',
    label: 'Kontekst',
    dataPath: 'context',
    fields: [
      { key: 'legalName', label: 'Nazwa prawna' },
      { key: 'founder', label: 'Zalozyciel' },
      { key: 'foundedYear', label: 'Rok zal.' },
      { key: 'employeeRange', label: 'Pracownicy' },
      { key: 'trajectory', label: 'Trajektoria' },
      { key: 'nip', label: 'NIP' },
      { key: 'uniqueInsight', label: 'Insight' },
    ],
  },
  {
    id: 'discovery',
    label: 'NIP/KRS',
    dataPath: '_discovery',
    fields: [
      { key: 'nip', label: 'NIP' },
      { key: 'nipValid', label: 'NIP valid', format: 'boolean' },
      { key: 'nipSource', label: 'Zrodlo NIP' },
      { key: 'krs', label: 'KRS' },
      { key: 'legalForm', label: 'Forma prawna' },
      { key: 'orgName', label: 'Nazwa org.' },
    ],
  },
  {
    id: 'differentiator',
    label: 'Wyroznik',
    dataPath: '',
    fields: [
      { key: 'unique_differentiator', label: 'Wyroznik' },
    ],
  },
  {
    id: 'scorecard',
    label: 'Scorecard',
    dataPath: 'scorecard',
    fields: [
      { key: 'scores.overall', label: 'Overall', format: 'number' },
      { key: 'scores.price_competitiveness', label: 'Cena', format: 'number' },
      { key: 'scores.social_presence', label: 'Social', format: 'number' },
      { key: 'scores.ad_intensity', label: 'Reklamy', format: 'number' },
      { key: 'scores.review_reputation', label: 'Opinie', format: 'number' },
      { key: 'scores.brand_awareness', label: 'Swiadomosc', format: 'number' },
      { key: 'scores.financial_health', label: 'Finanse', format: 'number' },
      { key: 'scores.content_quality', label: 'Content', format: 'number' },
      { key: 'scores.influencer_reach', label: 'Influencerzy', format: 'number' },
      { key: 'segment', label: 'Segment' },
      { key: 'positioning', label: 'Pozycjonowanie' },
      { key: 'tags', label: 'Tagi', format: 'list' },
    ],
  },
  {
    id: 'youtube_reviews',
    label: 'YouTube',
    dataPath: 'youtube_reviews',
    fields: [
      { key: 'reviews_found', label: 'Znalezione', format: 'number' },
      { key: 'reviews_analyzed', label: 'Przeanalizowane', format: 'number' },
      { key: 'avg_sentiment', label: 'Sentyment', format: 'number' },
      { key: 'total_views', label: 'Wyswietlenia', format: 'number' },
      { key: 'sponsored_count', label: 'Sponsorowane', format: 'number' },
      { key: 'top_pros', label: 'Zalety', format: 'list' },
      { key: 'top_cons', label: 'Wady', format: 'list' },
    ],
  },
  {
    id: 'google_ads',
    label: 'Google Ads',
    dataPath: 'google_ads',
    fields: [
      { key: 'totalAdsFound', label: 'Reklamy', format: 'number' },
      { key: 'estimatedIntensity', label: 'Intensywnosc' },
      { key: 'longestRunningAdDays', label: 'Najdluzsza (dni)', format: 'number' },
      { key: 'avgAdDurationDays', label: 'Srednia (dni)', format: 'number' },
      { key: 'formats', label: 'Formaty', format: 'list' },
      { key: 'advertiserVerified', label: 'Zweryfikowany', format: 'boolean' },
    ],
  },
  {
    id: 'influencer_ig',
    label: 'Influencerzy IG',
    dataPath: 'influencer_ig',
    fields: [
      { key: 'unique_influencers', label: 'Influencerzy', format: 'number' },
      { key: 'tagged_posts_found', label: 'Tagged posts', format: 'number' },
      { key: 'sponsored_posts', label: 'Sponsorowane', format: 'number' },
      { key: 'total_reach_followers', label: 'Zasieg (followers)', format: 'number' },
      { key: 'top_influencers', label: 'Top influencerzy', format: 'list' },
    ],
  },
  {
    id: 'influencer_press',
    label: 'Prasa',
    dataPath: 'influencer_press',
    fields: [
      { key: 'partnerships', label: 'Wspolprace', format: 'list' },
      { key: 'partnership_count', label: 'Liczba', format: 'number' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportCSV(entities: EntityData[], dimensions: Dimension[]) {
  // Build flat headers: Name, URL, NIP, then all dimension fields
  const headers = ['Nazwa', 'URL', 'NIP', 'KRS'];
  const paths: Array<{ dataPath: string; key: string; format?: string }> = [];

  for (const dim of dimensions) {
    for (const field of dim.fields) {
      headers.push(`${dim.label}: ${field.label}`);
      paths.push({ dataPath: dim.dataPath, key: field.key, format: field.format });
    }
  }

  const csvEscape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  };

  const rows = [headers.map(csvEscape).join(',')];

  for (const e of entities) {
    const row = [e.name, e.url || '', e.nip || '', e.krs || ''];
    for (const p of paths) {
      const dimData = getNestedValue(e.data, p.dataPath) as Record<string, unknown> | undefined;
      const val = dimData ? dimData[p.key] : undefined;
      row.push(formatValuePlain(val, p.format));
    }
    rows.push(row.map(csvEscape).join(','));
  }

  const csv = '\uFEFF' + rows.join('\n'); // BOM for Excel UTF-8
  downloadFile(csv, 'catscan_export.csv', 'text/csv;charset=utf-8');
}

function exportJSON(entities: EntityData[]) {
  const data = entities.map(e => ({
    name: e.name,
    url: e.url,
    domain: e.domain,
    nip: e.nip,
    krs: e.krs,
    ...e.data,
    financials: e.financials,
  }));
  downloadFile(JSON.stringify(data, null, 2), 'catscan_export.json', 'application/json');
}

function formatValuePlain(val: unknown, format?: string): string {
  if (val === null || val === undefined) return '';
  if (format === 'currency' && typeof val === 'number') return String(val);
  if (format === 'number' && typeof val === 'number') return String(val);
  if (format === 'boolean') return val === true ? 'TAK' : val === false ? 'NIE' : String(val);
  if (format === 'rating' && typeof val === 'number') return val.toFixed(1);
  if (format === 'list' && Array.isArray(val)) return val.join('; ');
  if (format === 'list' && val && typeof val === 'object' && !Array.isArray(val)) {
    return Object.entries(val as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join('; ');
  }
  return String(val);
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function formatValue(val: unknown, format?: string): string {
  if (val === null || val === undefined) return '\u2014';
  if (format === 'currency' && typeof val === 'number') {
    return val.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' PLN';
  }
  if (format === 'number' && typeof val === 'number') {
    return val.toLocaleString('pl-PL');
  }
  if (format === 'boolean') {
    if (val === true) return 'TAK';
    if (val === false) return 'NIE';
    return String(val);
  }
  if (format === 'rating' && typeof val === 'number') {
    return val.toFixed(1) + '\u2605';
  }
  if (format === 'list' && Array.isArray(val)) {
    if (val.length === 0) return '\u2014';
    // Handle array of objects (e.g. topHashtags: [{tag, count}])
    if (typeof val[0] === 'object' && val[0] !== null) {
      return val.map(v => {
        const obj = v as Record<string, unknown>;
        return obj.tag ? `${obj.tag}(${obj.count})` : obj.diet_name ? `${obj.diet_name}: ${obj.price_per_day_pln} PLN` : JSON.stringify(v);
      }).join(', ');
    }
    return val.join(', ');
  }
  // Handle Record<string, number> displayed as list (e.g. ad formats: {text: 5, image: 3})
  if (format === 'list' && val && typeof val === 'object' && !Array.isArray(val)) {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return '\u2014';
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
  }
  if (format === 'url' && typeof val === 'string') {
    return val;
  }
  return String(val);
}

function getFieldValue(entityData: Record<string, unknown>, dimPath: string, fieldKey: string): unknown {
  const section = dimPath ? getNestedValue(entityData, dimPath) : entityData;
  if (!section || typeof section !== 'object') return undefined;
  // Support nested field keys like "google.rating"
  return getNestedValue(section as Record<string, unknown>, fieldKey);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ComparisonTable({
  entities,
  dimension,
  sortField,
  sortDir,
  onSort,
  onEntityClick,
}: {
  entities: EntityData[];
  dimension: Dimension;
  sortField: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  onEntityClick: (entity: EntityData) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-cs-canvas">
            <th className="text-left font-mono text-[10px] uppercase tracking-wider text-cs-gray p-3 border border-cs-border sticky left-0 bg-cs-canvas z-10 min-w-[140px]">
              Firma
            </th>
            {dimension.fields.map((f) => (
              <th
                key={f.key}
                onClick={() => onSort(f.key)}
                className="text-left font-mono text-[10px] uppercase tracking-wider text-cs-gray p-3 border border-cs-border cursor-pointer hover:bg-cs-mist select-none min-w-[120px]"
              >
                {f.label}
                {sortField === f.key && (
                  <span className="ml-1">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.id} className="hover:bg-cs-canvas/50 transition-colors">
              <td
                onClick={() => onEntityClick(entity)}
                className="font-display text-[13px] font-bold p-3 border border-cs-border sticky left-0 bg-white z-10 cursor-pointer hover:bg-cs-canvas"
              >
                <div>{entity.name}</div>
                <div className="font-mono text-[9px] text-cs-silver font-normal">{entity.domain}</div>
              </td>
              {dimension.fields.map((f) => {
                const val = getFieldValue(entity.data, dimension.dataPath, f.key);
                const formatted = formatValue(val, f.format);
                const isEmpty = val === null || val === undefined;
                return (
                  <td
                    key={f.key}
                    className={`font-mono text-[12px] p-3 border border-cs-border ${isEmpty ? 'text-cs-silver italic' : 'text-cs-ink'}`}
                  >
                    {f.format === 'list' && Array.isArray(val) && val.length > 3 ? (
                      <details className="cursor-pointer">
                        <summary className="text-[11px]">{val.length} pozycji</summary>
                        <div className="mt-1 text-[10px] leading-relaxed">{val.join(', ')}</div>
                      </details>
                    ) : formatted.length > 80 ? (
                      <details className="cursor-pointer">
                        <summary className="text-[11px]">{formatted.slice(0, 60)}...</summary>
                        <div className="mt-1 text-[10px] leading-relaxed">{formatted}</div>
                      </details>
                    ) : (
                      formatted
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntityDetailPanel({ entity, onClose }: { entity: EntityData; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[700px] max-w-full bg-white h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-cs-black text-white p-5 z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-xl font-bold">{entity.name}</div>
              <div className="font-mono text-[11px] text-cs-silver mt-1">
                {entity.domain} | NIP: {entity.nip || '\u2014'} | KRS: {entity.krs || '\u2014'}
              </div>
            </div>
            <button onClick={onClose} className="text-cs-silver hover:text-white text-2xl px-2">&times;</button>
          </div>
          {/* Mini tabs */}
          <div className="flex gap-1 mt-4 flex-wrap">
            <button
              onClick={() => setActiveTab('all')}
              className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border ${
                activeTab === 'all' ? 'bg-white text-cs-black border-white' : 'border-cs-silver/30 text-cs-silver hover:text-white'
              }`}
            >
              Wszystko
            </button>
            {DIMENSIONS.map((dim) => {
              const section = dim.dataPath ? getNestedValue(entity.data, dim.dataPath) : entity.data;
              const hasData = section !== undefined && section !== null;
              return (
                <button
                  key={dim.id}
                  onClick={() => setActiveTab(dim.id)}
                  className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border ${
                    activeTab === dim.id
                      ? 'bg-white text-cs-black border-white'
                      : hasData
                        ? 'border-cs-silver/30 text-cs-silver hover:text-white'
                        : 'border-cs-silver/10 text-cs-silver/30'
                  }`}
                >
                  {dim.label}
                </button>
              );
            })}
            <button
              onClick={() => setActiveTab('raw')}
              className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border ${
                activeTab === 'raw' ? 'bg-white text-cs-black border-white' : 'border-cs-silver/30 text-cs-silver hover:text-white'
              }`}
            >
              RAW JSON
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {activeTab === 'raw' ? (
            <pre className="font-mono text-[11px] leading-relaxed bg-cs-canvas p-4 border border-cs-border overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(entity.data, null, 2)}
            </pre>
          ) : (
            DIMENSIONS.filter((dim) => activeTab === 'all' || activeTab === dim.id).map((dim) => {
              const section = dim.dataPath ? getNestedValue(entity.data, dim.dataPath) : entity.data;
              if (!section && activeTab === 'all') return null;

              return (
                <div key={dim.id} className="mb-6">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-cs-gray border-b border-cs-border pb-1 mb-3">
                    {dim.label}
                  </div>
                  {section && typeof section === 'object' ? (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                      {dim.fields.map((f) => {
                        const val = getFieldValue(entity.data, dim.dataPath, f.key);
                        return (
                          <div key={f.key} className="flex flex-col">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-cs-silver">
                              {f.label}
                            </span>
                            <span className="font-mono text-[12px] text-cs-ink mt-0.5">
                              {formatValue(val, f.format)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="font-mono text-[11px] text-cs-silver italic">Brak danych</div>
                  )}
                </div>
              );
            })
          )}

          {/* Financials special section */}
          {(activeTab === 'all' || activeTab === 'finance') && entity.financials && (
            <div className="mb-6">
              <div className="font-mono text-[10px] uppercase tracking-wider text-cs-gray border-b border-cs-border pb-1 mb-3">
                Sprawozdania finansowe (szczegoly)
              </div>
              <pre className="font-mono text-[10px] leading-relaxed bg-cs-canvas p-3 border border-cs-border overflow-x-auto whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
                {JSON.stringify(entity.financials, null, 2)}
              </pre>
            </div>
          )}

          {/* Errors */}
          {entity.errors.length > 0 && (
            <div className="mt-4 border border-red-300 bg-red-50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-red-700 mb-1">Bledy</div>
              {entity.errors.map((e, i) => (
                <div key={i} className="font-mono text-[11px] text-red-600">{e}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickStats({ entities }: { entities: EntityData[] }) {
  const stats = useMemo(() => {
    let withPricing = 0, withSocial = 0, withFinance = 0, withReviews = 0;
    let withContext = 0, withNip = 0, withScorecard = 0, withYouTube = 0;
    let withGoogleAds = 0, withInfluencers = 0;

    entities.forEach((e) => {
      const d = e.data;
      if (d.pricing) withPricing++;
      if (d.social && !(d.social as Record<string, unknown>).skipped) withSocial++;
      if (d.finance && !(d.finance as Record<string, unknown>).skipped) withFinance++;
      if (d.reviews) withReviews++;
      if (d.context) withContext++;
      if (e.nip) withNip++;
      if (d.scorecard && !(d.scorecard as Record<string, unknown>).skipped) withScorecard++;
      if (d.youtube_reviews && !(d.youtube_reviews as Record<string, unknown>).skipped) withYouTube++;
      if (d.google_ads && !(d.google_ads as Record<string, unknown>).skipped) withGoogleAds++;
      if ((d.influencer_ig && !(d.influencer_ig as Record<string, unknown>).skipped) || d.influencer_press) withInfluencers++;
    });

    return { withPricing, withSocial, withFinance, withReviews, withContext, withNip, withScorecard, withYouTube, withGoogleAds, withInfluencers, total: entities.length };
  }, [entities]);

  const items = [
    { label: 'Firmy', value: stats.total },
    { label: 'z NIP', value: stats.withNip },
    { label: 'z ceną', value: stats.withPricing },
    { label: 'z social', value: stats.withSocial },
    { label: 'z opiniami', value: stats.withReviews },
    { label: 'z finansami', value: stats.withFinance },
    { label: 'z scorecard', value: stats.withScorecard },
    { label: 'z YouTube', value: stats.withYouTube },
    { label: 'z Google Ads', value: stats.withGoogleAds },
    { label: 'z influencerami', value: stats.withInfluencers },
  ];

  return (
    <div className="flex gap-4 flex-wrap">
      {items.map((item) => (
        <div key={item.label} className="border border-cs-border bg-white px-4 py-2 min-w-[90px]">
          <div className="font-display text-lg font-bold">{item.value}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-cs-silver">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDim, setActiveDim] = useState('brand');
  const [search, setSearch] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<EntityData | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Load entities from scan_results (all scanned brands)
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/entities');
        if (!res.ok) return;
        const data = await res.json();
        setEntities(
          data.map((e: EntityData & { phase_count?: number }) => ({
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
          }))
        );
      } catch (err) {
        console.error('Failed to load', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Filter entities
  const filtered = useMemo(() => {
    if (!search.trim()) return entities;
    const q = search.toLowerCase();
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.domain || '').toLowerCase().includes(q) ||
        (e.nip || '').includes(q)
    );
  }, [entities, search]);

  // Sort entities
  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const dim = DIMENSIONS.find((d) => d.id === activeDim);
    if (!dim) return filtered;

    return [...filtered].sort((a, b) => {
      const va = getFieldValue(a.data, dim.dataPath, sortField);
      const vb = getFieldValue(b.data, dim.dataPath, sortField);

      // null goes last
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'pl');
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir, activeDim]);

  const handleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField]
  );

  const activeDimension = DIMENSIONS.find((d) => d.id === activeDim)!;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b-2 border-cs-black px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-cs-lg font-bold">
            CATSCAN
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-wider text-cs-silver">
            // EXPLORER
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj firmy, NIP..."
            className="font-mono text-[12px] border border-cs-border px-3 py-1.5 w-[220px] focus:outline-none focus:border-cs-black"
          />
          <button
            onClick={() => exportCSV(sorted, DIMENSIONS)}
            disabled={sorted.length === 0}
            className="font-mono text-[11px] uppercase tracking-wider border border-cs-border px-3 py-1.5 hover:border-cs-black hover:bg-cs-black hover:text-white transition-colors disabled:opacity-40"
            title="Eksport widocznych rekordów do CSV"
          >
            CSV
          </button>
          <button
            onClick={() => exportJSON(sorted)}
            disabled={sorted.length === 0}
            className="font-mono text-[11px] uppercase tracking-wider border border-cs-border px-3 py-1.5 hover:border-cs-black hover:bg-cs-black hover:text-white transition-colors disabled:opacity-40"
            title="Eksport widocznych rekordów do JSON (pełne dane)"
          >
            JSON
          </button>
          <Link
            href="/chat"
            className="font-mono text-[11px] uppercase tracking-wider border border-cs-border px-3 py-1.5 hover:border-cs-black hover:bg-cs-black hover:text-white transition-colors"
          >
            CHAT
          </Link>
          <Link
            href="/scan"
            className="font-mono text-[11px] uppercase tracking-wider border border-cs-border px-3 py-1.5 hover:border-cs-black transition-colors"
          >
            SCAN
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="font-mono text-cs-sm text-cs-gray animate-pulse">Ladowanie danych...</div>
        </div>
      ) : entities.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="font-display text-xl font-bold mb-2">Brak danych</div>
            <Link href="/scan" className="font-mono text-[11px] text-cs-black underline">
              Uruchom skan
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Stats bar */}
          <div className="px-6 py-4 bg-cs-canvas border-b border-cs-border">
            <QuickStats entities={entities} />
          </div>

          {/* Dimension tabs */}
          <div className="px-6 py-2 border-b border-cs-border bg-white flex items-center gap-1 overflow-x-auto">
            {DIMENSIONS.map((dim) => (
              <button
                key={dim.id}
                onClick={() => {
                  setActiveDim(dim.id);
                  setSortField(null);
                }}
                className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border whitespace-nowrap transition-colors ${
                  activeDim === dim.id
                    ? 'bg-cs-black text-white border-cs-black'
                    : 'border-cs-border text-cs-gray hover:border-cs-black hover:text-cs-black'
                }`}
              >
                {dim.label}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setViewMode('table')}
                className={`font-mono text-[10px] px-2 py-1 border ${viewMode === 'table' ? 'bg-cs-black text-white border-cs-black' : 'border-cs-border text-cs-gray'}`}
              >
                TABELA
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`font-mono text-[10px] px-2 py-1 border ${viewMode === 'cards' ? 'bg-cs-black text-white border-cs-black' : 'border-cs-border text-cs-gray'}`}
              >
                KARTY
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 p-6 overflow-auto">
            {viewMode === 'table' ? (
              <ComparisonTable
                entities={sorted}
                dimension={activeDimension}
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                onEntityClick={setSelectedEntity}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sorted.map((entity) => (
                  <div
                    key={entity.id}
                    onClick={() => setSelectedEntity(entity)}
                    className="border border-cs-border bg-white p-4 cursor-pointer hover:border-cs-black transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-display text-[14px] font-bold">{entity.name}</div>
                        <div className="font-mono text-[10px] text-cs-silver">{entity.domain}</div>
                      </div>
                      {entity.nip && (
                        <div className="font-mono text-[9px] text-cs-gray bg-cs-canvas px-2 py-0.5 border border-cs-border">
                          NIP: {entity.nip}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {activeDimension.fields.slice(0, 4).map((f) => {
                        const val = getFieldValue(entity.data, activeDimension.dataPath, f.key);
                        const formatted = formatValue(val, f.format);
                        return (
                          <div key={f.key} className="flex justify-between items-baseline">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-cs-silver">
                              {f.label}
                            </span>
                            <span className={`font-mono text-[11px] ${val == null ? 'text-cs-silver italic' : 'text-cs-ink'}`}>
                              {formatted.length > 40 ? formatted.slice(0, 40) + '...' : formatted}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Click hint */}
            {viewMode === 'table' && (
              <div className="mt-4 font-mono text-[10px] text-cs-silver text-center">
                Kliknij nazwe firmy aby otworzyc szczegoly &mdash; kliknij naglowek kolumny aby posortowac
              </div>
            )}
          </div>
        </div>
      )}

      {/* Entity detail side panel */}
      {selectedEntity && (
        <EntityDetailPanel
          entity={selectedEntity}
          onClose={() => setSelectedEntity(null)}
        />
      )}

    </div>
  );
}
