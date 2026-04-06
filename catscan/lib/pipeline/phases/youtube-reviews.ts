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
 *   4. Download via yt-dlp → /tmp/
 *   5. Upload to Gemini File API → analyze with Gemini Flash (review prompt)
 *   6. Claude Sonnet aggregation → brand reputation from YouTube reviews
 *   7. Cleanup temp files
 *
 * Requires: YOUTUBE_API_KEY, GEMINI_API_KEY
 * Optional: ANTHROPIC_API_KEY (for Sonnet aggregation)
 * External: yt-dlp (pip install yt-dlp)
 */

import type { EntityRecord } from '@/lib/db/store';
import {
  searchReviewVideos,
  getVideoDetails,
  filterReviewVideos,
  detectSponsorship,
  type YouTubeVideoDetails,
} from '@/lib/connectors/youtube';
import {
  ensureTmpDir,
  cleanupFile,
  downloadVideo,
  uploadToGemini,
  waitForGeminiProcessing,
  analyzeWithGemini,
  callSonnet,
} from '@/lib/connectors/gemini-video';

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
    analysis: ReviewAnalysis | null;
    error?: string;
  }>;
  aggregation: ReviewAggregation | null;
  cost_usd: number;
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Gemini prompt for review analysis
// ---------------------------------------------------------------------------

const REVIEW_ANALYSIS_PROMPT = `You are analyzing a YouTube video review of a Polish diet catering (catering dietetyczny) brand.

Extract the reviewer's opinions, sentiments, and specific feedback. Focus on what the reviewer actually SAYS and SHOWS about the food and service.

Return ONLY a JSON object:
{
  "reviewer_name": "name or channel name of the reviewer",
  "overall_sentiment": "very_positive | positive | mixed | negative | very_negative",
  "rating_given": number or null (if the reviewer gives an explicit score like 7/10 or 4/5, normalize to 1-10 scale),
  "pros": ["specific things the reviewer praised — food taste, portions, packaging, delivery, variety, price-quality ratio, etc."],
  "cons": ["specific things the reviewer criticized — bland food, small portions, late delivery, bad packaging, etc."],
  "mentioned_products": ["specific diets, meals, or products mentioned by name"],
  "competitor_mentions": [{"name": "competitor brand name", "context": "favorable | unfavorable | neutral"}],
  "key_quotes": ["up to 3 notable direct quotes from the reviewer (in Polish or translated)"],
  "is_sponsored": true/false (does the reviewer disclose sponsorship or is this clearly a paid review?),
  "sponsorship_context": "how is the sponsorship disclosed? e.g. 'partnerem odcinka jest...', 'materiał sponsorowany', verbal mention, on-screen text, or null if not sponsored",
  "is_unboxing": true/false (is this primarily an unboxing/first-impressions video?),
  "days_reviewed": number or null (how many days did the reviewer test this catering?),
  "summary": "2-3 sentences: what is the reviewer's overall verdict and the key takeaway for potential customers?"
}

Respond with ONLY the JSON. No commentary.`;

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
// Relevance check — is this video actually about this brand?
// ---------------------------------------------------------------------------

function isRelevantReview(video: YouTubeVideoDetails, brandName: string): boolean {
  const brandLower = brandName.toLowerCase();
  const titleLower = video.title.toLowerCase();
  const descLower = video.description.toLowerCase();

  // Brand name must appear in title or description
  if (titleLower.includes(brandLower) || descLower.includes(brandLower)) {
    return true;
  }

  // Try without common suffixes like ".pl", "Catering"
  const brandCore = brandLower
    .replace(/\.pl$/i, '')
    .replace(/\s*catering\s*/i, '')
    .trim();

  if (brandCore.length >= 3 && (titleLower.includes(brandCore) || descLower.includes(brandCore))) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main phase function
// ---------------------------------------------------------------------------

const MAX_VIDEOS_TO_ANALYZE = 5;

export async function analyzeYouTubeReviews(entity: EntityRecord): Promise<EntityRecord> {
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!youtubeKey) {
    return {
      ...entity,
      data: { ...entity.data, youtube_reviews: { skipped: true, reason: 'YOUTUBE_API_KEY not set' } },
    };
  }

  if (!geminiKey) {
    return {
      ...entity,
      data: { ...entity.data, youtube_reviews: { skipped: true, reason: 'GEMINI_API_KEY not set' } },
    };
  }

  // 1. Search for review videos via YouTube Data API
  const searchResults = searchReviewVideos(entity.name, youtubeKey, {
    maxResults: 15,
    publishedAfter: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString(), // last 2 years
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
    minViews: 500,
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

  ensureTmpDir();

  // 6. Download → upload → analyze each video with Gemini
  let totalCost = 0;
  const analyzedVideos: YouTubeReviewData['videos'] = [];

  for (const video of selected) {
    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    // Detect sponsorship from metadata before downloading
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

    // Download (allow larger files for longer review videos)
    const localPath = downloadVideo(videoUrl, '100M', 120000);
    if (!localPath) {
      entry.error = 'download failed';
      analyzedVideos.push(entry);
      continue;
    }

    // Upload to Gemini
    const fileUri = uploadToGemini(localPath, geminiKey);
    if (!fileUri) {
      cleanupFile(localPath);
      entry.error = 'gemini upload failed';
      analyzedVideos.push(entry);
      continue;
    }

    // Wait for processing (longer timeout for review videos)
    const ready = waitForGeminiProcessing(fileUri, geminiKey, 45);
    if (!ready) {
      cleanupFile(localPath);
      entry.error = 'gemini processing timeout';
      analyzedVideos.push(entry);
      continue;
    }

    // Analyze with Gemini Flash
    const geminiResult = analyzeWithGemini(fileUri, geminiKey, REVIEW_ANALYSIS_PROMPT, {
      maxOutputTokens: 1200,
      temperature: 0.1,
    });

    if (geminiResult) {
      entry.analysis = geminiResult as unknown as ReviewAnalysis;
      // Gemini Flash for longer video: ~$0.0003 per 10-min video
      totalCost += 0.0003;
    } else {
      entry.error = 'gemini analysis returned empty';
    }

    cleanupFile(localPath);
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

I analyzed ${videos.length} YouTube review videos. Here are the extracted reviews:

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
