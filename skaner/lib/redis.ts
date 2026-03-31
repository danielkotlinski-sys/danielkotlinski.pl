import Redis from 'ioredis';
import type { ScannerReport } from '@/types/scanner';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redis;
}

const REPORT_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export async function saveReport(
  scanId: string,
  report: ScannerReport
): Promise<void> {
  const r = getRedis();
  await r.set(`report:${scanId}`, JSON.stringify(report), 'EX', REPORT_TTL);
}

export async function getReport(
  scanId: string
): Promise<ScannerReport | null> {
  const r = getRedis();
  const data = await r.get(`report:${scanId}`);
  if (!data) return null;
  return JSON.parse(data);
}

export async function saveScanProgress(
  scanId: string,
  progress: Record<string, unknown>
): Promise<void> {
  const r = getRedis();
  await r.set(
    `progress:${scanId}`,
    JSON.stringify(progress),
    'EX',
    3600 // 1 hour TTL for progress data
  );
}

export async function getScanProgress(
  scanId: string
): Promise<Record<string, unknown> | null> {
  const r = getRedis();
  const data = await r.get(`progress:${scanId}`);
  if (!data) return null;
  return JSON.parse(data);
}
