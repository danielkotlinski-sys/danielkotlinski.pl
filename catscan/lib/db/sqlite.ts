/**
 * SQLite database — single source of truth for CATSCAN.
 *
 * Tables:
 *   brands          — 239 brand master records (seed + enriched data)
 *   scan_results    — full scan output per brand (1 row = 1 brand, JSON data column)
 *   financial_years — normalized financials (brand × year)
 *   social_posts    — IG/TT posts (brand × post)
 *   scans           — scan execution log (audit trail)
 *
 * Usage: import { db } from '@/lib/db/sqlite';
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'catscan.db');

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ── Schema ──

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    slug            TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    domain          TEXT,
    url             TEXT,
    dietly_slug     TEXT,
    dietly_url      TEXT,
    source          TEXT,
    nip             TEXT,
    krs             TEXT,
    last_scan_id    TEXT,
    last_scanned_at TEXT,
    seeded_at       TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain);
  CREATE INDEX IF NOT EXISTS idx_brands_nip ON brands(nip);

  CREATE TABLE IF NOT EXISTS scan_results (
    slug            TEXT PRIMARY KEY REFERENCES brands(slug),
    data            TEXT NOT NULL DEFAULT '{}',   -- full JSON blob (all 21 dimensions)
    phase_count     INTEGER DEFAULT 0,
    phases          TEXT DEFAULT '[]',            -- JSON array of completed phase names
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financial_years (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL REFERENCES brands(slug),
    year_start      TEXT,
    year_end        TEXT,
    revenue         REAL,
    net_income      REAL,
    operating_profit REAL,
    gross_profit    REAL,
    total_assets    REAL,
    equity          REAL,
    total_liabilities REAL,
    cash            REAL,
    wages           REAL,
    depreciation    REAL,
    net_margin      REAL,
    roe             REAL,
    roa             REAL,
    revenue_source  TEXT,    -- 'krs' | 'perplexity-estimate'
    raw_data        TEXT,    -- full JSON of this year's statement
    UNIQUE(slug, year_end)
  );

  CREATE INDEX IF NOT EXISTS idx_fy_slug ON financial_years(slug);

  CREATE TABLE IF NOT EXISTS social_posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL REFERENCES brands(slug),
    platform        TEXT NOT NULL,  -- 'instagram' | 'tiktok'
    post_id         TEXT,
    url             TEXT,
    caption         TEXT,
    hashtags        TEXT,           -- JSON array
    timestamp       TEXT,
    likes           INTEGER,
    comments        INTEGER,
    views           INTEGER,
    shares          INTEGER,
    sample_bucket   TEXT,           -- 'recent' | 'historical'
    UNIQUE(slug, platform, post_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sp_slug ON social_posts(slug);
  CREATE INDEX IF NOT EXISTS idx_sp_platform ON social_posts(slug, platform);

  CREATE TABLE IF NOT EXISTS scans (
    id              TEXT PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'pending',
    entities        TEXT NOT NULL DEFAULT '[]',     -- JSON array of EntityRecord
    phases_completed TEXT NOT NULL DEFAULT '[]',
    current_phase   TEXT,
    log             TEXT NOT NULL DEFAULT '[]',
    total_cost_usd  REAL DEFAULT 0,
    interpretation  TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    completed_at    TEXT
  );
`);

// ── Prepared statements ──

const stmts = {
  // Brands
  upsertBrand: db.prepare(`
    INSERT INTO brands (slug, name, domain, url, dietly_slug, dietly_url, source, nip, krs, seeded_at, updated_at)
    VALUES (@slug, @name, @domain, @url, @dietlySlug, @dietlyUrl, @source, @nip, @krs, @seededAt, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      name = COALESCE(@name, brands.name),
      domain = COALESCE(@domain, brands.domain),
      url = COALESCE(@url, brands.url),
      nip = COALESCE(@nip, brands.nip),
      krs = COALESCE(@krs, brands.krs),
      dietly_slug = COALESCE(@dietlySlug, brands.dietly_slug),
      last_scan_id = COALESCE(@lastScanId, brands.last_scan_id),
      last_scanned_at = COALESCE(@lastScannedAt, brands.last_scanned_at),
      updated_at = datetime('now')
  `),

  getBrand: db.prepare(`SELECT * FROM brands WHERE slug = ?`),
  getBrandByDomain: db.prepare(`SELECT * FROM brands WHERE domain = ? OR domain = 'www.' || ?`),
  getBrandByName: db.prepare(`SELECT * FROM brands WHERE lower(name) = lower(?)`),
  getAllBrands: db.prepare(`SELECT * FROM brands ORDER BY name`),
  countBrands: db.prepare(`SELECT COUNT(*) as count FROM brands`),

  // Scan results
  upsertScanResult: db.prepare(`
    INSERT INTO scan_results (slug, data, phase_count, phases, updated_at)
    VALUES (@slug, @data, @phaseCount, @phases, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      data = @data,
      phase_count = @phaseCount,
      phases = @phases,
      updated_at = datetime('now')
  `),

  getScanResult: db.prepare(`SELECT * FROM scan_results WHERE slug = ?`),
  getAllScanResults: db.prepare(`SELECT * FROM scan_results ORDER BY updated_at DESC`),
  getScannedBrands: db.prepare(`
    SELECT b.*, sr.data, sr.phase_count, sr.phases, sr.updated_at as scan_updated_at
    FROM brands b
    JOIN scan_results sr ON b.slug = sr.slug
    ORDER BY sr.updated_at DESC
  `),

  // Financial years
  upsertFinancialYear: db.prepare(`
    INSERT INTO financial_years (slug, year_start, year_end, revenue, net_income, operating_profit, gross_profit,
      total_assets, equity, total_liabilities, cash, wages, depreciation, net_margin, roe, roa, revenue_source, raw_data)
    VALUES (@slug, @yearStart, @yearEnd, @revenue, @netIncome, @operatingProfit, @grossProfit,
      @totalAssets, @equity, @totalLiabilities, @cash, @wages, @depreciation, @netMargin, @roe, @roa, @revenueSource, @rawData)
    ON CONFLICT(slug, year_end) DO UPDATE SET
      revenue = @revenue, net_income = @netIncome, operating_profit = @operatingProfit, gross_profit = @grossProfit,
      total_assets = @totalAssets, equity = @equity, total_liabilities = @totalLiabilities, cash = @cash,
      wages = @wages, depreciation = @depreciation, net_margin = @netMargin, roe = @roe, roa = @roa,
      revenue_source = @revenueSource, raw_data = @rawData
  `),

  getFinancialYears: db.prepare(`SELECT * FROM financial_years WHERE slug = ? ORDER BY year_end DESC`),

  // Social posts
  upsertSocialPost: db.prepare(`
    INSERT INTO social_posts (slug, platform, post_id, url, caption, hashtags, timestamp, likes, comments, views, shares, sample_bucket)
    VALUES (@slug, @platform, @postId, @url, @caption, @hashtags, @timestamp, @likes, @comments, @views, @shares, @sampleBucket)
    ON CONFLICT(slug, platform, post_id) DO UPDATE SET
      caption = @caption, likes = @likes, comments = @comments, views = @views, shares = @shares
  `),

  getSocialPosts: db.prepare(`SELECT * FROM social_posts WHERE slug = ? ORDER BY platform, timestamp DESC`),
  getSocialPostsByPlatform: db.prepare(`SELECT * FROM social_posts WHERE slug = ? AND platform = ? ORDER BY timestamp DESC`),

  // Scans (audit log)
  upsertScan: db.prepare(`
    INSERT INTO scans (id, status, entities, phases_completed, current_phase, log, total_cost_usd, interpretation, created_at, completed_at)
    VALUES (@id, @status, @entities, @phasesCompleted, @currentPhase, @log, @totalCostUsd, @interpretation, @createdAt, @completedAt)
    ON CONFLICT(id) DO UPDATE SET
      status = @status, entities = @entities, phases_completed = @phasesCompleted,
      current_phase = @currentPhase, log = @log, total_cost_usd = @totalCostUsd,
      interpretation = @interpretation, completed_at = @completedAt
  `),

  getScan: db.prepare(`SELECT * FROM scans WHERE id = ?`),
  getAllScans: db.prepare(`SELECT * FROM scans ORDER BY created_at DESC`),
  getActiveScan: db.prepare(`SELECT * FROM scans WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`),
};

export { db, stmts, DB_PATH };
