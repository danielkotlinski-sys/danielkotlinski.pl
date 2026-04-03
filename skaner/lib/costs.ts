/**
 * Cost tracking module — accumulates costs per scan from all API providers.
 * Stores breakdown in Redis for admin visibility.
 */

// ===================== PRICING (per 1M tokens / per unit) =====================
//
// COST ESTIMATE PER FULL SCAN (4 brands, Instagram, FB Ads enabled):
// ─────────────────────────────────────────────────────────────────
// Firecrawl (website scraping + screenshots):
//   4 brands × ~4 pages × 2 credits:    ~$0.19  (Hobby: ~$0.006/credit)
//   Free tier: 500 credits one-time      $0.00   (covers ~31 scans)
//
// Apify (Bronze plan $0.30/CU) — social media + ads only:
//   instagram-scraper × 4 brands:        ~$1.00  (4 × ~0.8 CU)
//   facebook-ads-scraper × 4 brands:     ~$0.80  (4 × ~0.6 CU)
//   Apify subtotal:                      ~$1.80
//
// Claude (Sonnet 4.5 + Opus 4.5):
//   Atomic analysis (6 prompts × 4):     ~$0.30  (Sonnet, ~2k tok in/out each)
//   Brand profiles (4 × Opus):           ~$0.60  (Opus, ~3k tok in/out each)
//   Category synthesis (3 × Opus):       ~$0.50  (Opus, ~4k tok in/out)
//   Vision analysis (~32 posts):         ~$0.20  (Sonnet, images)
//   Claude subtotal:                     ~$1.60
//
// Perplexity (sonar-pro × 4):           ~$0.10
//
// TOTAL ESTIMATE:                       ~$3.70 per scan
// With free Firecrawl tier:             ~$3.50 per scan
// With SCAN_MODE=test (Haiku):          ~$2.20 per scan
// ─────────────────────────────────────────────────────────────────

const PRICING = {
  // Claude — per million tokens (input / output)
  // https://docs.anthropic.com/en/docs/about-claude/models
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
  // Perplexity sonar-pro — per million tokens
  'sonar-pro': { input: 3.0, output: 15.0 },
  // Firecrawl — primary website scraper (text + screenshots)
  // Free: 500 credits one-time. Hobby: 70 PLN/mo = 3,000 credits/mo.
  // 1 credit = 1 page. Screenshot format costs extra credit per page.
  'firecrawl': { perPage: 0.006 },        // Hobby: 70 PLN / 3000 credits ≈ $0.006/credit
  // Jina — fallback only (used when Firecrawl is unavailable)
  'jina-reader': { perRequest: 0.01 },
  'jina-screenshot': { perRequest: 0.01 },
  // Apify — Bronze plan: $0.30/CU
  // Used for social media scraping + ads (Meta blocks regular crawlers).
  'apify-instagram': { perRun: 0.25 },    // ~0.8 CU × $0.30 (12-20 posts + images)
  'apify-facebook': { perRun: 0.15 },     // ~0.5 CU × $0.30
  'apify-linkedin': { perRun: 0.12 },     // ~0.4 CU × $0.30
  'apify-facebook-ads': { perRun: 0.20 }, // ~0.6 CU × $0.30 (15-45 ads filtered)
  // website-content-crawler: fallback if Firecrawl unavailable
  'apify-website': { perRun: 0.25 },      // ~0.8 CU × $0.30
} as const;

// ===================== TYPES =====================

export interface CostEntry {
  provider: 'anthropic' | 'perplexity' | 'jina' | 'apify' | 'firecrawl';
  service: string; // model name or actor name
  operation: string; // human-readable label e.g. "brand profile: MarkaX"
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
  costUsd: number;
  timestamp: string;
}

export interface ScanCostSummary {
  scanId: string;
  totalUsd: number;
  byProvider: {
    anthropic: number;
    perplexity: number;
    jina: number;
    apify: number;
    firecrawl: number;
  };
  entries: CostEntry[];
  createdAt: string;
}

// ===================== ACCUMULATOR =====================

/**
 * Per-scan cost tracker. Create one at start of pipeline, call track*() methods
 * throughout, then call save() at end.
 */
export class ScanCostTracker {
  private entries: CostEntry[] = [];
  public readonly scanId: string;

  constructor(scanId: string) {
    this.scanId = scanId;
  }

  trackAnthropic(
    model: string,
    operation: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    const pricing = PRICING[model as keyof typeof PRICING];
    if (!pricing || !('input' in pricing)) {
      console.warn(`[costs] Unknown Claude model: ${model}`);
      return;
    }
    const costUsd =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    this.entries.push({
      provider: 'anthropic',
      service: model,
      operation,
      inputTokens,
      outputTokens,
      costUsd,
      timestamp: new Date().toISOString(),
    });
  }

  trackPerplexity(
    operation: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    const pricing = PRICING['sonar-pro'];
    const costUsd =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    this.entries.push({
      provider: 'perplexity',
      service: 'sonar-pro',
      operation,
      inputTokens,
      outputTokens,
      costUsd,
      timestamp: new Date().toISOString(),
    });
  }

  trackJina(operation: string, requestType: 'reader' | 'screenshot', count: number = 1): void {
    const key = requestType === 'reader' ? 'jina-reader' : 'jina-screenshot';
    const pricing = PRICING[key];
    const costUsd = count * pricing.perRequest;

    this.entries.push({
      provider: 'jina',
      service: key,
      operation,
      requests: count,
      costUsd,
      timestamp: new Date().toISOString(),
    });
  }

  trackFirecrawl(operation: string, pageCount: number = 1): void {
    const pricing = PRICING['firecrawl'];
    // Screenshot format may cost an additional credit per page
    const credits = pageCount * 2; // markdown + screenshot = 2 credits per page
    const costUsd = credits * pricing.perPage;

    this.entries.push({
      provider: 'firecrawl',
      service: 'firecrawl',
      operation,
      requests: pageCount,
      costUsd,
      timestamp: new Date().toISOString(),
    });
  }

  trackApify(platform: string, operation: string): void {
    const key = `apify-${platform}` as keyof typeof PRICING;
    const pricing = PRICING[key];
    // Use fixed per-run estimate or scale by duration
    const costUsd = pricing && 'perRun' in pricing ? pricing.perRun : 0.10;

    this.entries.push({
      provider: 'apify',
      service: `apify-${platform}`,
      operation,
      costUsd,
      timestamp: new Date().toISOString(),
    });
  }

  getSummary(): ScanCostSummary {
    const byProvider = { anthropic: 0, perplexity: 0, jina: 0, apify: 0, firecrawl: 0 };
    for (const e of this.entries) {
      byProvider[e.provider] += e.costUsd;
    }
    return {
      scanId: this.scanId,
      totalUsd: Object.values(byProvider).reduce((a, b) => a + b, 0),
      byProvider,
      entries: this.entries,
      createdAt: new Date().toISOString(),
    };
  }

  async save(): Promise<void> {
    const summary = this.getSummary();
    console.log(
      `[costs] Scan ${this.scanId}: $${summary.totalUsd.toFixed(3)} total — ` +
      `Claude: $${summary.byProvider.anthropic.toFixed(3)}, ` +
      `Perplexity: $${summary.byProvider.perplexity.toFixed(3)}, ` +
      `Apify: $${summary.byProvider.apify.toFixed(3)}, ` +
      `Firecrawl: $${summary.byProvider.firecrawl.toFixed(3)}, ` +
      `Jina: $${summary.byProvider.jina.toFixed(3)} ` +
      `(${this.entries.length} entries)`
    );

    try {
      const { getRedisRaw } = await import('./redis');
      const r = await getRedisRaw();
      if (r) {
        await r.set(`scan:${this.scanId}:costs`, JSON.stringify(summary), 'EX', 90 * 24 * 60 * 60); // 90 days
        // Add to monthly aggregate
        const month = new Date().toISOString().slice(0, 7); // "2026-04"
        await r.sadd(`costs:months`, month);
        await r.rpush(`costs:${month}`, JSON.stringify({
          scanId: this.scanId,
          totalUsd: summary.totalUsd,
          byProvider: summary.byProvider,
          createdAt: summary.createdAt,
        }));
      }
    } catch (err) {
      console.error('[costs] Failed to save cost data:', err);
    }
  }
}
