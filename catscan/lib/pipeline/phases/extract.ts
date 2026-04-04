/** Phase 4: Extract — LLM structured extraction from crawled HTML */

import type { Entity, SectorConfig, PhaseResult } from '../types';

export async function run(entities: Entity[], config: SectorConfig): Promise<PhaseResult> {
  const start = Date.now();
  // TODO: For each entity, send HTML to Claude Haiku with sector extraction prompts
  // Parse JSON responses into entity.data dimensions
  return {
    phase: 'extract',
    entitiesProcessed: entities.length,
    entitiesSucceeded: 0,
    entitiesFailed: 0,
    costUsd: 0,
    durationMs: Date.now() - start,
    errors: [],
  };
}
