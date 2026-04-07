import { NextRequest, NextResponse } from 'next/server';
import { db, stmts } from '@/lib/db/sqlite';

const EXPECTED_DIMS = [
  'brand_identity', 'messaging', 'pricing', 'menu', 'delivery', 'technology',
  'social_proof', 'contact', 'seo', 'website_structure', 'content_marketing',
  'customer_acquisition', 'differentiators', 'visual_identity', 'context',
  'social', 'ads', 'reviews', 'finance',
];

// ---------------------------------------------------------------------------
// Error classification — maps error patterns to actionable diagnostics
// ---------------------------------------------------------------------------

interface Diagnostic {
  type: 'transient' | 'config' | 'upstream' | 'structural';
  message: string;        // Human-readable explanation
  fix: string;            // What to do
  autoRetryable: boolean; // Can auto-retry help?
  retryPhases?: string[]; // Which phases to retry
}

/** Map a dimension name to the phase(s) that produce it */
function dimToPhases(dim: string): string[] {
  const map: Record<string, string[]> = {
    brand_identity: ['extract'], messaging: ['extract'], pricing: ['extract', 'pricing_fallback'],
    menu: ['extract'], delivery: ['extract'], technology: ['extract'],
    social_proof: ['extract'], contact: ['extract'], seo: ['extract'],
    website_structure: ['extract'], content_marketing: ['extract'],
    customer_acquisition: ['extract'], differentiators: ['extract'],
    visual_identity: ['visual'], context: ['context'], social: ['social'],
    ads: ['ads'], reviews: ['reviews'], finance: ['finance', 'discovery'],
    video: ['video', 'social'], youtube_reviews: ['youtube_reviews'],
    scorecard: ['scorecard'],
  };
  return map[dim] || [dim];
}

function classifyError(error: string, missingDims: string[]): Diagnostic {
  const e = error.toLowerCase();

  // API rate limits / timeouts
  if (e.includes('rate limit') || e.includes('429') || e.includes('quota')) {
    return {
      type: 'transient', message: 'API rate limit',
      fix: 'Poczekaj kilka minut i uruchom reskan', autoRetryable: true,
    };
  }
  if (e.includes('timeout') || e.includes('timed out') || e.includes('econnreset') || e.includes('socket')) {
    return {
      type: 'transient', message: 'Timeout połączenia',
      fix: 'Problem z siecią — powtórz skan', autoRetryable: true,
    };
  }
  if (e.includes('500') || e.includes('502') || e.includes('503') || e.includes('internal server error')) {
    return {
      type: 'transient', message: 'Błąd serwera zewnętrznego (5xx)',
      fix: 'Serwer API chwilowo niedostępny — powtórz później', autoRetryable: true,
    };
  }

  // JSON parse errors — now fixable with improved parser
  if (e.includes('json parse error') || e.includes('invalid json')) {
    return {
      type: 'transient', message: 'Błąd parsowania odpowiedzi AI',
      fix: 'Powtórz fazę crawl + extract — parser został ulepszony', autoRetryable: true,
      retryPhases: ['crawl', 'extract'],
    };
  }

  // HTML/content issues
  if (e.includes('corrupted') || e.includes('compressed') || e.includes('unreadable') || e.includes('encoded')) {
    return {
      type: 'structural', message: 'Strona renderowana przez JavaScript (curl nie widzi treści)',
      fix: 'Strona wymaga headless browser — crawl via Apify zamiast curl', autoRetryable: false,
      retryPhases: ['crawl', 'extract'],
    };
  }

  // Screenshot/visual failures
  if (e.includes('screenshot') || e.includes('visual')) {
    return {
      type: 'transient', message: 'Screenshot się nie udał',
      fix: 'Powtórz fazę visual', autoRetryable: true,
      retryPhases: ['visual'],
    };
  }

  // Instagram auth
  if (e.includes('instagram') && (e.includes('login') || e.includes('cookie') || e.includes('auth'))) {
    return {
      type: 'config', message: 'Instagram wymaga autentykacji',
      fix: 'Zaloguj się na IG z IP serwera i wyeksportuj cookies do cookies/cookies.txt', autoRetryable: false,
    };
  }

  // Missing API keys
  if (e.includes('api_key not set') || e.includes('api key') || e.includes('token not set')) {
    const keyMatch = error.match(/(\w+_API_KEY|\w+_TOKEN)/i);
    return {
      type: 'config', message: `Brak klucza API: ${keyMatch?.[1] || 'nieznany'}`,
      fix: `Ustaw ${keyMatch?.[1] || 'klucz'} w .env`, autoRetryable: false,
    };
  }

  // Apify actor failures
  if (e.includes('apify') && (e.includes('failed') || e.includes('error'))) {
    return {
      type: 'transient', message: 'Apify actor zwrócił błąd',
      fix: 'Powtórz skan — Apify bywa niestabilne', autoRetryable: true,
    };
  }

  // Missing upstream data
  if (e.includes('no video posts') || e.includes('run social phase first')) {
    return {
      type: 'upstream', message: 'Brak danych z poprzedniej fazy',
      fix: 'Uruchom najpierw fazę social, potem video', autoRetryable: true,
      retryPhases: ['social', 'video'],
    };
  }

  // NIP/discovery issues
  if (e.includes('nip') && (e.includes('not found') || e.includes('not valid'))) {
    return {
      type: 'structural', message: 'Nie znaleziono NIP firmy',
      fix: 'NIP nie występuje na stronie ani w rejestr.io — wprowadź ręcznie', autoRetryable: false,
    };
  }

  // Default: unknown error — assume transient
  return {
    type: 'transient', message: 'Nieznany błąd',
    fix: 'Spróbuj ponowić skan', autoRetryable: true,
  };
}

/** Build diagnostics for an incomplete brand */
function buildBrandDiagnostics(
  missingDims: Array<{ dim: string; reason: string }>,
  errors: string[],
): { diagnostics: Diagnostic[]; retryPhases: string[]; canAutoRetry: boolean } {
  const diagnostics: Diagnostic[] = [];
  const retryPhasesSet = new Set<string>();
  let canAutoRetry = true;

  // Classify each error
  for (const error of errors) {
    const diag = classifyError(error, missingDims.map(d => d.dim));
    diagnostics.push(diag);
    if (!diag.autoRetryable) canAutoRetry = false;
    if (diag.retryPhases) diag.retryPhases.forEach(p => retryPhasesSet.add(p));
  }

  // For missing dims without explicit errors, infer needed phases
  for (const { dim, reason } of missingDims) {
    if (reason === 'not_attempted') {
      dimToPhases(dim).forEach(p => retryPhasesSet.add(p));
    } else if (reason === 'empty' || reason === 'skipped') {
      // Phase ran but produced nothing — check if any error explains it
      const hasRelatedError = errors.some(e => {
        const el = e.toLowerCase();
        return dimToPhases(dim).some(p => el.includes(p));
      });
      if (!hasRelatedError) {
        dimToPhases(dim).forEach(p => retryPhasesSet.add(p));
      }
    }
  }

  // If no errors but still missing dims, it's retryable
  if (diagnostics.length === 0 && missingDims.length > 0) {
    diagnostics.push({
      type: 'transient', message: 'Fazy nie zwróciły danych',
      fix: 'Powtórz brakujące fazy', autoRetryable: true,
    });
  }

  // If many dimensions are missing, just run the full pipeline
  if (missingDims.length >= 5) {
    const ALL_PHASES = [
      'crawl', 'extract', 'visual', 'context', 'pricing_fallback', 'discovery',
      'social', 'video', 'youtube_reviews', 'ads', 'google_ads', 'reviews',
      'finance', 'influencer_press', 'influencer_ig', 'scorecard',
    ];
    return {
      diagnostics: diagnostics.length > 0 ? diagnostics : [{
        type: 'transient', message: 'Większość wymiarów brakuje',
        fix: 'Wymagany pełny reskan', autoRetryable: true,
      }],
      retryPhases: ALL_PHASES,
      canAutoRetry: true,
    };
  }

  // Ensure dependency chains: extract needs crawl, video needs social, etc.
  if (retryPhasesSet.has('extract') && !retryPhasesSet.has('crawl')) {
    retryPhasesSet.add('crawl');
  }
  if (retryPhasesSet.has('video') && !retryPhasesSet.has('social')) {
    retryPhasesSet.add('social');
  }
  if (retryPhasesSet.has('finance') && !retryPhasesSet.has('discovery')) {
    retryPhasesSet.add('discovery');
  }
  if (retryPhasesSet.has('scorecard')) {
    // Scorecard needs all data phases
    retryPhasesSet.add('crawl');
    retryPhasesSet.add('extract');
  }

  // Sort phases in pipeline order
  const PHASE_ORDER = [
    'crawl', 'extract', 'visual', 'context', 'pricing_fallback', 'discovery',
    'social', 'video', 'youtube_reviews', 'ads', 'google_ads', 'reviews',
    'finance', 'influencer_press', 'influencer_ig', 'scorecard',
  ];
  const sortedPhases = PHASE_ORDER.filter(p => retryPhasesSet.has(p));

  return {
    diagnostics,
    retryPhases: sortedPhases,
    canAutoRetry,
  };
}

/**
 * GET /api/scan/stats — database stats for the dashboard
 *
 * Optimized vs original: batch-loads scan audit logs instead of N+1 queries.
 * brandList is lazy-loaded via ?brands=1 query param.
 */
export async function GET(req: NextRequest) {
  const totalBrands = (stmts.countBrands.get() as { count: number }).count;

  const allResults = stmts.getAllScanResults.all() as Array<{
    slug: string;
    data: string;
    phase_count: number;
    phases: string;
    updated_at: string;
  }>;

  const scannedBrands = allResults.length;

  const incompleteList: Array<{
    slug: string; name: string; dims: number; missing: string[];
    missingDetails: Array<{ dim: string; reason: 'not_attempted' | 'skipped' | 'empty' }>;
    errors: string[];
    diagnostics: Diagnostic[];
    retryPhases: string[];
    canAutoRetry: boolean;
  }> = [];
  let completeBrands = 0;
  const completeSlugs: string[] = [];

  // Parse data JSON for each result to determine completeness
  const incompleteRows: Array<{ slug: string; data: Record<string, unknown> }> = [];
  const dimCounts = new Map<string, number>(); // slug -> actual dim count

  for (const row of allResults) {
    let dataObj: Record<string, unknown> = {};
    try { dataObj = JSON.parse(row.data); } catch { /* empty */ }

    const presentCount = EXPECTED_DIMS.filter(d => {
      const val = dataObj[d];
      return val !== undefined && val !== null && val !== '';
    }).length;

    dimCounts.set(row.slug, presentCount);

    if (presentCount >= EXPECTED_DIMS.length) {
      completeBrands++;
      completeSlugs.push(row.slug);
    } else {
      incompleteRows.push({ slug: row.slug, data: dataObj });
    }
  }

  // Batch-load brand info and scan audit logs for incomplete brands
  if (incompleteRows.length > 0) {
    const slugs = incompleteRows.map(r => r.slug);
    const placeholders = slugs.map(() => '?').join(',');

    const brandRows = db.prepare(
      `SELECT slug, name, domain, last_scan_id FROM brands WHERE slug IN (${placeholders})`
    ).all(...slugs) as Array<{ slug: string; name: string; domain: string; last_scan_id: string | null }>;
    const brandMap = new Map(brandRows.map(b => [b.slug, b]));

    // Batch-load scan audit logs for error extraction
    const scanIds = Array.from(new Set(brandRows.map(b => b.last_scan_id).filter((id): id is string => id != null)));
    const scanMap = new Map<string, string>();
    if (scanIds.length > 0) {
      const scanPlaceholders = scanIds.map(() => '?').join(',');
      const scanRows = db.prepare(
        `SELECT id, entities FROM scans WHERE id IN (${scanPlaceholders})`
      ).all(...scanIds) as Array<{ id: string; entities: string }>;
      for (const s of scanRows) {
        scanMap.set(s.id, s.entities);
      }
    }

    for (const row of incompleteRows) {
      const brand = brandMap.get(row.slug);
      const presentDims = EXPECTED_DIMS.filter(d => {
        const val = row.data[d];
        return val !== undefined && val !== null && val !== '';
      });
      const missing = EXPECTED_DIMS.filter(d => !presentDims.includes(d));

      const errors: string[] = [];
      if (brand?.last_scan_id && scanMap.has(brand.last_scan_id)) {
        try {
          const entities = JSON.parse(scanMap.get(brand.last_scan_id)!) as Array<{ name: string; domain?: string; errors: string[] }>;
          const match = entities.find(e => e.domain === brand.domain || e.name === brand.name);
          if (match?.errors?.length) {
            errors.push(...match.errors);
          }
        } catch { /* parse error — skip */ }
      }

      // Classify each missing dim: check if it has a value that's explicitly empty/skipped
      const missingDetails = missing.map(dim => {
        const val = row.data[dim];
        if (val === undefined || val === null) return { dim, reason: 'not_attempted' as const };
        if (typeof val === 'object' && val && 'skipped' in val) return { dim, reason: 'skipped' as const };
        if (typeof val === 'string' && val === '') return { dim, reason: 'empty' as const };
        return { dim, reason: 'empty' as const };
      });

      const { diagnostics, retryPhases, canAutoRetry } = buildBrandDiagnostics(missingDetails, errors);

      incompleteList.push({
        slug: row.slug,
        name: brand?.name || row.slug,
        dims: presentDims.length,
        missing,
        missingDetails,
        errors,
        diagnostics,
        retryPhases,
        canAutoRetry,
      });
    }

    incompleteList.sort((a, b) => a.dims - b.dims);
  }

  const financialYears = (db.prepare('SELECT COUNT(*) as count FROM financial_years').get() as { count: number }).count;
  const socialPosts = (db.prepare('SELECT COUNT(*) as count FROM social_posts').get() as { count: number }).count;

  const recentScans = allResults.slice(0, 20).map(r => ({
    slug: r.slug,
    phase_count: dimCounts.get(r.slug) ?? r.phase_count,
    updated_at: r.updated_at,
  }));

  // brandList is only needed when custom scan config is open — lazy load via query param
  const includeBrands = req.nextUrl.searchParams.get('brands') === '1';
  let brandList: Array<{ slug: string; name: string; url: string; status: string }> | undefined;

  if (includeBrands) {
    const allBrands = stmts.getAllBrands.all() as Array<{
      slug: string; name: string; url: string; domain: string;
    }>;
    const scannedSet = new Set(allResults.map(r => r.slug));
    const completeSet = new Set(completeSlugs);

    brandList = allBrands.map(b => ({
      slug: b.slug,
      name: b.name,
      url: b.url,
      status: completeSet.has(b.slug) ? 'complete'
        : scannedSet.has(b.slug) ? 'incomplete'
        : 'unscanned',
    }));
  }

  return NextResponse.json({
    totalBrands,
    scannedBrands,
    completeBrands,
    incompleteBrands: incompleteList.length,
    financialYears,
    socialPosts,
    incompleteList,
    recentScans,
    ...(brandList ? { brandList } : {}),
  });
}
