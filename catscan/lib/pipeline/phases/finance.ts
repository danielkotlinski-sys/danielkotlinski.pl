/** Phase 8: Finance — KRS registry data + financial statements via rejestr.io */

import type { Entity, SectorConfig, PhaseResult } from '../types';

export async function run(entities: Entity[], config: SectorConfig): Promise<PhaseResult> {
  const start = Date.now();
  // TODO:
  // 1. rejestr.io searchOrganization(nip) → KRS number
  // 2. rejestr.io getOrganizationAdvanced(krs) → board, shareholders, PKD
  // 3. rejestr.io listFinancialDocuments(krs) → available years
  // 4. rejestr.io getFinancialDocument(krs, docId) × 3 years → financials
  // Cost: ~1.65 PLN per entity with 3 years of data
  return {
    phase: 'finance',
    entitiesProcessed: entities.length,
    entitiesSucceeded: 0,
    entitiesFailed: 0,
    costUsd: 0,
    durationMs: Date.now() - start,
    errors: [],
  };
}
