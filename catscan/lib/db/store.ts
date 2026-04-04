/**
 * JSON file-based storage for MVP. Replace with Supabase later.
 * Stores data in catscan/data/ directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(collection: string): string {
  return join(DATA_DIR, `${collection}.json`);
}

function readCollection<T>(collection: string): T[] {
  ensureDir();
  const fp = filePath(collection);
  if (!existsSync(fp)) return [];
  return JSON.parse(readFileSync(fp, 'utf-8'));
}

function writeCollection<T>(collection: string, data: T[]) {
  ensureDir();
  writeFileSync(filePath(collection), JSON.stringify(data, null, 2));
}

// --- Scans ---

export interface ScanRecord {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sectorId: string;
  entities: EntityRecord[];
  phasesCompleted: string[];
  currentPhase: string | null;
  log: string[];
  totalCostUsd: number;
  interpretation?: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface EntityRecord {
  id: string;
  name: string;
  url: string;
  nip?: string;
  krs?: string;
  domain?: string;
  rawHtml?: string;
  data: Record<string, unknown>;
  financials?: Record<string, unknown>;
  status: 'pending' | 'crawled' | 'extracted' | 'enriched' | 'failed';
  errors: string[];
}

export function getScans(): ScanRecord[] {
  return readCollection<ScanRecord>('scans');
}

export function getScan(id: string): ScanRecord | undefined {
  return getScans().find(s => s.id === id);
}

export function saveScan(scan: ScanRecord) {
  const scans = getScans();
  const idx = scans.findIndex(s => s.id === scan.id);
  if (idx >= 0) {
    scans[idx] = scan;
  } else {
    scans.push(scan);
  }
  writeCollection('scans', scans);
}

export function appendLog(scanId: string, message: string) {
  const scan = getScan(scanId);
  if (!scan) return;
  const timestamp = new Date().toISOString().slice(11, 19);
  scan.log.push(`[${timestamp}] ${message}`);
  saveScan(scan);
}
