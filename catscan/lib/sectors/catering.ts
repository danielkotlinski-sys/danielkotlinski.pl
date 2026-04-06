/**
 * Sector config: Polish diet catering industry
 * Seed: Dietly.pl (~500 brands)
 */

import type { SectorConfig } from '../pipeline/types';

export const sectorConfig: SectorConfig = {
  id: 'catering-pl',
  name: 'Catering dietetyczny — Polska',

  seedSource: {
    url: 'https://dietly.pl/catering',
    type: 'catalog',
  },

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

  extractionPrompts: {
    pricing: `Extract all pricing information: diet types, calorie options, price per day/week/month,
trial offers, subscription discounts. Return structured JSON.`,

    positioning: `Analyze brand positioning: who is the target customer (athletes, office workers,
weight loss, families)? What is the key differentiator? What emotional register
does the copy use (premium, friendly, clinical, motivational)?`,

    delivery: `Extract delivery model: own fleet vs courier, delivery area (cities),
delivery times, weekend delivery availability, packaging type.`,

    menu: `Extract menu information: number of diet types, calorie ranges,
cuisine styles (Polish, Mediterranean, Asian), dietary restrictions supported
(vegan, keto, gluten-free, low-IG).`,

    technology: `Identify technology stack and digital capabilities: online ordering,
mobile app, meal customization, subscription management, payment methods.`,

    social_proof: `Extract trust signals: client testimonials, celebrity endorsements,
certifications, dietitian credentials, media mentions.`,
  },
};
