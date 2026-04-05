/**
 * Resilient HTTP client with retry, backoff, and rate limiting.
 *
 * Usage:
 *   import { resilientFetch, resilientCurl } from '@/lib/utils/resilient-fetch';
 *   const data = resilientCurl(url, { headers: {...}, timeout: 20000 });
 *   const json = resilientFetch(url, { method: 'POST', body, provider: 'perplexity' });
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

// ── Rate limiting per provider ──

interface ProviderConfig {
  maxPerMinute: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const PROVIDER_LIMITS: Record<string, ProviderConfig> = {
  perplexity:  { maxPerMinute: 20,  maxRetries: 3, baseDelayMs: 2000,  maxDelayMs: 30000 },
  apify:       { maxPerMinute: 10,  maxRetries: 3, baseDelayMs: 3000,  maxDelayMs: 60000 },
  'rejestr.io':{ maxPerMinute: 30,  maxRetries: 3, baseDelayMs: 1000,  maxDelayMs: 15000 },
  anthropic:   { maxPerMinute: 15,  maxRetries: 3, baseDelayMs: 2000,  maxDelayMs: 30000 },
  dietly:      { maxPerMinute: 30,  maxRetries: 2, baseDelayMs: 1000,  maxDelayMs: 10000 },
  meta:        { maxPerMinute: 30,  maxRetries: 2, baseDelayMs: 1000,  maxDelayMs: 10000 },
  web:         { maxPerMinute: 60,  maxRetries: 2, baseDelayMs: 500,   maxDelayMs: 5000  },
};

// Sliding window: track timestamps of recent calls per provider
const callLog: Record<string, number[]> = {};

function waitForRateLimit(provider: string): void {
  const config = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.web;
  if (!callLog[provider]) callLog[provider] = [];

  const now = Date.now();
  const window = 60_000; // 1 minute
  // Clean old entries
  callLog[provider] = callLog[provider].filter(t => now - t < window);

  if (callLog[provider].length >= config.maxPerMinute) {
    const oldest = callLog[provider][0];
    const waitMs = window - (now - oldest) + 100; // +100ms buffer
    if (waitMs > 0) {
      console.log(`[rate-limit] ${provider}: ${callLog[provider].length}/${config.maxPerMinute} calls/min, waiting ${(waitMs / 1000).toFixed(1)}s`);
      sleepMs(waitMs);
    }
  }

  callLog[provider].push(Date.now());
}

function sleepMs(ms: number): void {
  execSync(`sleep ${(ms / 1000).toFixed(2)}`, { timeout: ms + 5000 });
}

function backoffDelay(attempt: number, config: ProviderConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = delay * (0.8 + Math.random() * 0.4); // ±20%
  return Math.min(jitter, config.maxDelayMs);
}

// ── Public: resilient curl call ──

export interface CurlOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeout?: number;      // ms, default 20000
  provider?: string;     // for rate limiting
  maxBuffer?: number;    // bytes, default 10MB
  retries?: number;      // override provider default
  label?: string;        // for logging
}

/**
 * Execute a curl call with retry + rate limiting.
 * Returns raw string response, or null on final failure.
 */
export function resilientCurl(url: string, opts: CurlOptions = {}): string | null {
  const provider = opts.provider || 'web';
  const config = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.web;
  const maxRetries = opts.retries ?? config.maxRetries;
  const timeout = opts.timeout || 20000;
  const maxBuffer = opts.maxBuffer || 10 * 1024 * 1024;
  const label = opts.label || `${provider}:${url.slice(0, 60)}`;

  let lastError: string = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    waitForRateLimit(provider);

    // Build curl command
    const headerFlags = Object.entries(opts.headers || {})
      .map(([k, v]) => `-H '${k}: ${v}'`)
      .join(' ');

    let bodyFlag = '';
    let tmpFile: string | null = null;
    if (opts.body) {
      const bodyStr = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      tmpFile = `/tmp/rf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
      writeFileSync(tmpFile, bodyStr);
      bodyFlag = `-d @${tmpFile}`;
    }

    const methodFlag = opts.method === 'POST' ? '-X POST' : '';
    const cmd = `curl -s -m ${Math.ceil(timeout / 1000)} ${methodFlag} ${headerFlags} ${bodyFlag} '${url}'`;

    try {
      const result = execSync(cmd, { maxBuffer, timeout: timeout + 5000 }).toString('utf-8');
      if (tmpFile) try { unlinkSync(tmpFile); } catch { /* ok */ }

      // Check for HTTP error patterns in response
      if (result.includes('"error"') || result.includes('"code":429') || result.includes('"code":503')) {
        const parsed = safeJsonParse(result) as Record<string, unknown> | null;
        const errObj = (parsed?.error || {}) as Record<string, unknown>;
        const code = errObj.code ?? parsed?.code ?? parsed?.status;
        if (code === 429) {
          lastError = `429 rate limited`;
          if (attempt < maxRetries) {
            const delay = backoffDelay(attempt, config);
            console.warn(`[retry] ${label} — 429 rate limit, retry ${attempt + 1}/${maxRetries} in ${(delay / 1000).toFixed(1)}s`);
            sleepMs(delay);
            continue;
          }
        }
        if (code === 503) {
          lastError = `503 service unavailable`;
          if (attempt < maxRetries) {
            const delay = backoffDelay(attempt, config);
            console.warn(`[retry] ${label} — 503, retry ${attempt + 1}/${maxRetries} in ${(delay / 1000).toFixed(1)}s`);
            sleepMs(delay);
            continue;
          }
        }
      }

      return result;
    } catch (err) {
      if (tmpFile) try { unlinkSync(tmpFile); } catch { /* ok */ }
      lastError = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt, config);
        console.warn(`[retry] ${label} — ${lastError.slice(0, 80)}, retry ${attempt + 1}/${maxRetries} in ${(delay / 1000).toFixed(1)}s`);
        sleepMs(delay);
      }
    }
  }

  console.error(`[failed] ${label} — all ${maxRetries + 1} attempts failed: ${lastError.slice(0, 120)}`);
  return null;
}

/**
 * Resilient curl that parses JSON response.
 * Returns parsed object or null.
 */
export function resilientJson<T = Record<string, unknown>>(url: string, opts: CurlOptions = {}): T | null {
  const raw = resilientCurl(url, opts);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[json-parse] Failed to parse response from ${opts.provider || 'web'}: ${raw.slice(0, 100)}`);
    return null;
  }
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}

// ── Perplexity helper ──

export function callPerplexityResilient(prompt: string, apiKey: string, label?: string): Record<string, unknown> | null {
  const raw = resilientCurl('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: { model: 'sonar', messages: [{ role: 'user', content: prompt }], temperature: 0.1 },
    timeout: 70000,
    provider: 'perplexity',
    label: label || 'perplexity',
  });

  if (!raw) return null;

  try {
    const response = JSON.parse(raw);
    if (response.error) {
      console.warn(`[perplexity] API error:`, response.error);
      return null;
    }
    const content = response.choices?.[0]?.message?.content || '';
    let jsonStr = content;
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
    return JSON.parse(jsonStr.trim());
  } catch (err) {
    console.warn(`[perplexity] Parse failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Apify helper ──

export function runApifyActorResilient(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
  opts: { timeout?: number; label?: string } = {}
): unknown[] {
  const timeout = opts.timeout || 120000;
  const label = opts.label || `apify:${actorId}`;

  const raw = resilientCurl(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: input,
      timeout,
      provider: 'apify',
      label,
    }
  );

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`[apify] Failed to parse response for ${actorId}`);
    return [];
  }
}

// ── Anthropic Claude helper ──

export function callClaudeResilient(
  model: string,
  systemPrompt: string | undefined,
  userContent: string | Array<Record<string, unknown>>,
  apiKey: string,
  opts: { maxTokens?: number; timeout?: number; label?: string } = {}
): string | null {
  const messages: Array<Record<string, unknown>> = [];
  if (typeof userContent === 'string') {
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: userContent });
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens || 4096,
    messages,
  };
  if (systemPrompt) body.system = systemPrompt;

  const raw = resilientCurl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body,
    timeout: opts.timeout || 130000,
    provider: 'anthropic',
    label: opts.label || `claude:${model}`,
  });

  if (!raw) return null;

  try {
    const resp = JSON.parse(raw);
    if (resp.error) {
      console.warn(`[claude] API error:`, resp.error);
      return null;
    }
    const text = resp.content?.[0]?.text;
    return text || null;
  } catch {
    return null;
  }
}
