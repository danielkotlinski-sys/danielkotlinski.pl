import { NextRequest } from 'next/server';
import { queryPerplexity } from '@/lib/perplexity';
import { batchScrapeHomepages } from '@/lib/apify';
import { runPrompt, parseJsonResponse } from '@/lib/anthropic';
import { ScanCostTracker } from '@/lib/costs';
import {
  PROMPT_SATURATION_DISCOVERY,
  PROMPT_SATURATION_EXTRACT,
  PROMPT_SATURATION_CLUSTER,
  fillPrompt,
} from '@/lib/prompts';

/**
 * Standalone test endpoint for the saturation benchmark pipeline.
 * POST /api/admin/test-saturation
 * Headers: x-admin-secret
 * Body: { "category": "catering dietetyczny", "deepBrands": [{"name": "NTFY", "websiteText": "..."}, ...] }
 *
 * If deepBrands is omitted, uses 2 dummy brands with empty text.
 * Returns step-by-step results + timing.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const category: string = body.category || 'catering dietetyczny';
  const deepBrands: Array<{ name: string; websiteText?: string }> = body.deepBrands || [
    { name: 'Marka testowa A', websiteText: 'Zdrowe jedzenie na co dzien.' },
    { name: 'Marka testowa B', websiteText: 'Dieta pudełkowa z dostawą.' },
  ];

  const costs = new ScanCostTracker('test-saturation');
  const steps: Array<{ step: string; durationMs: number; result?: unknown; error?: string }> = [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 0: Discovery
        const t0 = Date.now();
        send({ step: 'discovery', status: 'running' });
        const discoveryResult = await queryPerplexity(
          'Jesteś ekspertem od rynku. Odpowiadasz wyłącznie w poprawnym JSON.',
          fillPrompt(PROMPT_SATURATION_DISCOVERY, { CATEGORY: category }),
          costs,
          'test: discovery'
        );
        const discoveryJson = discoveryResult.content.match(/\{[\s\S]*\}/);
        const discovered: Array<{ nazwa: string; url: string }> = discoveryJson
          ? (JSON.parse(discoveryJson[0]).marki || [])
          : [];

        const analyzedNames = new Set(deepBrands.map((b) => b.name.toLowerCase()));
        const benchmarkBrands = discovered.filter(
          (d) => !analyzedNames.has(d.nazwa.toLowerCase())
        ).slice(0, 25);

        const step0 = { step: 'discovery', durationMs: Date.now() - t0, result: { total: discovered.length, benchmark: benchmarkBrands.length, brands: benchmarkBrands.map((b) => b.nazwa) } };
        steps.push(step0);
        send(step0);

        // Step 1: Batch scrape
        const t1 = Date.now();
        send({ step: 'scrape', status: 'running', count: benchmarkBrands.length });
        const benchmarkTexts = await batchScrapeHomepages(
          benchmarkBrands.map((b) => ({ name: b.nazwa, url: b.url })),
          costs
        );

        const step1 = { step: 'scrape', durationMs: Date.now() - t1, result: { scraped: Object.keys(benchmarkTexts).length, avgChars: Math.round(Object.values(benchmarkTexts).reduce((s, t) => s + t.length, 0) / Math.max(Object.keys(benchmarkTexts).length, 1)) } };
        steps.push(step1);
        send(step1);

        // Combine texts
        const allBrandTexts: Record<string, string> = {};
        for (const brand of deepBrands) {
          allBrandTexts[brand.name] = (brand.websiteText || '').slice(0, 1500);
        }
        for (const [name, text] of Object.entries(benchmarkTexts)) {
          allBrandTexts[name] = text;
        }
        const totalBrands = Object.keys(allBrandTexts).length;

        // Step 2: Extract keywords
        const t2 = Date.now();
        send({ step: 'extract', status: 'running', totalBrands });
        const allBrandsTextBlock = Object.entries(allBrandTexts)
          .map(([name, text]) => `=== ${name} ===\n${text}`)
          .join('\n\n');

        const extractRaw = await runPrompt(
          fillPrompt(PROMPT_SATURATION_EXTRACT, {
            N: String(totalBrands),
            CATEGORY: category,
            ALL_BRANDS_TEXT: allBrandsTextBlock,
          }),
          'claude-sonnet-4-5', costs, 'test: extract'
        );
        const extracted = parseJsonResponse<{ marki: Record<string, string[]> }>(extractRaw);
        const brandCount = Object.keys(extracted.marki || {}).length;
        const totalPhrases = Object.values(extracted.marki || {}).reduce((s, p) => s + p.length, 0);

        const step2 = { step: 'extract', durationMs: Date.now() - t2, result: { brandsExtracted: brandCount, totalPhrases } };
        steps.push(step2);
        send(step2);

        // Step 3: Cluster
        const t3 = Date.now();
        send({ step: 'cluster', status: 'running' });
        const extractedMarki = extracted.marki || {};
        const allPhrasesBlock = Object.entries(extractedMarki)
          .map(([name, phrases]) => `${name}: ${(phrases || []).join(', ')}`)
          .join('\n');

        const deepBrandNames = deepBrands.map((b) => b.name).join(', ');

        const clusterRaw = await runPrompt(
          fillPrompt(PROMPT_SATURATION_CLUSTER, {
            N: String(totalBrands),
            CATEGORY: category,
            ALL_PHRASES: allPhrasesBlock,
            DEEP_BRANDS: deepBrandNames,
          }),
          'claude-sonnet-4-5', costs, 'test: cluster'
        );
        const clustered = parseJsonResponse<{
          klastry: Array<{ temat: string; frazy: string[]; nasycenie: Record<string, number> }>;
          pustePola: Array<{ temat: string; dlaczegoWazny: string }>;
          overlap: { sredniOverlap: number; paryNajblizsze: Array<{ marka1: string; marka2: string; overlap: number }> };
          uniqueness: Record<string, { score: number; unikalneFrazy: string[] }>;
        }>(clusterRaw);

        // Compute benchmark scores server-side
        const deepNameSet = new Set(deepBrands.map((b) => b.name));
        for (const klaster of (clustered.klastry || [])) {
          const clusterPhrases = new Set((klaster.frazy || []).map((f) => f.toLowerCase()));
          const benchmarkNames = Object.keys(extractedMarki).filter((n) => !deepNameSet.has(n));
          for (const bn of benchmarkNames) {
            if (klaster.nasycenie[bn] !== undefined) continue;
            const brandPhrases = extractedMarki[bn] || [];
            const matches = brandPhrases.filter((p) =>
              clusterPhrases.has(p.toLowerCase()) ||
              Array.from(clusterPhrases).some((cp) => p.toLowerCase().includes(cp) || cp.includes(p.toLowerCase()))
            ).length;
            const maxPhrases = Math.max(brandPhrases.length, 1);
            klaster.nasycenie[bn] = Math.min(100, Math.round((matches / maxPhrases) * 100 * 2));
          }
        }

        const topics = (clustered.klastry || []).map((k) => ({
          temat: k.temat,
          brandsWithScore: Object.keys(k.nasycenie || {}).length,
          sampleScores: Object.fromEntries(Object.entries(k.nasycenie || {}).slice(0, 5)),
        }));

        const step3 = {
          step: 'cluster',
          durationMs: Date.now() - t3,
          result: {
            topics: topics.length,
            topicNames: topics.map((t) => t.temat),
            pustePola: (clustered.pustePola || []).map((p) => p.temat),
            overlap: clustered.overlap,
            sampleTopics: topics.slice(0, 3),
          },
        };
        steps.push(step3);
        send(step3);

        // Final summary
        const summary = {
          step: 'done',
          totalDurationMs: steps.reduce((s, st) => s + st.durationMs, 0),
          steps: steps.map((s) => ({ step: s.step, durationMs: s.durationMs })),
          costs: costs.getSummary(),
        };
        send(summary);

      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        send({ step: 'error', error, stack: err instanceof Error ? err.stack : undefined });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
