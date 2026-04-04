/** Phase 3: Crawl — scrape entity websites, capture HTML + screenshots */

import type { Entity, SectorConfig, PhaseResult } from '../types';

export async function run(entities: Entity[], config: SectorConfig): Promise<PhaseResult> {
  const start = Date.now();
  // TODO: Apify web scraper → HTML + screenshots → R2 storage
  return {
    phase: 'crawl',
    entitiesProcessed: entities.length,
    entitiesSucceeded: 0,
    entitiesFailed: 0,
    costUsd: 0,
    durationMs: Date.now() - start,
    errors: [],
  };
}
