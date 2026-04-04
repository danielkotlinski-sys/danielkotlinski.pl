/** Phase 2: Discovery — resolve NIP, KRS, domain for each entity */

import type { Entity, SectorConfig, PhaseResult } from '../types';

export async function run(entities: Entity[], config: SectorConfig): Promise<PhaseResult> {
  const start = Date.now();
  // TODO: Perplexity batch for NIP/KRS discovery
  // TODO: Domain verification via DNS/whois
  return {
    phase: 'discovery',
    entitiesProcessed: entities.length,
    entitiesSucceeded: 0,
    entitiesFailed: 0,
    costUsd: 0,
    durationMs: Date.now() - start,
    errors: [],
  };
}
