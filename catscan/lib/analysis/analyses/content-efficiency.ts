/**
 * Analysis 3: Content-to-Engagement Efficiency Matrix
 *
 * Cross-references: posting frequency × content type × platform × engagement rate
 * Target audience: Marketing teams
 */

import type { BrandRow, ContentEfficiencyResult } from '../types';
import { db } from '@/lib/db/sqlite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2));
}

function freqBucket(freq: number): string {
  if (freq < 1) return '<1/week';
  if (freq < 3) return '1-3/week';
  if (freq < 5) return '3-5/week';
  if (freq < 7) return '5-7/week';
  return '7+/week';
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export function analyzeContentEfficiency(brands: BrandRow[]): ContentEfficiencyResult {
  // --- 1. Platform benchmarks ---
  const platformBenchmarks = [];

  // Instagram
  const igBrands = brands.filter(b => b.igEngagementRate != null);
  platformBenchmarks.push({
    platform: 'instagram',
    avgEngagementRate: avg(igBrands.map(b => b.igEngagementRate!)),
    medianEngagementRate: median(igBrands.map(b => b.igEngagementRate!)),
    avgPostingFreq: avg(igBrands.filter(b => b.igPostingFreqPerWeek != null).map(b => b.igPostingFreqPerWeek!)),
    brandCount: igBrands.length,
  });

  // TikTok
  const ttBrands = brands.filter(b => b.ttEngagementRate != null);
  platformBenchmarks.push({
    platform: 'tiktok',
    avgEngagementRate: avg(ttBrands.map(b => b.ttEngagementRate!)),
    medianEngagementRate: median(ttBrands.map(b => b.ttEngagementRate!)),
    avgPostingFreq: avg(ttBrands.filter(b => b.ttPostingFreqPerWeek != null).map(b => b.ttPostingFreqPerWeek!)),
    brandCount: ttBrands.length,
  });

  // --- 2. Content type performance from social_posts table ---
  const contentTypePerformance = [];
  try {
    // Instagram: group by type approximation from caption/post metadata
    const igPosts = db.prepare(`
      SELECT sp.slug, sp.likes, sp.comments, sp.caption, sp.hashtags, sp.views
      FROM social_posts sp
      WHERE sp.platform = 'instagram' AND sp.likes IS NOT NULL
    `).all() as Array<Record<string, unknown>>;

    // We don't have explicit type in social_posts, so aggregate all IG
    if (igPosts.length > 0) {
      contentTypePerformance.push({
        platform: 'instagram',
        contentType: 'all',
        avgLikes: Math.round(igPosts.reduce((s, p) => s + ((p.likes as number) || 0), 0) / igPosts.length),
        avgComments: Math.round(igPosts.reduce((s, p) => s + ((p.comments as number) || 0), 0) / igPosts.length),
        postCount: igPosts.length,
        brandCount: new Set(igPosts.map(p => p.slug)).size,
      });
    }

    // TikTok
    const ttPosts = db.prepare(`
      SELECT sp.slug, sp.likes, sp.comments, sp.views
      FROM social_posts sp
      WHERE sp.platform = 'tiktok' AND sp.likes IS NOT NULL
    `).all() as Array<Record<string, unknown>>;

    if (ttPosts.length > 0) {
      contentTypePerformance.push({
        platform: 'tiktok',
        contentType: 'video',
        avgLikes: Math.round(ttPosts.reduce((s, p) => s + ((p.likes as number) || 0), 0) / ttPosts.length),
        avgComments: Math.round(ttPosts.reduce((s, p) => s + ((p.comments as number) || 0), 0) / ttPosts.length),
        postCount: ttPosts.length,
        brandCount: new Set(ttPosts.map(p => p.slug)).size,
      });
    }
  } catch {
    // DB might not have social_posts populated
  }

  // --- 3. Hashtag effectiveness (cross-brand) ---
  const hashtagEffectiveness: ContentEfficiencyResult['data']['hashtagEffectiveness'] = [];
  try {
    const hashtagPosts = db.prepare(`
      SELECT sp.slug, sp.hashtags, sp.likes, sp.comments
      FROM social_posts sp
      WHERE sp.platform = 'instagram' AND sp.hashtags IS NOT NULL AND sp.likes IS NOT NULL
    `).all() as Array<Record<string, unknown>>;

    const tagStats = new Map<string, { totalLikes: number; totalEng: number; posts: number; brands: Set<string> }>();

    for (const post of hashtagPosts) {
      let tags: string[] = [];
      try { tags = JSON.parse(post.hashtags as string); } catch { continue; }
      const likes = (post.likes as number) || 0;
      const comments = (post.comments as number) || 0;

      for (const tag of tags) {
        const t = tag.toLowerCase();
        if (!tagStats.has(t)) tagStats.set(t, { totalLikes: 0, totalEng: 0, posts: 0, brands: new Set() });
        const s = tagStats.get(t)!;
        s.totalLikes += likes;
        s.totalEng += likes + comments;
        s.posts++;
        s.brands.add(post.slug as string);
      }
    }

    // Filter: used by >=3 brands, >=5 posts
    const filtered = Array.from(tagStats.entries())
      .filter(([, s]) => s.brands.size >= 3 && s.posts >= 5)
      .map(([tag, s]) => ({
        hashtag: tag,
        avgLikes: Math.round(s.totalLikes / s.posts),
        avgEngagement: Math.round(s.totalEng / s.posts),
        usedByBrands: s.brands.size,
        totalPosts: s.posts,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 30);

    hashtagEffectiveness.push(...filtered);
  } catch {
    // DB access error
  }

  // --- 4. Optimal posting frequency ---
  const optimalFrequency: ContentEfficiencyResult['data']['optimalFrequency'] = [];

  // Instagram frequency buckets
  const igFreqBuckets = new Map<string, number[]>();
  for (const b of brands) {
    if (b.igPostingFreqPerWeek != null && b.igEngagementRate != null) {
      const bucket = freqBucket(b.igPostingFreqPerWeek);
      if (!igFreqBuckets.has(bucket)) igFreqBuckets.set(bucket, []);
      igFreqBuckets.get(bucket)!.push(b.igEngagementRate);
    }
  }
  for (const [bucket, rates] of Array.from(igFreqBuckets.entries())) {
    optimalFrequency.push({
      platform: 'instagram',
      frequencyBucket: bucket,
      avgEngagementRate: avg(rates) ?? 0,
      brandCount: rates.length,
    });
  }

  // TikTok frequency buckets
  const ttFreqBuckets = new Map<string, number[]>();
  for (const b of brands) {
    if (b.ttPostingFreqPerWeek != null && b.ttEngagementRate != null) {
      const bucket = freqBucket(b.ttPostingFreqPerWeek);
      if (!ttFreqBuckets.has(bucket)) ttFreqBuckets.set(bucket, []);
      ttFreqBuckets.get(bucket)!.push(b.ttEngagementRate);
    }
  }
  for (const [bucket, rates] of Array.from(ttFreqBuckets.entries())) {
    optimalFrequency.push({
      platform: 'tiktok',
      frequencyBucket: bucket,
      avgEngagementRate: avg(rates) ?? 0,
      brandCount: rates.length,
    });
  }

  // --- 5. Top performers ---
  const topPerformers: ContentEfficiencyResult['data']['topPerformers'] = [];

  // IG top 10 by engagement
  const igSorted = [...igBrands].sort((a, b) => (b.igEngagementRate ?? 0) - (a.igEngagementRate ?? 0)).slice(0, 10);
  for (const b of igSorted) {
    const mix = b.igContentMix;
    let dominant: string | null = null;
    if (mix) {
      const entries = Object.entries(mix);
      if (entries.length > 0) dominant = entries.sort((a, b) => b[1] - a[1])[0][0];
    }
    topPerformers.push({
      slug: b.slug,
      name: b.name,
      platform: 'instagram',
      engagementRate: b.igEngagementRate!,
      postingFreq: b.igPostingFreqPerWeek,
      dominantContentType: dominant,
    });
  }

  // TT top 10 by engagement
  const ttSorted = [...ttBrands].sort((a, b) => (b.ttEngagementRate ?? 0) - (a.ttEngagementRate ?? 0)).slice(0, 10);
  for (const b of ttSorted) {
    topPerformers.push({
      slug: b.slug,
      name: b.name,
      platform: 'tiktok',
      engagementRate: b.ttEngagementRate!,
      postingFreq: b.ttPostingFreqPerWeek,
      dominantContentType: 'video',
    });
  }

  // --- 6. Niche benchmarks ---
  const nicheMap = new Map<string, BrandRow[]>();
  for (const b of brands) {
    const niche = b.nicheFocus || b.scorecardSegment || 'general';
    if (!nicheMap.has(niche)) nicheMap.set(niche, []);
    nicheMap.get(niche)!.push(b);
  }

  const nicheBenchmarks = Array.from(nicheMap.entries())
    .filter(([, bs]) => bs.length >= 3)
    .map(([niche, bs]) => ({
      niche,
      avgIgEngagement: avg(bs.filter(b => b.igEngagementRate != null).map(b => b.igEngagementRate!)),
      avgTtEngagement: avg(bs.filter(b => b.ttEngagementRate != null).map(b => b.ttEngagementRate!)),
      avgPostingFreq: avg(bs.filter(b => b.igPostingFreqPerWeek != null).map(b => b.igPostingFreqPerWeek!)),
      brandCount: bs.length,
    }))
    .sort((a, b) => b.brandCount - a.brandCount);

  return {
    id: 'content-efficiency',
    name: 'Content-to-Engagement Efficiency Matrix',
    description: 'Cross-analiza typu contentu, częstotliwości publikacji i engagement rate na IG i TikTok. Benchmarki per platforma, nisha, i hashtag.',
    generatedAt: new Date().toISOString(),
    brandCount: brands.length,
    data: {
      platformBenchmarks,
      contentTypePerformance,
      hashtagEffectiveness,
      optimalFrequency,
      topPerformers,
      nicheBenchmarks,
    },
  };
}
