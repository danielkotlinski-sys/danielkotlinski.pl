/**
 * One-time migration: import brands.json + scans.json → catscan.db
 *
 * Run: npx tsx scripts/migrate-json-to-sqlite.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { db, stmts } from '../lib/db/sqlite';

const DATA_DIR = join(process.cwd(), 'data');

function migrate() {
  console.log('=== CATSCAN JSON → SQLite migration ===\n');

  // 1. Import brands
  const brandsPath = join(DATA_DIR, 'brands.json');
  if (existsSync(brandsPath)) {
    const brands = JSON.parse(readFileSync(brandsPath, 'utf-8')) as Array<Record<string, unknown>>;
    console.log(`Importing ${brands.length} brands...`);

    const insertBrands = db.transaction(() => {
      for (const b of brands) {
        stmts.upsertBrand.run({
          slug: b.slug || '',
          name: b.name || '',
          domain: b.domain || null,
          url: b.url || '',
          dietlySlug: b.dietlySlug || null,
          dietlyUrl: b.dietlyUrl || null,
          source: b.source || null,
          nip: b.nip || null,
          krs: b.krs || null,
          seededAt: b.seededAt || null,
          lastScanId: b.lastScanId || null,
          lastScannedAt: b.lastScannedAt || null,
        });

        // If brand has scan data, import into scan_results
        const data = (b.data || {}) as Record<string, unknown>;
        const phases = Object.keys(data).filter(k => !k.startsWith('_'));
        if (phases.length > 0) {
          stmts.upsertScanResult.run({
            slug: b.slug as string,
            data: JSON.stringify(data),
            phaseCount: phases.length,
            phases: JSON.stringify(phases),
          });

          // Normalize financial years
          const finance = data.finance as Record<string, unknown> | undefined;
          if (finance && Array.isArray(finance.financial_statements)) {
            for (const stmt of finance.financial_statements as Array<Record<string, unknown>>) {
              const ratios = (stmt.ratios || {}) as Record<string, unknown>;
              stmts.upsertFinancialYear.run({
                slug: b.slug as string,
                yearStart: stmt.periodStart || null,
                yearEnd: stmt.periodEnd || null,
                revenue: stmt.revenue ?? null,
                netIncome: stmt.netIncome ?? null,
                operatingProfit: stmt.operatingProfit ?? null,
                grossProfit: stmt.grossProfit ?? null,
                totalAssets: stmt.totalAssets ?? null,
                equity: stmt.equity ?? null,
                totalLiabilities: stmt.totalLiabilities ?? null,
                cash: stmt.cash ?? null,
                wages: stmt.wages ?? null,
                depreciation: stmt.depreciation ?? null,
                netMargin: ratios.netMargin ?? null,
                roe: ratios.roe ?? null,
                roa: ratios.roa ?? null,
                revenueSource: (finance.revenue_source as string) || 'krs',
                rawData: JSON.stringify(stmt),
              });
            }
          }

          // Normalize social posts
          const social = data.social as Record<string, unknown> | undefined;
          if (social) {
            // Instagram
            const ig = social.instagram as Record<string, unknown> | undefined;
            if (ig?.content) {
              const content = ig.content as Record<string, unknown>;
              const posts = (content.posts || []) as Array<Record<string, unknown>>;
              for (const post of posts) {
                stmts.upsertSocialPost.run({
                  slug: b.slug as string,
                  platform: 'instagram',
                  postId: post.id || post.url || `ig_${Math.random().toString(36).slice(2)}`,
                  url: post.url || null,
                  caption: post.caption || null,
                  hashtags: JSON.stringify(post.hashtags || []),
                  timestamp: post.timestamp || null,
                  likes: post.likes ?? null,
                  comments: post.comments ?? null,
                  views: null,
                  shares: null,
                  sampleBucket: post.sampleBucket || null,
                });
              }
            }

            // TikTok
            const tt = social.tiktok as Record<string, unknown> | undefined;
            if (tt?.content) {
              const content = tt.content as Record<string, unknown>;
              const posts = (content.posts || []) as Array<Record<string, unknown>>;
              for (const post of posts) {
                stmts.upsertSocialPost.run({
                  slug: b.slug as string,
                  platform: 'tiktok',
                  postId: post.id || post.url || `tt_${Math.random().toString(36).slice(2)}`,
                  url: post.url || null,
                  caption: post.caption || null,
                  hashtags: JSON.stringify(post.hashtags || []),
                  timestamp: post.timestamp || null,
                  likes: post.likes ?? null,
                  comments: post.comments ?? null,
                  views: post.views ?? null,
                  shares: post.shares ?? null,
                  sampleBucket: post.sampleBucket || null,
                });
              }
            }
          }
        }
      }
    });

    insertBrands();
    const brandCount = (stmts.countBrands.get() as Record<string, number>).count;
    const scanResultCount = (db.prepare('SELECT COUNT(*) as count FROM scan_results').get() as Record<string, number>).count;
    const fyCount = (db.prepare('SELECT COUNT(*) as count FROM financial_years').get() as Record<string, number>).count;
    const spCount = (db.prepare('SELECT COUNT(*) as count FROM social_posts').get() as Record<string, number>).count;
    console.log(`  ✓ brands: ${brandCount}`);
    console.log(`  ✓ scan_results: ${scanResultCount}`);
    console.log(`  ✓ financial_years: ${fyCount}`);
    console.log(`  ✓ social_posts: ${spCount}`);
  }

  // 2. Import scans (audit log)
  const scansPath = join(DATA_DIR, 'scans.json');
  if (existsSync(scansPath)) {
    const scans = JSON.parse(readFileSync(scansPath, 'utf-8')) as Array<Record<string, unknown>>;
    console.log(`\nImporting ${scans.length} scan records...`);

    const insertScans = db.transaction(() => {
      for (const s of scans) {
        stmts.upsertScan.run({
          id: s.id || '',
          status: s.status || 'completed',
          entities: JSON.stringify(s.entities || []),
          phasesCompleted: JSON.stringify(s.phasesCompleted || []),
          currentPhase: s.currentPhase || null,
          log: JSON.stringify(s.log || []),
          totalCostUsd: s.totalCostUsd || 0,
          interpretation: s.interpretation ? JSON.stringify(s.interpretation) : null,
          createdAt: s.createdAt || new Date().toISOString(),
          completedAt: s.completedAt || null,
        });
      }
    });

    insertScans();
    const scanCount = (db.prepare('SELECT COUNT(*) as count FROM scans').get() as Record<string, number>).count;
    console.log(`  ✓ scans: ${scanCount}`);
  }

  console.log('\n=== Migration complete ===');
  console.log(`Database: ${join(DATA_DIR, 'catscan.db')}`);

  // Summary queries
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM brands) as brands,
      (SELECT COUNT(*) FROM scan_results) as scanned,
      (SELECT COUNT(*) FROM financial_years) as fin_years,
      (SELECT COUNT(*) FROM social_posts) as posts,
      (SELECT COUNT(*) FROM scans) as scan_logs
  `).get() as Record<string, number>;

  console.log(`\nSummary:`);
  console.log(`  Brands: ${stats.brands} (${stats.scanned} with scan data)`);
  console.log(`  Financial year records: ${stats.fin_years}`);
  console.log(`  Social posts: ${stats.posts}`);
  console.log(`  Scan log entries: ${stats.scan_logs}`);
}

migrate();
