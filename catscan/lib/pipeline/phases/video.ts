/**
 * Phase: Video — download IG Reels + TikTok videos, analyze via Gemini Flash,
 * aggregate per brand via Claude Sonnet.
 *
 * Pipeline position: after social (needs post URLs), before ads.
 *
 * Flow per entity:
 *   1. Read social.instagram.content.posts + social.tiktok.content.posts
 *   2. Select up to 30 videos (15 IG + 15 TT), stratified:
 *      - 5 newest, 5 top-performing, 5 random from last 6 months
 *   3. Download each via yt-dlp → /tmp/
 *   4. Upload to Gemini File API (free, 48h TTL)
 *   5. Gemini Flash per video → structured JSON (hook, format, production, etc.)
 *   6. Claude Sonnet aggregation → brand video strategy summary
 *   7. Cleanup /tmp/ files
 *
 * Requires: GEMINI_API_KEY, ANTHROPIC_API_KEY
 * External: yt-dlp (pip install yt-dlp)
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { EntityRecord } from '@/lib/db/store';

const TMP_DIR = '/tmp/catscan-video';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoSource {
  platform: 'instagram' | 'tiktok';
  url: string;
  postId: string;
  likes: number;
  views?: number;
  comments: number;
  caption: string | null;
  timestamp: string;
  sampleBucket: 'recent' | 'top' | 'random';
}

interface VideoAnalysis {
  source: VideoSource;
  gemini: {
    hook_type: string;
    hook_text: string;
    production_quality: string;
    format: string;
    faces_visible: boolean;
    brand_visible: boolean;
    food_visible: boolean;
    text_overlays: string[];
    music_style: string;
    cta: string;
    duration_seconds: number;
    pacing: string;
    emotional_register: string;
    summary: string;
  } | null;
  error?: string;
  localPath?: string;
  geminiFileUri?: string;
}

interface VideoAggregation {
  dominant_format: string;
  production_level: string;
  hook_patterns: string[];
  content_themes: string[];
  uses_trending_audio: boolean;
  has_consistent_style: boolean;
  video_quality_score: number;
  content_strategy: string;
  standout_element: string;
  platform_comparison: string;
  recommendations: string[];
}

interface VideoData {
  analyzed_count: number;
  failed_count: number;
  platforms: string[];
  videos: Array<{
    platform: string;
    url: string;
    postId: string;
    likes: number;
    views?: number;
    caption: string | null;
    timestamp: string;
    sampleBucket: string;
    analysis: VideoAnalysis['gemini'];
  }>;
  aggregation: VideoAggregation | null;
  cost_usd: number;
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Video selection — stratified sampling from social phase data
// ---------------------------------------------------------------------------

function selectVideos(entity: EntityRecord): VideoSource[] {
  const social = (entity.data as Record<string, unknown>).social as Record<string, unknown> | undefined;
  if (!social) return [];

  const videos: VideoSource[] = [];

  // Instagram reels/videos
  const ig = social.instagram as Record<string, unknown> | undefined;
  const igContent = ig?.content as Record<string, unknown> | undefined;
  const igPosts = (igContent?.posts as Array<Record<string, unknown>>) || [];

  const igVideos = igPosts
    .filter(p => p.type === 'Video' || p.type === 'Sidecar')
    .map(p => ({
      platform: 'instagram' as const,
      url: p.url as string,
      postId: p.id as string,
      likes: (p.likes as number) || 0,
      comments: (p.comments as number) || 0,
      caption: p.caption as string | null,
      timestamp: p.timestamp as string,
      sampleBucket: 'recent' as const,
    }));

  // TikTok videos (all are video)
  const tt = social.tiktok as Record<string, unknown> | undefined;
  const ttContent = tt?.content as Record<string, unknown> | undefined;
  const ttPosts = (ttContent?.posts as Array<Record<string, unknown>>) || [];

  const ttVideos = ttPosts.map(p => ({
    platform: 'tiktok' as const,
    url: p.url as string,
    postId: p.id as string,
    likes: (p.likes as number) || 0,
    views: (p.views as number) || undefined,
    comments: (p.comments as number) || 0,
    caption: p.caption as string | null,
    timestamp: p.timestamp as string,
    sampleBucket: 'recent' as const,
  }));

  // Stratify each platform: 5 newest + 5 top-performing + 5 random
  const allPools: Array<Omit<VideoSource, 'sampleBucket'> & { sampleBucket: string }>[] = [igVideos, ttVideos];
  for (const pool of allPools) {
    if (pool.length === 0) continue;

    const selected = new Set<string>();
    const pick = (items: typeof pool, bucket: VideoSource['sampleBucket'], max: number) => {
      for (const item of items) {
        if (selected.has(item.postId)) continue;
        if (selected.size >= max + videos.length) break;
        selected.add(item.postId);
        videos.push({ ...item, sampleBucket: bucket } as VideoSource);
      }
    };

    // Sort by date desc → 5 newest
    const byDate = [...pool].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    pick(byDate, 'recent', 5);

    // Sort by engagement desc → 5 top
    const byEngagement = [...pool].sort((a, b) =>
      ((b.views || 0) + b.likes) - ((a.views || 0) + a.likes)
    );
    pick(byEngagement, 'top', 10);

    // Random from remainder → fill to 15
    const remaining = pool.filter(p => !selected.has(p.postId));
    const shuffled = remaining.sort(() => Math.random() - 0.5);
    pick(shuffled, 'random', 15);
  }

  return videos;
}

// ---------------------------------------------------------------------------
// yt-dlp download
// ---------------------------------------------------------------------------

function ensureTmpDir() {
  execSync(`mkdir -p ${TMP_DIR}`);
}

function downloadVideo(url: string): string | null {
  const filename = `${randomUUID()}.mp4`;
  const outPath = join(TMP_DIR, filename);

  try {
    // --no-playlist: don't expand playlists
    // --max-filesize 50M: skip huge files
    // -f "best[filesize<50M]": prefer smaller formats
    // --socket-timeout 30: don't hang forever
    execSync(
      `yt-dlp --no-playlist --max-filesize 50M --socket-timeout 30 ` +
      `-f "best[ext=mp4][filesize<50M]/best[ext=mp4]/best" ` +
      `-o "${outPath}" "${url}" 2>/dev/null`,
      { timeout: 60000 }
    );

    if (existsSync(outPath) && statSync(outPath).size > 0) {
      return outPath;
    }
    return null;
  } catch {
    // Cleanup partial download
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch { /* ignore */ }
    return null;
  }
}

function cleanupFile(path: string) {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Gemini File API + Flash analysis
// ---------------------------------------------------------------------------

function uploadToGemini(filePath: string, apiKey: string): string | null {
  try {
    const fileSize = statSync(filePath).size;
    const mimeType = 'video/mp4';

    // Start resumable upload
    const initResult = execSync(
      `curl -s -X POST ` +
      `"https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}" ` +
      `-H "X-Goog-Upload-Protocol: resumable" ` +
      `-H "X-Goog-Upload-Command: start" ` +
      `-H "X-Goog-Upload-Header-Content-Length: ${fileSize}" ` +
      `-H "X-Goog-Upload-Header-Content-Type: ${mimeType}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"file": {"display_name": "${filePath.split('/').pop()}"}}' ` +
      `-D -`,
      { timeout: 30000 }
    ).toString();

    // Extract upload URL from headers
    const uploadUrlMatch = initResult.match(/x-goog-upload-url:\s*(.+)/i);
    if (!uploadUrlMatch) return null;
    const uploadUrl = uploadUrlMatch[1].trim();

    // Upload the file bytes
    const uploadResult = execSync(
      `curl -s -X POST "${uploadUrl}" ` +
      `-H "Content-Length: ${fileSize}" ` +
      `-H "X-Goog-Upload-Offset: 0" ` +
      `-H "X-Goog-Upload-Command: upload, finalize" ` +
      `--data-binary "@${filePath}"`,
      { timeout: 120000 }
    ).toString();

    const parsed = JSON.parse(uploadResult);
    return parsed?.file?.uri || null;
  } catch {
    return null;
  }
}

function waitForGeminiProcessing(fileUri: string, apiKey: string): boolean {
  // Gemini needs time to process video. Poll until ACTIVE.
  const fileName = fileUri.split('/').pop();
  for (let i = 0; i < 30; i++) {
    try {
      const result = execSync(
        `curl -s "https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}"`,
        { timeout: 15000 }
      ).toString();
      const parsed = JSON.parse(result);
      if (parsed.state === 'ACTIVE') return true;
      if (parsed.state === 'FAILED') return false;
      // Still processing — wait 2s
      execSync('sleep 2');
    } catch {
      return false;
    }
  }
  return false;
}

const GEMINI_VIDEO_PROMPT = `Analyze this short social media video (Instagram Reel or TikTok) from a diet catering brand.

Return ONLY a JSON object with these fields:
{
  "hook_type": "text-overlay | face-to-camera | product-shot | before-after | question | montage-intro | other",
  "hook_text": "what the viewer sees/reads in the first 3 seconds",
  "production_quality": "ugc | semi-pro | professional | studio",
  "format": "talking-head | montage | unboxing | tutorial | behind-scenes | testimonial | day-in-life | food-prep | promo-offer | other",
  "faces_visible": true/false,
  "brand_visible": true/false,
  "food_visible": true/false,
  "text_overlays": ["list of text shown on screen"],
  "music_style": "trending-audio | original | voiceover-only | no-audio | background-chill",
  "cta": "follow | link-in-bio | order-now | swipe | comment | none",
  "duration_seconds": number,
  "pacing": "fast-cuts | medium | slow-lifestyle",
  "emotional_register": "funny | aspirational | educational | raw-authentic | promotional | aesthetic",
  "summary": "1 sentence: what this video is about and what it tries to achieve"
}

Respond with ONLY the JSON. No commentary.`;

function analyzeVideoWithGemini(
  fileUri: string,
  apiKey: string,
): Record<string, unknown> | null {
  try {
    const body = JSON.stringify({
      contents: [{
        parts: [
          { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          { text: GEMINI_VIDEO_PROMPT },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 800,
      },
    });

    const tmpBody = join(TMP_DIR, `req-${randomUUID()}.json`);
    require('fs').writeFileSync(tmpBody, body);

    const result = execSync(
      `curl -s -X POST ` +
      `"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}" ` +
      `-H "Content-Type: application/json" ` +
      `-d @${tmpBody}`,
      { timeout: 60000 }
    ).toString();

    cleanupFile(tmpBody);

    const parsed = JSON.parse(result);
    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claude Sonnet — brand-level aggregation
// ---------------------------------------------------------------------------

function aggregateWithSonnet(
  brandName: string,
  analyses: VideoAnalysis[],
  apiKey: string,
): VideoAggregation | null {
  const successful = analyses.filter(a => a.gemini);
  if (successful.length === 0) return null;

  const videosBlock = successful.map((a, i) => {
    const g = a.gemini!;
    return `Video ${i + 1} [${a.source.platform}] (${a.source.sampleBucket}, ${a.source.likes} likes):
  Format: ${g.format}, Production: ${g.production_quality}, Hook: ${g.hook_type}
  Pacing: ${g.pacing}, Emotion: ${g.emotional_register}, CTA: ${g.cta}
  Music: ${g.music_style}, Faces: ${g.faces_visible}, Food: ${g.food_visible}
  Text overlays: ${g.text_overlays.join('; ') || 'none'}
  Summary: ${g.summary}`;
  }).join('\n\n');

  const prompt = `You are a social media strategist analyzing the video content strategy of "${brandName}", a diet catering brand.

I analyzed ${successful.length} videos (Instagram Reels + TikTok) from this brand. Here are the individual analyses:

${videosBlock}

---

Synthesize these into a brand-level video content strategy assessment. Look for patterns, consistency, standout elements. Be specific and non-obvious.

Return ONLY a JSON object:
{
  "dominant_format": "most common video format across all videos",
  "production_level": "overall production quality: ugc / semi-pro / professional / studio / mixed",
  "hook_patterns": ["2-4 recurring hook strategies this brand uses"],
  "content_themes": ["3-5 recurring themes/topics in their videos"],
  "uses_trending_audio": true/false,
  "has_consistent_style": true/false,
  "video_quality_score": 1-10,
  "content_strategy": "2-3 sentences describing their overall video strategy. Be specific — what are they trying to do and how.",
  "standout_element": "1-2 sentences: what makes this brand's video content unique or notable. If nothing stands out, say so explicitly.",
  "platform_comparison": "1-2 sentences: how their IG Reels differ from TikTok content (if both present). If only one platform, say so.",
  "recommendations": ["2-3 specific, actionable recommendations for improving their video strategy"]
}

Respond with ONLY the JSON.`;

  try {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const tmpBody = join(TMP_DIR, `sonnet-${randomUUID()}.json`);
    require('fs').writeFileSync(tmpBody, body);

    const result = execSync(
      `curl -s -X POST https://api.anthropic.com/v1/messages ` +
      `-H "Content-Type: application/json" ` +
      `-H "x-api-key: ${apiKey}" ` +
      `-H "anthropic-version: 2023-06-01" ` +
      `-d @${tmpBody}`,
      { timeout: 60000 }
    ).toString();

    cleanupFile(tmpBody);

    const parsed = JSON.parse(result);
    const text = parsed?.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VideoAggregation;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main phase function
// ---------------------------------------------------------------------------

export async function analyzeVideo(entity: EntityRecord): Promise<EntityRecord> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey) {
    return {
      ...entity,
      data: { ...entity.data, video: { skipped: true, reason: 'GEMINI_API_KEY not set' } },
    };
  }

  // 1. Select videos from social phase data
  const sources = selectVideos(entity);
  if (sources.length === 0) {
    return {
      ...entity,
      data: {
        ...entity.data,
        video: {
          skipped: true,
          reason: 'No video posts found in social data (run social phase first)',
          analyzed_count: 0,
        },
      },
    };
  }

  ensureTmpDir();

  // 2. Download + upload + analyze each video
  const analyses: VideoAnalysis[] = [];
  let totalCost = 0;

  for (const source of sources) {
    const analysis: VideoAnalysis = { source, gemini: null };

    // Download
    const localPath = downloadVideo(source.url);
    if (!localPath) {
      analysis.error = 'download failed';
      analyses.push(analysis);
      continue;
    }

    // Upload to Gemini
    const fileUri = uploadToGemini(localPath, geminiKey);
    if (!fileUri) {
      cleanupFile(localPath);
      analysis.error = 'gemini upload failed';
      analyses.push(analysis);
      continue;
    }

    // Wait for processing
    const ready = waitForGeminiProcessing(fileUri, geminiKey);
    if (!ready) {
      cleanupFile(localPath);
      analysis.error = 'gemini processing failed/timeout';
      analyses.push(analysis);
      continue;
    }

    // Analyze with Gemini Flash
    const geminiResult = analyzeVideoWithGemini(fileUri, geminiKey);
    if (geminiResult) {
      analysis.gemini = geminiResult as VideoAnalysis['gemini'];
      // Gemini Flash: ~$0.0001 per 60s video
      totalCost += 0.0001;
    } else {
      analysis.error = 'gemini analysis returned empty';
    }

    // Cleanup local file (Gemini has its own copy)
    cleanupFile(localPath);
    analysis.geminiFileUri = fileUri;
    analyses.push(analysis);
  }

  // 3. Aggregate with Sonnet
  let aggregation: VideoAggregation | null = null;
  const successfulCount = analyses.filter(a => a.gemini).length;

  if (successfulCount > 0 && anthropicKey) {
    aggregation = aggregateWithSonnet(entity.name, analyses, anthropicKey);
    // Sonnet: ~$0.01 per aggregation call
    totalCost += 0.01;
  }

  // 4. Build output — preserve source URLs for later viewing
  const videoData: VideoData = {
    analyzed_count: successfulCount,
    failed_count: analyses.length - successfulCount,
    platforms: Array.from(new Set(sources.map(s => s.platform))),
    videos: analyses.map(a => ({
      platform: a.source.platform,
      url: a.source.url,
      postId: a.source.postId,
      likes: a.source.likes,
      views: a.source.views,
      caption: a.source.caption,
      timestamp: a.source.timestamp,
      sampleBucket: a.source.sampleBucket,
      analysis: a.gemini,
      ...(a.error ? { error: a.error } : {}),
    })),
    aggregation,
    cost_usd: totalCost,
    analyzed_at: new Date().toISOString(),
  };

  return {
    ...entity,
    data: {
      ...entity.data,
      video: videoData,
      _cost_video: { usd: totalCost },
    },
  };
}
