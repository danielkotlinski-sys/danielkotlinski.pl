/**
 * Sector config template.
 * Copy this file and fill in for a new industry.
 */

import type { SectorConfig } from '../pipeline/types';

export const sectorConfig: SectorConfig = {
  id: 'template',
  name: 'Template Sector',

  seedSource: {
    url: 'https://example.com/catalog',
    type: 'catalog',
  },

  // Which pipeline phases to run (order matters)
  phases: [
    'seed',
    'discovery',
    'crawl',
    'extract',
    'social',
    'ads',
    'reviews',
    'finance',
    'scorecard',
  ],

  // LLM extraction prompts per dimension
  extractionPrompts: {
    pricing: 'Extract pricing tiers, plans, and price points from this page.',
    positioning: 'Identify the brand positioning: target audience, key claims, tone of voice.',
    // Add more per your sector schema...
  },
};
