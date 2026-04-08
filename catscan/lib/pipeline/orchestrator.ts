/**
 * Pipeline orchestrator — runs entities through configured phases sequentially.
 * Each phase is a module in ./phases/ with a common interface.
 */

import type { SectorConfig, BatchConfig, Entity, PhaseResult, PhaseName } from './types';

type PhaseRunner = (entities: Entity[], config: SectorConfig) => Promise<PhaseResult>;

const phaseRegistry: Partial<Record<PhaseName, PhaseRunner>> = {};

export function registerPhase(name: PhaseName, runner: PhaseRunner) {
  phaseRegistry[name] = runner;
}

export async function runPipeline(
  entities: Entity[],
  sectorConfig: SectorConfig,
  batchConfig: BatchConfig,
): Promise<PhaseResult[]> {
  const results: PhaseResult[] = [];

  for (const phaseName of batchConfig.phases) {
    const runner = phaseRegistry[phaseName];
    if (!runner) {
      throw new Error(`Phase "${phaseName}" not registered`);
    }

    const result = await runner(entities, sectorConfig);
    results.push(result);

    console.log(
      `[${phaseName}] ${result.entitiesSucceeded}/${result.entitiesProcessed} OK, $${result.costUsd.toFixed(2)}, ${(result.durationMs / 1000).toFixed(1)}s`
    );
  }

  return results;
}
