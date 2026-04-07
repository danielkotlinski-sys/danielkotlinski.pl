#!/usr/bin/env npx tsx
/**
 * Quick test: download a single video via yt-dlp → upload to Gemini → analyze.
 *
 * Usage:
 *   cd /home/user/danielkotlinski.pl/catscan
 *   GEMINI_API_KEY=xxx npx tsx scripts/test-video-analysis.ts "https://www.tiktok.com/@5posilkowdziennie/video/7620844141467094275"
 */

import {
  ensureTmpDir,
  cleanupFile,
  downloadVideo,
  uploadToGemini,
  waitForGeminiProcessing,
  analyzeWithGemini,
} from '../lib/connectors/gemini-video';

const PROMPT = `Analyze this short social media video (Instagram Reel or TikTok) from a diet catering brand.

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

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx scripts/test-video-analysis.ts <VIDEO_URL>');
    process.exit(1);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('Set GEMINI_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`\n1. Downloading: ${url}`);
  ensureTmpDir();
  const localPath = downloadVideo(url);
  if (!localPath) {
    console.error('   FAILED: download failed');
    process.exit(1);
  }
  console.log(`   OK: ${localPath}`);

  console.log('\n2. Uploading to Gemini...');
  const fileUri = uploadToGemini(localPath, geminiKey);
  if (!fileUri) {
    cleanupFile(localPath);
    console.error('   FAILED: upload failed');
    process.exit(1);
  }
  console.log(`   OK: ${fileUri}`);

  console.log('\n3. Waiting for Gemini processing...');
  const ready = waitForGeminiProcessing(fileUri, geminiKey);
  if (!ready) {
    cleanupFile(localPath);
    console.error('   FAILED: processing timeout');
    process.exit(1);
  }
  console.log('   OK: ready');

  console.log('\n4. Analyzing with Gemini Flash...');
  const result = analyzeWithGemini(fileUri, geminiKey, PROMPT);
  cleanupFile(localPath);

  if (!result) {
    console.error('   FAILED: analysis returned empty');
    process.exit(1);
  }

  console.log('   OK!\n');
  console.log('=== ANALYSIS RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
