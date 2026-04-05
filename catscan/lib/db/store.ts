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

// --- Brands (persistent seed + enriched data) ---

interface BrandRecord {
  slug: string;
  name: string;
  domain?: string;
  url: string;
  [key: string]: unknown;
}

export function getBrands(): BrandRecord[] {
  return readCollection<BrandRecord>('brands');
}

function saveBrands(brands: BrandRecord[]) {
  writeCollection('brands', brands);
}

/**
 * Merge scan results back into brands.json.
 * Matches by domain (primary) or name (fallback).
 * Returns count of brands updated.
 */
export function mergeScanIntoBrands(scan: ScanRecord): number {
  const brands = getBrands();
  let updated = 0;

  for (const entity of scan.entities) {
    if (entity.status === 'failed' && Object.keys(entity.data).length === 0) continue;

    // Match by domain (primary) or slug/name (fallback)
    const entityDomain = entity.domain || new URL(entity.url).hostname.replace('www.', '');
    let brand = brands.find(b => {
      const bDomain = b.domain || '';
      return bDomain === entityDomain || bDomain === `www.${entityDomain}`;
    });
    if (!brand) {
      brand = brands.find(b => b.name.toLowerCase() === entity.name.toLowerCase());
    }

    if (!brand) {
      // New brand not in seed — add it
      brands.push({
        slug: entityDomain.replace(/\./g, '-'),
        name: entity.name,
        domain: entityDomain,
        url: entity.url,
        nip: entity.nip,
        krs: entity.krs,
        data: entity.data,
        financials: entity.financials,
        lastScanId: scan.id,
        lastScannedAt: scan.completedAt || new Date().toISOString(),
      });
      updated++;
      continue;
    }

    // Merge enriched data into existing brand
    if (entity.nip) brand.nip = entity.nip;
    if (entity.krs) brand.krs = entity.krs;
    if (entity.domain) brand.domain = entity.domain;

    // Merge entity.data into brand.data — only overwrite if new data is non-empty.
    // Prevents partial scans from wiping out data from previous scans.
    const existingData = (brand.data || {}) as Record<string, unknown>;
    const newData = (entity.data || {}) as Record<string, unknown>;
    const merged = { ...existingData };
    for (const [key, value] of Object.entries(newData)) {
      // Skip empty objects/arrays that would overwrite richer existing data
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const isEmpty = Object.keys(obj).length === 0
          || (Object.keys(obj).length === 1 && obj.skipped);
        if (isEmpty && existingData[key] && typeof existingData[key] === 'object') {
          continue; // Keep existing richer data
        }
      }
      if (Array.isArray(value) && value.length === 0 && Array.isArray(existingData[key]) && (existingData[key] as unknown[]).length > 0) {
        continue; // Keep existing non-empty array
      }
      merged[key] = value;
    }
    brand.data = merged;

    if (entity.financials) brand.financials = entity.financials;
    brand.lastScanId = scan.id;
    brand.lastScannedAt = scan.completedAt || new Date().toISOString();

    updated++;
  }

  saveBrands(brands);
  return updated;
}
