import Redis from 'ioredis';
import type { ScannerReport, ScannerInput, LeadInfo } from '@/types/scanner';

export interface ScanMeta {
  scanId: string;
  createdAt: string;
  lead: LeadInfo;
  input: ScannerInput;
  reportUrl: string;
}

// In-memory fallback when Redis is not available (local dev)
const memoryStore = new Map<string, { data: string; expiry: number }>();

let redis: Redis | null = null;
let redisAvailable: boolean | null = null;

async function getRedis(): Promise<Redis | null> {
  if (redisAvailable === false) return null;

  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      console.log('REDIS_URL not set, using in-memory store');
      redisAvailable = false;
      return null;
    }

    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      connectTimeout: 5000,
    });

    redis.on('error', () => {
      // Silently handle — we'll fall back to memory
    });

    // Test connection
    try {
      await redis.ping();
      redisAvailable = true;
    } catch {
      console.log('Redis not reachable, using in-memory store');
      redisAvailable = false;
      redis.disconnect();
      redis = null;
      return null;
    }
  }

  return redis;
}

const REPORT_TTL = 365 * 24 * 60 * 60; // 1 year — reports available indefinitely
const RATE_LIMIT_TTL = 30 * 24 * 60 * 60; // 30 days between scans per email

function memSet(key: string, value: string, ttlSeconds: number) {
  memoryStore.set(key, {
    data: value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

function memGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data;
}

export async function saveReport(
  scanId: string,
  report: ScannerReport
): Promise<void> {
  const json = JSON.stringify(report);
  const r = await getRedis();
  if (r) {
    await r.set(`report:${scanId}`, json, 'EX', REPORT_TTL);
  } else {
    memSet(`report:${scanId}`, json, REPORT_TTL);
  }
}

export async function checkRateLimit(email: string): Promise<{ allowed: boolean; daysLeft?: number }> {
  const key = `ratelimit:${email.toLowerCase().trim()}`;
  const r = await getRedis();
  const existing = r ? await r.get(key) : memGet(key);

  if (existing) {
    const scanDate = new Date(existing);
    const daysSince = Math.floor((Date.now() - scanDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysLeft = 30 - daysSince;
    if (daysLeft > 0) {
      return { allowed: false, daysLeft };
    }
  }
  return { allowed: true };
}

export async function setRateLimit(email: string): Promise<void> {
  const key = `ratelimit:${email.toLowerCase().trim()}`;
  const now = new Date().toISOString();
  const r = await getRedis();
  if (r) {
    await r.set(key, now, 'EX', RATE_LIMIT_TTL);
  } else {
    memSet(key, now, RATE_LIMIT_TTL);
  }
}

export async function clearRateLimit(email: string): Promise<void> {
  const key = `ratelimit:${email.toLowerCase().trim()}`;
  const r = await getRedis();
  if (r) {
    await r.del(key);
  } else {
    memoryStore.delete(key);
  }
}

export async function getReport(
  scanId: string
): Promise<ScannerReport | null> {
  const r = await getRedis();
  const data = r
    ? await r.get(`report:${scanId}`)
    : memGet(`report:${scanId}`);
  if (!data) return null;
  return JSON.parse(data);
}

// === Scan metadata (lead + input) ===

export async function saveScanMeta(meta: ScanMeta): Promise<void> {
  const json = JSON.stringify(meta);
  const r = await getRedis();
  if (r) {
    await r.set(`scan:${meta.scanId}`, json, 'EX', REPORT_TTL);
    // Add to sorted set for listing (score = timestamp)
    await r.zadd('scans:all', Date.parse(meta.createdAt), meta.scanId);
  } else {
    memSet(`scan:${meta.scanId}`, json, REPORT_TTL);
  }
}

export async function listScans(limit = 50, offset = 0): Promise<ScanMeta[]> {
  const r = await getRedis();
  if (!r) {
    // Memory fallback — just return what we have
    const results: ScanMeta[] = [];
    memoryStore.forEach((entry, key) => {
      if (key.startsWith('scan:') && Date.now() <= entry.expiry) {
        results.push(JSON.parse(entry.data));
      }
    });
    return results
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(offset, offset + limit);
  }

  // Get scanIds from sorted set, newest first
  const scanIds = await r.zrevrange('scans:all', offset, offset + limit - 1);
  if (scanIds.length === 0) return [];

  const pipeline = r.pipeline();
  for (const id of scanIds) {
    pipeline.get(`scan:${id}`);
  }
  const results = await pipeline.exec();
  if (!results) return [];

  return results
    .map(([err, data]) => {
      if (err || !data) return null;
      try { return JSON.parse(data as string) as ScanMeta; } catch { return null; }
    })
    .filter((m): m is ScanMeta => m !== null);
}
