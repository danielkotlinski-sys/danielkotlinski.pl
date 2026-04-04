/** Phase 1: Seed — crawl catalog source, extract initial entity list */

import type { Entity, SectorConfig, PhaseResult } from '../types';

export async function run(entities: Entity[], config: SectorConfig): Promise<PhaseResult> {
  const start = Date.now();
  // TODO: Apify crawl of config.seedSource.url
  // Parse catalog → list of {name, url, city, price}
  return {
    phase: 'seed',
    entitiesProcessed: 0,
    entitiesSucceeded: 0,
    entitiesFailed: 0,
    costUsd: 0,
    durationMs: Date.now() - start,
    errors: [],
  };
}
