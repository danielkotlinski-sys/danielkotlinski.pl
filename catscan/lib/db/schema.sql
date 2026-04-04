-- CATSCAN database schema (Supabase Postgres)

-- Sectors (industry configurations)
CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entities (brands/companies)
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id TEXT NOT NULL REFERENCES sectors(id),
  name TEXT NOT NULL,
  domain TEXT,
  nip TEXT,
  krs TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  sources JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_sector ON entities(sector_id);
CREATE INDEX idx_entities_nip ON entities(nip) WHERE nip IS NOT NULL;
CREATE INDEX idx_entities_krs ON entities(krs) WHERE krs IS NOT NULL;
CREATE INDEX idx_entities_data ON entities USING GIN(data);

-- Scans (pipeline execution history)
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id TEXT NOT NULL REFERENCES sectors(id),
  batch_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  phases_completed TEXT[] NOT NULL DEFAULT '{}',
  entity_count INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Snapshots (point-in-time entity data for change tracking)
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  scan_id UUID NOT NULL REFERENCES scans(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_entity ON snapshots(entity_id);
CREATE INDEX idx_snapshots_scan ON snapshots(scan_id);
