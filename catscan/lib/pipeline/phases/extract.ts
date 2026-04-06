/** Phase: Extract — Claude Haiku structured extraction from crawled content */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import type { EntityRecord } from '@/lib/db/store';

const EXTRACTION_PROMPT = `You are a market intelligence analyst extracting structured data about a Polish diet catering company from their website content.

Extract ALL of the following dimensions. Return ONLY valid JSON, no markdown, no explanation.

{
  "brand_identity": {
    "brand_name": "string — primary brand name",
    "tagline": "string or null",
    "positioning": "string — one sentence: who they target and what they promise",
    "language": "pl | en | both"
  },
  "messaging": {
    "headline": "string or null — main hero headline on the homepage",
    "subheadline": "string or null — supporting text under the headline",
    "primary_cta": "string or null — text of the main call-to-action button, e.g. 'Zamów dietę'",
    "value_proposition": "string or null — the core promise in one sentence",
    "social_proof_type": "reviews | counter | logos | celebrities | none — dominant social proof format used",
    "emotional_register": "premium | friendly | clinical | motivational | neutral",
    "claims": ["array of specific promises found on site, e.g. 'świeże składniki', 'dostawa o 6 rano', 'bez konserwantów'"],
    "cliche_score": "number 0-10 — how generic/cliché is the messaging (10 = very generic, 0 = very original)"
  },
  "pricing": {
    "price_range_pln": "string — e.g. '45-89 PLN/dzień'",
    "cheapest_daily": "number or null — cheapest daily price in PLN",
    "most_expensive_daily": "number or null",
    "trial_offer": "string or null — description of trial/first order discount",
    "subscription_discount": "boolean or null"
  },
  "menu": {
    "diet_types": ["list of diet names offered, e.g. 'Standard', 'Keto', 'Vege'"],
    "calorie_options": [1200, 1500, 2000, 2500, "IMPORTANT: these are the DAILY calorie plan options customers can choose (like 1200, 1500, 2000, 2500, 3000 kcal/day), NOT individual meal calories. Look for plan/package kcal options."],
    "cuisine_style": "string or null — Polish, Mediterranean, Asian, mixed",
    "dietary_restrictions": ["vegan", "gluten-free", "lactose-free", "etc."]
  },
  "delivery": {
    "delivery_model": "own_fleet | courier | mixed | unknown",
    "delivery_cities": ["IMPORTANT: extract EVERY city mentioned on the site — list ALL of them, even if there are dozens. e.g. 'Warszawa', 'Kraków', 'Wrocław', 'Gdańsk'... Do not summarize as 'cała Polska' unless that is literally the only thing stated."],
    "delivery_time": "string or null — e.g. 'do 6:00 rano'",
    "weekend_delivery": "boolean or null"
  },
  "technology": {
    "has_online_ordering": "boolean",
    "has_mobile_app": "boolean or null",
    "has_meal_customization": "boolean or null",
    "payment_methods": ["list or empty"]
  },
  "social_proof": {
    "testimonials_visible": "boolean",
    "media_mentions": ["list of media names or empty"],
    "certifications": ["list or empty"],
    "dietitian_team": "boolean or null"
  },
  "contact": {
    "city": "string or null — main HQ city",
    "phone": "string or null",
    "email": "string or null",
    "nip": "string or null — Polish tax ID if visible on site"
  },
  "seo": {
    "title_tag": "string or null — content of <title> tag",
    "meta_description": "string or null — content of meta description",
    "h1": "string or null — main H1 heading",
    "keyword_focus": ["array of primary keywords the site seems to target, e.g. 'dieta pudełkowa', 'catering dietetyczny Warszawa'"],
    "has_local_seo": "boolean — true if site mentions specific cities/regions for SEO",
    "content_strategy": "no-blog | occasional | regular | aggressive — based on blog presence and volume"
  },
  "website_structure": {
    "page_count_estimate": "number or null — rough count of pages/subpages visible in navigation",
    "has_blog": "boolean",
    "has_calculator": "boolean — e.g. BMI/BMR/calorie calculator",
    "has_live_chat": "boolean — live chat widget or chatbot visible",
    "ordering_ux": "on-site | redirect-dietly | phone | form — how users actually place orders",
    "tech_signals": ["array of detected technologies, e.g. 'WordPress', 'Dietly', 'Shopify', 'custom', 'React', 'Next.js'"]
  },
  "content_marketing": {
    "has_lead_magnet": "boolean — free ebook, PDF guide, quiz etc.",
    "has_newsletter": "boolean — newsletter signup form visible",
    "has_youtube": "boolean — embedded YouTube videos or link to YouTube channel"
  },
  "customer_acquisition": {
    "referral_program": "boolean — refer-a-friend program mentioned",
    "affiliate_program": "boolean — affiliate/partner program mentioned",
    "b2b_offering": "boolean — corporate/B2B catering offering mentioned",
    "dietly_promoted": "boolean — Dietly platform prominently featured or used for ordering"
  },
  "differentiators": {
    "unique_claims": ["array of claims that set this brand apart, e.g. 'jedyny catering z dietą FODMAP', 'własna farma ekologiczna'"],
    "competitive_advantage_type": "price | quality | convenience | niche | brand | none — the primary axis of differentiation",
    "niche_focus": "string or null — specific niche if any, e.g. 'sportowcy', 'kobiety w ciąży', 'wegetarianie'"
  },
  "communication_corpus": "string — IMPORTANT: verbatim copy of ALL communication-relevant text from the website, concatenated. Include: hero headline + subheadline, about us / o nas section, 'dlaczego my' / why us section, benefits list, brand manifesto if present, diet descriptions (the marketing copy, not nutritional specs), blog post titles (up to 10), testimonial quotes (up to 5), any slogans or taglines found across the site. Preserve original wording — do NOT summarize, paraphrase, or translate. Separate sections with ' | '. Target: 1000-2500 characters. This field is used for downstream semantic analysis, so faithfulness to original wording is critical."
}

Important:
- Use null for fields you cannot determine from the content
- For lists, use empty array [] if no data found
- calorie_options MUST be an array of integers like [1200, 1500, 2000], NOT strings
- delivery_cities: list EVERY city individually, do not summarize
- claims and unique_claims: be specific, quote actual text from the site
- Prices in PLN only
- All text fields in Polish if the source is Polish
- Be precise, don't hallucinate data not present in the source
- cliche_score: 0 = truly original messaging, 10 = entirely generic diet catering clichés
- communication_corpus: copy-paste verbatim text from the site, do NOT rewrite or summarize. This is a raw text dump for later semantic analysis. Include hero copy, about us, why us, benefits, diet descriptions (marketing copy), blog titles, testimonials. Separate with ' | '. If the site has very little text, include everything available.`;

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export async function extractEntity(entity: EntityRecord): Promise<EntityRecord> {
  if (!entity.rawHtml || entity.status === 'failed') {
    return entity;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ...entity,
      status: 'failed',
      errors: [...entity.errors, 'ANTHROPIC_API_KEY not set — cannot extract'],
    };
  }

  try {
    // Truncate HTML to avoid exceeding context window (~60K chars ≈ ~15K tokens)
    const truncatedContent = (entity.rawHtml || '').slice(0, 60000);

    const requestBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\n--- WEBSITE CONTENT FOR: ${entity.name} (${entity.url}) ---\n\n${truncatedContent}`,
        },
      ],
    };

    const inputFile = `/tmp/extract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
    writeFileSync(inputFile, JSON.stringify(requestBody));

    let raw: string;
    try {
      raw = execSync(
        `curl -s -m 120 https://api.anthropic.com/v1/messages -H ${shellEscape('x-api-key: ' + apiKey)} -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' -d @${inputFile}`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 130000 }
      ).toString('utf-8');
    } finally {
      try { unlinkSync(inputFile); } catch { /* ignore */ }
    }

    let response: Record<string, unknown>;
    try {
      response = JSON.parse(raw);
    } catch {
      return {
        ...entity,
        errors: [...entity.errors, `Extract: Invalid JSON from API: ${raw.slice(0, 200)}`],
      };
    }

    if (response.error) {
      const errObj = response.error as Record<string, string>;
      return {
        ...entity,
        errors: [...entity.errors, `Extract API error: ${errObj.message || JSON.stringify(errObj)}`],
      };
    }

    const content = response.content as Array<{ type: string; text: string }> | undefined;
    const text = content && content.length > 0 && content[0].type === 'text'
      ? content[0].text
      : '';

    // Try to parse JSON — handle markdown code blocks
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonStr.trim());
    } catch {
      return {
        ...entity,
        errors: [...entity.errors, `Extract JSON parse error. Raw response: ${text.slice(0, 200)}`],
      };
    }

    // Merge _contact_raw from crawl phase into extracted contact data
    const contactRaw = entity.data._contact_raw as Record<string, string | null> | undefined;
    if (contactRaw) {
      const extractedContact = (extracted.contact || {}) as Record<string, string | null>;
      extracted.contact = {
        ...extractedContact,
        // Crawl-phase data takes priority for structured fields (regex-extracted, more reliable)
        phone: contactRaw.phone || extractedContact.phone || null,
        email: contactRaw.email || extractedContact.email || null,
        nip: contactRaw.nip || extractedContact.nip || null,
        // Keep city from LLM extraction (crawl doesn't extract it)
        city: extractedContact.city || null,
      };
    }

    const usage = response.usage as { input_tokens: number; output_tokens: number } | undefined;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    // Haiku pricing: $0.80/1M input, $4/1M output
    const cost = (inputTokens * 0.80 + outputTokens * 4.0) / 1_000_000;

    return {
      ...entity,
      data: {
        ...entity.data,
        ...extracted,
        _extraction: {
          model: 'claude-haiku-4-5-20251001',
          inputTokens,
          outputTokens,
          costUsd: Math.round(cost * 10000) / 10000,
          extractedAt: new Date().toISOString(),
        },
      },
      status: 'extracted',
    };
  } catch (err) {
    return {
      ...entity,
      errors: [...entity.errors, `Extraction error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
