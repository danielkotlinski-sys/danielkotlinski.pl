/**
 * Cost tracking module — accumulates costs per scan from all API providers.
 * Stores breakdown in Redis for admin visibility.
 */

// ===================== PRICING (per 1M tokens / per unit) =====================

const PRICING = {
  // Claude — per million tokens (input / output)
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  // Perplexity sonar-pro — per million tokens
  'sonar-pro': { input: 3.0, output: 15.0 },
  // Jina — per request (approximate)
  'jina-reader': { perRequest: 0.01 },
  'jina-screenshot': { perRequest: 0.01 },
  // Apify — per actor run (approximate, varies by actor)
  'apify-instagram': { perRun: 0.15 },
  'apify-facebook': { perRun: 0.10 },
  'apify-linkedin': { perRun: 0.10 },
} as const;

// ===================== TYPES =====================

export interface CostEntry {
  provider: 'anthropic' | 'perplexity' | 'jina' | 'apify';
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
    const byProvider = { anthropic: 0, perplexity: 0, jina: 0, apify: 0 };
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
