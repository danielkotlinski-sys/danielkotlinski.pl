/**
 * Phase: Visual — Homepage screenshot + vision-based visual identity extraction.
 *
 * 1. Takes a homepage screenshot via Apify's screenshot actor
 * 2. Sends the screenshot to Claude Haiku 4.5 (multimodal) for visual analysis
 * 3. Extracts: dominant_colors, typography_class, image_style, layout_pattern,
 *    overall_aesthetic, logo_description, color_palette_type, visual_quality_score
 *
 * Requires: APIFY_API_TOKEN + ANTHROPIC_API_KEY
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

interface VisualIdentity {
  dominant_colors: string[];
  color_palette_type: 'monochrome' | 'complementary' | 'analogous' | 'triadic' | 'neutral' | 'vibrant' | 'unknown';
  typography_class: 'serif' | 'sans-serif' | 'mixed' | 'display' | 'handwritten' | 'unknown';
  image_style: 'photography' | 'illustration' | 'mixed' | 'minimal' | 'stock' | 'custom' | 'unknown';
  layout_pattern: 'hero-centric' | 'grid' | 'scroll-story' | 'product-first' | 'form-first' | 'minimal' | 'unknown';
  overall_aesthetic: 'premium' | 'modern' | 'clinical' | 'warm' | 'eco' | 'sporty' | 'playful' | 'corporate' | 'generic';
  logo_description: string | null;
  visual_quality_score: number;
  screenshot_url: string | null;
  analyzedAt: string;
}

const VISUAL_PROMPT = `You are a brand design analyst. Analyze this screenshot of a Polish diet catering company's homepage.

Extract the visual identity in the following JSON format. Return ONLY valid JSON, no markdown, no explanation.

{
  "dominant_colors": ["array of 3-5 dominant hex colors seen on the page, e.g. '#2C3E50', '#E74C3C', '#FFFFFF'"],
  "color_palette_type": "monochrome | complementary | analogous | triadic | neutral | vibrant | unknown",
  "typography_class": "serif | sans-serif | mixed | display | handwritten | unknown — the primary typeface style",
  "image_style": "photography | illustration | mixed | minimal | stock | custom | unknown — what kind of imagery dominates",
  "layout_pattern": "hero-centric | grid | scroll-story | product-first | form-first | minimal | unknown — the page layout approach",
  "overall_aesthetic": "premium | modern | clinical | warm | eco | sporty | playful | corporate | generic — the overall brand feel",
  "logo_description": "string or null — brief description of the logo (shape, text, icon)",
  "visual_quality_score": "number 1-10 — overall visual design quality (1=amateur, 10=world-class)"
}

Important:
- dominant_colors must be hex color codes like '#FF5733'
- Be specific about what you actually see, don't guess
- visual_quality_score: consider layout consistency, whitespace use, color harmony, typography quality, image quality
- If the screenshot is blank, broken, or a cookie banner covers everything, still try your best but lower the quality score`;

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Take a screenshot of a URL using Apify's screenshot actor.
 * Returns the screenshot as a base64-encoded string, or null on failure.
 */
function takeScreenshot(
  url: string,
  apiToken: string
): { base64: string; screenshotUrl: string | null } | null {
  // Use Apify's website-content-crawler with screenshot mode,
  // or the simpler apify/screenshot-url actor
  const input = {
    urls: [{ url }],
    waitUntil: 'networkidle2',
    delay: 3000,         // Wait 3s for animations/lazy-load
    viewportWidth: 1440,
    viewportHeight: 900,
    scrollToBottom: false,
    output: 'base64',
    quality: 80,
  };

  const inputFile = `/tmp/apify_screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(input));

  try {
    const raw = execSync(
      `curl -s -m 120 -X POST 'https://api.apify.com/v2/acts/apify~screenshot-url/run-sync-get-dataset-items?token=${apiToken}' -H 'Content-Type: application/json' -d @${inputFile}`,
      { maxBuffer: 30 * 1024 * 1024, timeout: 130000 }
    ).toString('utf-8');

    try { unlinkSync(inputFile); } catch { /* ignore */ }

    let items: unknown[];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn(`[visual] Invalid JSON from screenshot API`);
      return null;
    }

    if (items.length === 0) {
      console.warn(`[visual] No screenshot result for ${url}`);
      return null;
    }

    const item = items[0] as Record<string, unknown>;

    // The actor returns base64 screenshot or a URL to the image
    const base64 = item.screenshotBase64 as string | undefined;
    const imageUrl = item.screenshotUrl as string | undefined
      || item.url as string | undefined;

    if (base64) {
      return { base64, screenshotUrl: imageUrl || null };
    }

    // If we got a URL but no base64, download the image
    if (imageUrl) {
      try {
        const imgBuffer = execSync(
          `curl -s -m 30 -L ${shellEscape(imageUrl)}`,
          { maxBuffer: 20 * 1024 * 1024, timeout: 35000 }
        );
        return {
          base64: imgBuffer.toString('base64'),
          screenshotUrl: imageUrl,
        };
      } catch {
        console.warn(`[visual] Failed to download screenshot from ${imageUrl}`);
      }
    }

    // Try alternative field names
    const screenshot = item.screenshot as string | undefined;
    if (screenshot) {
      // Could be base64 or URL
      if (screenshot.startsWith('http')) {
        try {
          const imgBuffer = execSync(
            `curl -s -m 30 -L ${shellEscape(screenshot)}`,
            { maxBuffer: 20 * 1024 * 1024, timeout: 35000 }
          );
          return { base64: imgBuffer.toString('base64'), screenshotUrl: screenshot };
        } catch { /* fall through */ }
      } else {
        return { base64: screenshot, screenshotUrl: null };
      }
    }

    console.warn(`[visual] Screenshot result has no image data for ${url}`);
    return null;
  } catch (e) {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    console.warn(`[visual] Screenshot failed for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Analyze a screenshot using Claude Haiku 4.5 vision.
 */
function analyzeScreenshot(
  base64Image: string,
  brandName: string,
  brandUrl: string,
  apiKey: string
): VisualIdentity | null {
  const requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: `${VISUAL_PROMPT}\n\nThis is the homepage of: ${brandName} (${brandUrl})`,
          },
        ],
      },
    ],
  };

  const inputFile = `/tmp/visual_llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  writeFileSync(inputFile, JSON.stringify(requestBody));

  let raw: string;
  try {
    raw = execSync(
      `curl -s -m 120 https://api.anthropic.com/v1/messages -H ${shellEscape('x-api-key: ' + apiKey)} -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' -d @${inputFile}`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 130000 }
    ).toString('utf-8');
  } catch (e) {
    console.warn(`[visual] Claude API call failed:`, e instanceof Error ? e.message : e);
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    return null;
  } finally {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
  }

  let response: Record<string, unknown>;
  try {
    response = JSON.parse(raw);
  } catch {
    console.warn(`[visual] Invalid JSON from Claude API`);
    return null;
  }

  if (response.error) {
    const errObj = response.error as Record<string, string>;
    console.warn(`[visual] Claude API error: ${errObj.message || JSON.stringify(errObj)}`);
    return null;
  }

  const content = response.content as Array<{ type: string; text: string }> | undefined;
  const text = content && content.length > 0 && content[0].type === 'text'
    ? content[0].text
    : '';

  // Parse JSON — handle markdown code blocks
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim()) as VisualIdentity;
    const usage = response.usage as { input_tokens: number; output_tokens: number } | undefined;
    return {
      ...parsed,
      analyzedAt: new Date().toISOString(),
      _tokens: {
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
      },
    } as VisualIdentity & { _tokens: { input: number; output: number } };
  } catch {
    console.warn(`[visual] Failed to parse visual analysis JSON: ${text.slice(0, 200)}`);
    return null;
  }
}

export async function extractVisualIdentity(entity: EntityRecord): Promise<EntityRecord> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (!apiKey || !apifyToken) {
    return {
      ...entity,
      data: {
        ...entity.data,
        visual_identity: { skipped: true, reason: 'Missing ANTHROPIC_API_KEY or APIFY_API_TOKEN' },
      },
    };
  }

  const url = entity.url.startsWith('http') ? entity.url : `https://${entity.url}`;

  try {
    // Step 1: Take screenshot
    const screenshot = takeScreenshot(url, apifyToken);

    if (!screenshot) {
      return {
        ...entity,
        data: {
          ...entity.data,
          visual_identity: { skipped: true, reason: 'Screenshot capture failed' },
        },
        errors: [...entity.errors, 'Visual: screenshot capture failed'],
      };
    }

    // Step 2: Analyze with Claude vision
    const analysis = analyzeScreenshot(screenshot.base64, entity.name, url, apiKey);

    if (!analysis) {
      return {
        ...entity,
        data: {
          ...entity.data,
          visual_identity: { skipped: true, reason: 'Vision analysis failed' },
          _cost_visual: { usd: 0.04, apifyCalls: 1, haikuCalls: 0, provider: 'apify+anthropic' },
        },
        errors: [...entity.errors, 'Visual: vision analysis failed'],
      };
    }

    // Calculate cost
    const tokens = (analysis as unknown as Record<string, unknown>)._tokens as { input: number; output: number } | undefined;
    const inputTokens = tokens?.input ?? 0;
    const outputTokens = tokens?.output ?? 0;
    // Haiku pricing: $0.80/1M input, $4/1M output. Screenshot actor: ~$0.04/run
    const haikuCost = (inputTokens * 0.80 + outputTokens * 4.0) / 1_000_000;
    const apifyCost = 0.04;
    const totalCost = haikuCost + apifyCost;

    // Clean up _tokens from the stored data
    const cleanAnalysis = { ...analysis };
    delete (cleanAnalysis as Record<string, unknown>)._tokens;

    return {
      ...entity,
      data: {
        ...entity.data,
        visual_identity: {
          ...cleanAnalysis,
          screenshot_url: screenshot.screenshotUrl,
        },
        _cost_visual: {
          usd: Math.round(totalCost * 10000) / 10000,
          apifyCalls: 1,
          haikuCalls: 1,
          inputTokens,
          outputTokens,
          provider: 'apify+anthropic',
        },
      },
    };
  } catch (err) {
    return {
      ...entity,
      data: {
        ...entity.data,
        visual_identity: { skipped: true, reason: `Error: ${err instanceof Error ? err.message : String(err)}` },
      },
      errors: [...entity.errors, `Visual: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
