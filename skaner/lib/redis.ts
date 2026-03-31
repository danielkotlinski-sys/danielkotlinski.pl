import Redis from 'ioredis';
import type { ScannerReport } from '@/types/scanner';

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

const REPORT_TTL = 30 * 24 * 60 * 60; // 30 days

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
