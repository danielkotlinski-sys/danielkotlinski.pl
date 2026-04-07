/**
 * Phase: YouTube Reviews — find and analyze third-party video reviews of
 * diet catering brands on YouTube.
 *
 * Pipeline position: after video (shares Gemini infra), before ads.
 *
 * Flow per entity:
 *   1. YouTube Data API v3 → search "[brand] recenzja catering" etc.
 *   2. Filter: exclude brand's own channel, min views, max duration
 *   3. Select top 5 videos by view count
 *   4. Fetch transcript via YouTube captions API / yt-dlp --write-subs
 *   5. Analyze transcript with Claude Sonnet (text-based, no video needed)
 *   6. Claude Sonnet aggregation → brand reputation from YouTube reviews
 *
 * Requires: YOUTUBE_API_KEY, ANTHROPIC_API_KEY
 * Optional: yt-dlp (for transcript fallback)
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { EntityRecord } from '@/lib/db/store';
import {
  searchReviewVideos,
  getVideoDetails,
  filterReviewVideos,
  detectSponsorship,
  type YouTubeVideoDetails,
} from '@/lib/connectors/youtube';
import { callSonnet } from '@/lib/connectors/gemini-video';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewAnalysis {
  reviewer_name: string;
  overall_sentiment: 'very_positive' | 'positive' | 'mixed' | 'negative' | 'very_negative';
  rating_given: number | null;
  pros: string[];
  cons: string[];
  mentioned_products: string[];
  competitor_mentions: Array<{
    name: string;
    context: 'favorable' | 'unfavorable' | 'neutral';
  }>;
  key_quotes: string[];
  is_sponsored: boolean;
  is_unboxing: boolean;
  days_reviewed: number | null;
  summary: string;
}

interface ReviewAggregation {
  total_reviews: number;
  avg_sentiment_score: number;
  sentiment_distribution: Record<string, number>;
  top_pros: string[];
  top_cons: string[];
  competitor_comparisons: Array<{
    competitor: string;
    times_compared: number;
    usually_wins: boolean;
  }>;
  sponsored_ratio: number;
  total_reach_views: number;
  reputation_summary: string;
}

interface YouTubeReviewData {
  reviews_found: number;
  reviews_analyzed: number;
  reviews_failed: number;
  analysis_method: 'transcript';
  videos: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    publishedAt: string;
    viewCount: number;
    likeCount: number;
    durationSeconds: number;
    url: string;
    paidProductPlacement: boolean;
    sponsorshipFromMetadata: { confidence: number; signals: string[] } | null;
    transcript_length?: number;
    analysis: ReviewAnalysis | null;
    error?: string;
  }>;
  aggregation: ReviewAggregation | null;
  cost_usd: number;
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Transcript fetching
// ---------------------------------------------------------------------------

const TMP_DIR = '/tmp/catscan-video';

/**
 * Fetch transcript for a YouTube video using yt-dlp --write-subs --skip-download.
 * Tries auto-generated captions first (pl, en), then manual captions.
 * Returns transcript text or null.
 */
function fetchTranscript(videoId: string): string | null {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outBase = join(TMP_DIR, `transcript-${randomUUID()}`);

  try {
    execSync(`mkdir -p ${TMP_DIR}`);
  } catch { /* ignore */ }

  // Try to get auto-generated subtitles (most videos have these)
  try {
    execSync(
      `yt-dlp --skip-download --write-auto-subs --sub-langs "pl,en" --sub-format vtt ` +
      `--convert-subs srt -o "${outBase}" "${url}" 2>/dev/null`,
      { timeout: 30000 }
    );
  } catch { /* ignore - try manual subs next */ }

  // Check for downloaded subtitle files
  const possibleFiles = [
    `${outBase}.pl.srt`,
    `${outBase}.en.srt`,
    `${outBase}.pl.vtt`,
    `${outBase}.en.vtt`,
  ];

  for (const f of possibleFiles) {
    if (existsSync(f)) {
      const raw = readFileSync(f, 'utf-8');
      const text = cleanSubtitles(raw);
      // Cleanup all subtitle files
      for (const ff of possibleFiles) {
        try { if (existsSync(ff)) unlinkSync(ff); } catch { /* ignore */ }
      }
      if (text.length > 50) return text;
    }
  }

  // Fallback: try manual subtitles
  try {
    execSync(
      `yt-dlp --skip-download --write-subs --sub-langs "pl,en" --sub-format vtt ` +
      `--convert-subs srt -o "${outBase}" "${url}" 2>/dev/null`,
      { timeout: 30000 }
    );
  } catch { /* ignore */ }

  for (const f of possibleFiles) {
    if (existsSync(f)) {
      const raw = readFileSync(f, 'utf-8');
      const text = cleanSubtitles(raw);
      for (const ff of possibleFiles) {
        try { if (existsSync(ff)) unlinkSync(ff); } catch { /* ignore */ }
      }
      if (text.length > 50) return text;
    }
  }

  return null;
}

/**
 * Clean SRT/VTT subtitle text — remove timestamps, tags, duplicate lines.
 */
function cleanSubtitles(raw: string): string {
  const lines = raw.split('\n');
  const textLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, sequence numbers, timestamps
    if (!trimmed) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^\d{2}:\d{2}/.test(trimmed)) continue;
    if (trimmed.startsWith('WEBVTT')) continue;
    if (trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) continue;

    // Remove HTML tags
    const clean = trimmed.replace(/<[^>]+>/g, '').trim();
    if (!clean) continue;

    // Deduplicate (auto-subs often repeat lines)
    if (seen.has(clean)) continue;
    seen.add(clean);

    textLines.push(clean);
  }

  return textLines.join(' ');
}

// ---------------------------------------------------------------------------
// Claude prompt for transcript-based review analysis
// ---------------------------------------------------------------------------

function buildReviewPrompt(brandName: string, video: { title: string; channelTitle: string; viewCount: number; publishedAt: string }, transcript: string): string {
  // Truncate transcript to ~6000 chars to stay within reasonable token limits
  const maxChars = 6000;
  const truncatedTranscript = transcript.length > maxChars
    ? transcript.slice(0, maxChars) + '... [transcript truncated]'
    : transcript;

  return `You are analyzing a YouTube video review transcript of "${brandName}", a Polish diet catering brand.

Video: "${video.title}" by ${video.channelTitle} (${video.viewCount.toLocaleString()} views, ${video.publishedAt.slice(0, 10)})

TRANSCRIPT:
${truncatedTranscript}

---

Based on this transcript, extract the reviewer's opinions. If the transcript doesn't actually review "${brandName}" (e.g. it's a news segment, unrelated content, or only briefly mentions the brand), set overall_sentiment to "not_a_review" and explain in summary.

Return ONLY a JSON object:
{
  "reviewer_name": "name or channel name of the reviewer",
  "overall_sentiment": "very_positive | positive | mixed | negative | very_negative | not_a_review",
  "rating_given": number or null (if the reviewer gives an explicit score, normalize to 1-10),
  "pros": ["specific things praised — food taste, portions, packaging, delivery, variety, price-quality ratio"],
  "cons": ["specific things criticized — bland food, small portions, late delivery, bad packaging"],
  "mentioned_products": ["specific diets, meals, or products mentioned by name"],
  "competitor_mentions": [{"name": "competitor brand name", "context": "favorable | unfavorable | neutral"}],
  "key_quotes": ["up to 3 notable direct quotes from the reviewer (in Polish)"],
  "is_sponsored": true/false,
  "is_unboxing": true/false,
  "days_reviewed": number or null,
  "summary": "2-3 sentences: the reviewer's overall verdict and key takeaway"
}

Respond with ONLY the JSON. No commentary.`;
}

// ---------------------------------------------------------------------------
// Extract brand's YouTube channel IDs from social phase data
// ---------------------------------------------------------------------------

function getBrandChannelIds(entity: EntityRecord): string[] {
  const social = (entity.data as Record<string, unknown>).social as Record<string, unknown> | undefined;
  if (!social) return [];

  const yt = social.youtube as Record<string, unknown> | undefined;
  const channelId = yt?.channelId as string | undefined;
  return channelId ? [channelId] : [];
}

// ---------------------------------------------------------------------------
// Relevance check — is this video actually a review of this brand?
// ---------------------------------------------------------------------------

function isRelevantReview(video: YouTubeVideoDetails, brandName: string): boolean {
  const brandLower = brandName.toLowerCase();
  const titleLower = video.title.toLowerCase();
  const descLower = video.description.toLowerCase();
  const combined = titleLower + ' ' + descLower;

  // Reject obvious non-review content
  const rejectPatterns = [
    'government shutdown', 'kaucja', 'polityka', 'wiadomości',
    'brief', 'podcast', 'news', 'giełda', 'inwestycje',
  ];
  for (const pat of rejectPatterns) {
    if (titleLower.includes(pat)) return false;
  }

  // Brand name must appear in title or description
  if (combined.includes(brandLower)) return true;

  // Try without common suffixes
  const brandCore = brandLower
    .replace(/\.pl$/i, '')
    .replace(/\s*catering\s*/i, '')
    .replace(/\s*dietetyczny\s*/i, '')
    .replace(/\s*diet\s*/i, '')
    .trim();

  if (brandCore.length >= 3 && combined.includes(brandCore)) return true;

  // Try individual significant words from brand name (>=4 chars)
  const words = brandLower.split(/[\s\-_.]+/).filter(w => w.length >= 4);
  const genericWords = ['catering', 'dietetyczny', 'diet', 'polska', 'kuchnia', 'zdrowa', 'zdrowe'];
  for (const word of words) {
    if (genericWords.includes(word)) continue;
    if (combined.includes(word)) return true;
  }

  // General catering review/ranking — must be in TITLE (not just description)
  const cateringKeywords = ['test catering', 'ranking catering', 'porównanie catering', 'wielki test'];
  for (const kw of cateringKeywords) {
    if (titleLower.includes(kw)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main phase function
// ---------------------------------------------------------------------------

const MAX_VIDEOS_TO_ANALYZE = 5;

export async function analyzeYouTubeReviews(entity: EntityRecord): Promise<EntityRecord> {
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!youtubeKey) {
    return {
      ...entity,
      data: { ...entity.data, youtube_reviews: { skipped: true, reason: 'YOUTUBE_API_KEY not set' } },
    };
  }

  if (!anthropicKey) {
    return {
      ...entity,
      data: { ...entity.data, youtube_reviews: { skipped: true, reason: 'ANTHROPIC_API_KEY not set (needed for transcript analysis)' } },
    };
  }

  // 1. Search for review videos via YouTube Data API
  const searchResults = searchReviewVideos(entity.name, youtubeKey, {
    maxResults: 15,
    publishedAfter: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (searchResults.length === 0) {
    return {
      ...entity,
      data: {
        ...entity.data,
        youtube_reviews: {
          skipped: true,
          reason: 'No review videos found on YouTube',
          reviews_found: 0,
        },
      },
    };
  }

  // 2. Get detailed stats for found videos
  const videoIds = searchResults.map(r => r.videoId);
  const videoDetails = getVideoDetails(videoIds, youtubeKey);

  // 3. Filter: exclude brand's own channel, min views, max duration
  const brandChannelIds = getBrandChannelIds(entity);
  let candidates = filterReviewVideos(videoDetails, {
    brandChannelIds,
    minViews: 100,
    maxDurationSeconds: 1800,
  });

  // 4. Check relevance — brand name should appear in title/description
  candidates = candidates.filter(v => isRelevantReview(v, entity.name));

  // 5. Sort by views descending, pick top N
  candidates.sort((a, b) => b.viewCount - a.viewCount);
  const selected = candidates.slice(0, MAX_VIDEOS_TO_ANALYZE);

  if (selected.length === 0) {
    return {
      ...entity,
      data: {
        ...entity.data,
        youtube_reviews: {
          skipped: true,
          reason: 'No relevant review videos passed filters (min views, duration, relevance)',
          reviews_found: searchResults.length,
          reviews_analyzed: 0,
        },
      },
    };
  }

  // 6. Fetch transcript → analyze with Claude for each video
  let totalCost = 0;
  const analyzedVideos: YouTubeReviewData['videos'] = [];

  for (const video of selected) {
    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    const sponsorship = detectSponsorship(video);

    const entry: YouTubeReviewData['videos'][0] = {
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      durationSeconds: video.durationSeconds,
      url: videoUrl,
      paidProductPlacement: video.paidProductPlacement,
      sponsorshipFromMetadata: sponsorship.isSponsored ? {
        confidence: sponsorship.confidence,
        signals: sponsorship.signals,
      } : null,
      analysis: null,
    };

    // Fetch transcript (no cookies needed, no video download)
    const transcript = fetchTranscript(video.videoId);
    if (!transcript) {
      entry.error = 'no transcript available';
      analyzedVideos.push(entry);
      continue;
    }

    entry.transcript_length = transcript.length;

    // Analyze transcript with Claude Sonnet
    const prompt = buildReviewPrompt(entity.name, video, transcript);
    const result = callSonnet(prompt, anthropicKey, 1200) as ReviewAnalysis | null;

    if (result) {
      // Filter out "not_a_review" responses
      if ((result.overall_sentiment as string) === 'not_a_review') {
        entry.error = `not a review: ${result.summary || 'unrelated content'}`;
        analyzedVideos.push(entry);
        continue;
      }
      entry.analysis = result;
      totalCost += 0.008; // ~$0.008 per Sonnet call with transcript
    } else {
      entry.error = 'claude analysis returned empty';
    }

    analyzedVideos.push(entry);
  }

  // 7. Aggregate with Sonnet
  let aggregation: ReviewAggregation | null = null;
  const successful = analyzedVideos.filter(v => v.analysis);

  if (successful.length > 0 && anthropicKey) {
    aggregation = buildAggregation(entity.name, successful, anthropicKey);
    totalCost += 0.01;
  }

  // 8. Build output
  const reviewData: YouTubeReviewData = {
    reviews_found: searchResults.length,
    reviews_analyzed: successful.length,
    reviews_failed: analyzedVideos.length - successful.length,
    analysis_method: 'transcript',
    videos: analyzedVideos,
    aggregation,
    cost_usd: totalCost,
    analyzed_at: new Date().toISOString(),
  };

  return {
    ...entity,
    data: {
      ...entity.data,
      youtube_reviews: reviewData,
      _cost_youtube_reviews: { usd: totalCost },
    },
  };
}

// ---------------------------------------------------------------------------
// Sonnet aggregation — brand reputation summary from reviews
// ---------------------------------------------------------------------------

function buildAggregation(
  brandName: string,
  videos: YouTubeReviewData['videos'],
  anthropicKey: string,
): ReviewAggregation | null {
  const reviewsBlock = videos.map((v, i) => {
    const a = v.analysis!;
    return `Review ${i + 1} by "${v.channelTitle}" (${v.viewCount.toLocaleString()} views, ${v.publishedAt.slice(0, 10)}):
  Sentiment: ${a.overall_sentiment}${a.rating_given ? `, Rating: ${a.rating_given}/10` : ''}
  Pros: ${a.pros.join('; ') || 'none mentioned'}
  Cons: ${a.cons.join('; ') || 'none mentioned'}
  Products mentioned: ${a.mentioned_products.join(', ') || 'none'}
  Competitors mentioned: ${a.competitor_mentions.map(c => `${c.name} (${c.context})`).join(', ') || 'none'}
  Sponsored: ${a.is_sponsored ? 'YES' : 'no'}
  Days tested: ${a.days_reviewed ?? 'unknown'}
  Summary: ${a.summary}`;
  }).join('\n\n');

  const prompt = `You are analyzing the YouTube review landscape for "${brandName}", a Polish diet catering brand.

I analyzed ${videos.length} YouTube review videos via their transcripts. Here are the extracted reviews:

${reviewsBlock}

---

Synthesize these reviews into a reputation assessment. Identify patterns across reviewers — what do they consistently praise or criticize? Weight more heavily: reviews with more views, non-sponsored reviews, and longer testing periods.

Return ONLY a JSON object:
{
  "total_reviews": ${videos.length},
  "avg_sentiment_score": number from -1.0 (very negative) to 1.0 (very positive),
  "sentiment_distribution": {"very_positive": N, "positive": N, "mixed": N, "negative": N, "very_negative": N},
  "top_pros": ["3-5 most frequently praised aspects, aggregated across reviews"],
  "top_cons": ["3-5 most frequently criticized aspects, aggregated across reviews"],
  "competitor_comparisons": [{"competitor": "name", "times_compared": N, "usually_wins": true/false}],
  "sponsored_ratio": 0.0-1.0 (fraction of reviews that are sponsored),
  "total_reach_views": total views across all analyzed videos,
  "reputation_summary": "3-4 sentences: what is this brand's reputation according to YouTube reviewers? What patterns emerge? What should potential customers know?"
}

Respond with ONLY the JSON.`;

  return callSonnet(prompt, anthropicKey, 1500) as ReviewAggregation | null;
}
