/** Pipeline configuration and shared types */

export interface SectorConfig {
  id: string;
  name: string;
  seedSource: {
    url: string;
    type: 'catalog' | 'directory' | 'search';
  };
  phases: PhaseName[];
  extractionPrompts: Record<string, string>;
}

export type PhaseName =
  | 'seed'
  | 'discovery'
  | 'crawl'
  | 'extract'
  | 'social'
  | 'ads'
  | 'reviews'
  | 'finance'
  | 'youtube_reviews'
  | 'influencer_press'
  | 'influencer_ig'
  | 'interpret';

export interface PhaseResult {
  phase: PhaseName;
  entitiesProcessed: number;
  entitiesSucceeded: number;
  entitiesFailed: number;
  costUsd: number;
  durationMs: number;
  errors: Array<{ entityId: string; error: string }>;
}

export interface Entity {
  id: string;
  name: string;
  domain?: string;
  nip?: string;
  krs?: string;
  data: Record<string, unknown>;
  sources: Record<string, string>;
  updatedAt: string;
}

export interface BatchConfig {
  batchSize: number;
  sectorId: string;
  phases: PhaseName[];
}
