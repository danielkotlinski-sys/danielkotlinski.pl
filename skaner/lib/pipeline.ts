import { v4 as uuidv4 } from 'uuid';
import type {
  ScannerInput,
  ScannerReport,
  BrandData,
  AtomicAnalysis,
  BrandProfile,
  BrandVisualConventions,
  CategoryConventions,
  CategoryVisualConventions,
  CategoryMap,
  ComparativeGaps,
  ClientPosition,
  BlueOceanFinale,
  HomepageVisualAnalysis,
  PostAnalysis,
  SocialSynthesis,
  LeadInfo,
  Lead,
  ProgressEvent,
  StepId,
} from '@/types/scanner';
import { fetchWebsiteText, fetchHomepageScreenshot } from './jina';
import { scrapeSocialPosts } from './apify';
import { searchExternalDiscourse } from './perplexity';
import { runPrompt, analyzePostVision, parseJsonResponse } from './anthropic';
import {
  PROMPT_1_CLAIM,
  PROMPT_2_VOCABULARY,
  PROMPT_3_POST,
  PROMPT_4_SOCIAL_SYNTHESIS,
  PROMPT_5_EXTERNAL,
  PROMPT_6_BRAND_PROFILE,
  PROMPT_HOMEPAGE_VISUAL,
  PROMPT_CATEGORY_MAP,
  PROMPT_COMPARATIVE_GAPS,
  PROMPT_VISUAL_BRAND,
  PROMPT_VISUAL_CATEGORY,
  PROMPT_7_CONVENTIONS,
  PROMPT_8_CLIENT_POSITION,
  PROMPT_9_BLUE_OCEAN,
  fillPrompt,
} from './prompts';
import { saveReport } from './redis';
import { saveLead, sendReportEmail } from './loops';

const NOTA_KONCOWA = `Konwencja to nie prawo natury — to nawyk rynku. Segment, do którego nikt nie mówi, nie zniknął. On kupuje gdzie indziej lub nie kupuje wcale. W pogłębionym Skanie Kategorii identyfikuję konkretne pragnienia tej grupy przez wywiady z klientami i analizę zachowań — i buduję dla Twojej marki narrację, która ich przyciągnie zanim konkurencja się zorientuje.`;

type ProgressCallback = (event: ProgressEvent) => void;

async function runInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

export async function runCategoryScanner(
  input: ScannerInput,
  lead: LeadInfo,
  onProgress: ProgressCallback
): Promise<{ scanId: string; report: ScannerReport }> {
  const pipelineStart = Date.now();
  const scanId = uuidv4();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://skaner.danielkotlinski.pl';
  const reportUrl = `${baseUrl}/raport/${scanId}`;

  const allBrands = [
    { ...input.clientBrand, socialPlatform: input.clientBrand.socialPlatform },
    ...input.competitors.map((c) => ({
      ...c,
      socialPlatform: input.clientBrand.socialPlatform as 'instagram' | 'facebook' | 'linkedin',
    })),
  ];

  // Save lead to Airtable
  const leadRecord: Lead = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    firstName: lead.firstName,
    email: lead.email,
    company: lead.company,
    gdprConsent: lead.gdprConsent,
    scanInput: input,
    scanId,
    reportUrl,
  };
  saveLead(leadRecord).catch((err) => console.error('Lead save error:', err));

  // === PHASE 1: DATA COLLECTION ===
  const brandData: Record<string, BrandData> = {};

  const emitStep = (stepId: StepId, status: 'running' | 'done' | 'error', detail?: string) => {
    const progressMap: Record<StepId, number> = {
      collect_websites: 10,
      collect_social: 25,
      collect_external: 35,
      analyze_atomic: 55,
      synthesize_brands: 70,
      synthesize_category: 85,
      client_position: 95,
    };
    onProgress({
      stepId,
      status,
      detail,
      progress: status === 'done' ? progressMap[stepId] : undefined,
    });
  };

  // Collect websites + homepage screenshots
  emitStep('collect_websites', 'running');
  const homepageScreenshots: Record<string, string> = {};
  await Promise.all(
    allBrands.map(async (brand) => {
      const [websiteText, screenshot] = await Promise.all([
        fetchWebsiteText(brand.url),
        fetchHomepageScreenshot(brand.url),
      ]);
      brandData[brand.name] = {
        websiteText,
        posts: [],
        externalDiscourse: '',
      };
      if (screenshot) homepageScreenshots[brand.name] = screenshot;
    })
  );
  emitStep('collect_websites', 'done', `${allBrands.length}/${allBrands.length}`);

  // Collect social media (max 2 concurrent to avoid Instagram rate-limiting)
  emitStep('collect_social', 'running');
  let totalPosts = 0;
  let brandsScraped = 0;
  const brandsWithSocial = allBrands.filter((b) => b.socialHandle);
  const socialTasks = brandsWithSocial.map(
    (brand) => async () => {
      const socialStart = Date.now();
      emitStep('collect_social', 'running', `${brand.name}...`);
      const posts = await scrapeSocialPosts(
        brand.socialHandle,
        brand.socialPlatform,
        8
      );
      brandData[brand.name].posts = posts;
      totalPosts += posts.length;
      brandsScraped++;
      const dur = ((Date.now() - socialStart) / 1000).toFixed(0);
      console.log(`Pipeline: social done for ${brand.name} — ${posts.length} posts in ${dur}s`);
      emitStep('collect_social', 'running', `${brandsScraped}/${brandsWithSocial.length} marek`);
    }
  );
  await runInBatches(socialTasks, 2);
  emitStep('collect_social', 'done', `${totalPosts} postów`);

  // Collect external discourse
  emitStep('collect_external', 'running');
  const brandCitations: Record<string, string[]> = {};
  await Promise.all(
    allBrands.map(async (brand) => {
      const { text, citations } = await searchExternalDiscourse(brand.name, input.category);
      brandData[brand.name].externalDiscourse = text;
      brandCitations[brand.name] = citations;
    })
  );
  emitStep('collect_external', 'done');

  // === PHASE 1.5: CATEGORY MAP ===
  const allExternalData = allBrands
    .map((b) => `=== ${b.name} ===\n${brandData[b.name].externalDiscourse}`)
    .join('\n\n');

  const categoryMapRaw = await runPrompt(
    fillPrompt(PROMPT_CATEGORY_MAP, {
      N: String(allBrands.length),
      CATEGORY: input.category,
      CATEGORY_PURPOSE: input.categoryPurpose || '',
      ALL_EXTERNAL_DATA: allExternalData,
    })
  );
  const categoryMap = parseJsonResponse<CategoryMap>(categoryMapRaw);

  // === PHASE 2: ATOMIC ANALYSIS ===
  emitStep('analyze_atomic', 'running');
  const atomicAnalyses: Record<string, AtomicAnalysis> = {};

  await Promise.all(
    allBrands.map(async (brand) => {
      try {
      const data = brandData[brand.name];

      // Category map context for claim analysis
      const mapContext = categoryMap
        ? `\n\nKONTEKST KATEGORII (mapa graczy):\n${JSON.stringify(categoryMap, null, 2)}\n\nUżyj tego kontekstu do weryfikacji — nie przypisuj marce cech sprzecznych z jej pozycją w kategorii.`
        : '';

      // Prompts 1 and 2 in parallel
      const [claimRaw, vocabularyRaw] = await Promise.all([
        runPrompt(
          fillPrompt(PROMPT_1_CLAIM, {
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            WEBSITE_TEXT: data.websiteText.slice(0, 12000),
          }) + mapContext
        ),
        runPrompt(
          fillPrompt(PROMPT_2_VOCABULARY, {
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            WEBSITE_TEXT: data.websiteText.slice(0, 12000),
          })
        ),
      ]);

      // Prompt 3: per post (batches of 3)
      let postAnalyses: PostAnalysis[] = [];
      let socialSynthesisResult: SocialSynthesis | null = null;

      if (data.posts.length > 0) {
        const postTasks = data.posts
          .filter((p) => p.screenshotBase64)
          .map(
            (post) => () =>
              analyzePostVision(
                post.screenshotBase64,
                post.caption,
                PROMPT_3_POST
              ).then((raw) => parseJsonResponse<PostAnalysis>(raw))
          );

        postAnalyses = await runInBatches(postTasks, 3);

        // Prompt 4: social synthesis
        const socialRaw = await runPrompt(
          fillPrompt(PROMPT_4_SOCIAL_SYNTHESIS, {
            N: String(postAnalyses.length),
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            POST_ANALYSES: JSON.stringify(postAnalyses, null, 2),
          })
        );
        socialSynthesisResult = parseJsonResponse(socialRaw);
      }

      // Prompt 5: external discourse
      const externalRaw = await runPrompt(
        fillPrompt(PROMPT_5_EXTERNAL, {
          BRAND_NAME: brand.name,
          CATEGORY: input.category,
          EXTERNAL_TEXTS: data.externalDiscourse || 'Brak danych zewnętrznych.',
        })
      );

      // Homepage visual analysis (if screenshot available)
      let homepageVisual: HomepageVisualAnalysis | undefined;
      if (homepageScreenshots[brand.name]) {
        const visualRaw = await analyzePostVision(
          homepageScreenshots[brand.name],
          '',
          fillPrompt(PROMPT_HOMEPAGE_VISUAL, {
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
          })
        );
        homepageVisual = parseJsonResponse<HomepageVisualAnalysis>(visualRaw);
      }

      atomicAnalyses[brand.name] = {
        claim: parseJsonResponse(claimRaw),
        vocabulary: parseJsonResponse(vocabularyRaw),
        socialSynthesis: socialSynthesisResult,
        externalAnalysis: parseJsonResponse(externalRaw),
        homepageVisual,
      };
      } catch (err) {
        console.error(`Atomic analysis failed for ${brand.name}:`, err);
        // Create minimal fallback so pipeline continues
        atomicAnalyses[brand.name] = {
          claim: { framingProduktu: { opis: 'Analiza niedostępna', dowod: '' }, obietnicaZmiany: { stanPrzed: '', stanPo: '', dowod: '' }, punktWejsciaKomunikacji: { typ: 'produkt', opis: 'Brak danych', dowod: '' } },
          vocabulary: { slownictwoMarki: [], sugestiaOKliencie: 'Brak danych' },
          socialSynthesis: null,
          externalAnalysis: { zewnetrzneSlownictwo: [], zgodnosc: { ocena: 'częściowa rozbieżność', opis: 'Analiza niedostępna' } },
        };
      }
    })
  );
  emitStep('analyze_atomic', 'done');

  // === PHASE 3: BRAND PROFILES ===
  emitStep('synthesize_brands', 'running');
  const brandProfiles: Record<string, BrandProfile> = {};

  await Promise.all(
    allBrands.map(async (brand) => {
      const analysis = atomicAnalyses[brand.name];
      const homepageVisualContext = analysis.homepageVisual
        ? `\n\nANALIZA WIZUALNA STRONY GŁÓWNEJ:\n${JSON.stringify(analysis.homepageVisual, null, 2)}`
        : '';
      const raw = await runPrompt(
        fillPrompt(PROMPT_6_BRAND_PROFILE, {
          BRAND_NAME: brand.name,
          CATEGORY: input.category,
          PROMPT1_RESULT: JSON.stringify(analysis.claim, null, 2),
          PROMPT2_RESULT: JSON.stringify(analysis.vocabulary, null, 2),
          PROMPT4_RESULT: analysis.socialSynthesis
            ? JSON.stringify(analysis.socialSynthesis, null, 2)
            : 'Brak danych social media dla tej marki.',
          PROMPT5_RESULT: JSON.stringify(analysis.externalAnalysis, null, 2),
        }) + homepageVisualContext,
        'claude-opus-4-5'
      );
      brandProfiles[brand.name] = parseJsonResponse<BrandProfile>(raw);
    })
  );
  // Visual conventions per brand (parallel with brand profiles)
  const brandVisuals: Record<string, BrandVisualConventions> = {};
  await Promise.all(
    allBrands.map(async (brand) => {
      const analysis = atomicAnalyses[brand.name];
      if (analysis.socialSynthesis) {
        const data = brandData[brand.name];
        const postAnalyses = data.posts.length > 0
          ? JSON.stringify(analysis.socialSynthesis, null, 2)
          : null;
        if (postAnalyses) {
          const raw = await runPrompt(
            fillPrompt(PROMPT_VISUAL_BRAND, {
              N: String(data.posts.length),
              BRAND_NAME: brand.name,
              CATEGORY: input.category,
              POST_ANALYSES: postAnalyses,
            })
          );
          brandVisuals[brand.name] = parseJsonResponse<BrandVisualConventions>(raw);
        }
      }
    })
  );
  emitStep('synthesize_brands', 'done');

  // === PHASE 4: CATEGORY SYNTHESIS ===
  emitStep('synthesize_category', 'running');

  const allProfilesText = allBrands
    .map(
      (b) =>
        `=== ${b.name} ===\n${JSON.stringify(brandProfiles[b.name], null, 2)}`
    )
    .join('\n\n');

  const conventionsRaw = await runPrompt(
    fillPrompt(PROMPT_7_CONVENTIONS, {
      N: String(allBrands.length),
      CATEGORY: input.category,
      ALL_BRAND_PROFILES: allProfilesText,
    }),
    'claude-opus-4-5'
  );
  const categoryConventions = parseJsonResponse<CategoryConventions>(conventionsRaw);

  // Visual conventions synthesis (category-level)
  let categoryVisualConventions: CategoryVisualConventions | undefined;
  const brandsWithVisuals = Object.keys(brandVisuals);
  if (brandsWithVisuals.length >= 2) {
    const allVisualText = brandsWithVisuals
      .map((name) => `=== ${name} ===\n${JSON.stringify(brandVisuals[name], null, 2)}`)
      .join('\n\n');
    const visualRaw = await runPrompt(
      fillPrompt(PROMPT_VISUAL_CATEGORY, {
        N: String(brandsWithVisuals.length),
        CATEGORY: input.category,
        ALL_VISUAL_PROFILES: allVisualText,
      })
    );
    categoryVisualConventions = parseJsonResponse<CategoryVisualConventions>(visualRaw);
  }
  // Comparative gaps (parallel with visual category synthesis)
  const gapsRaw = await runPrompt(
    fillPrompt(PROMPT_COMPARATIVE_GAPS, {
      N: String(allBrands.length),
      CATEGORY: input.category,
      ALL_BRAND_PROFILES: allProfilesText,
    })
  );
  const comparativeGaps = parseJsonResponse<ComparativeGaps>(gapsRaw);

  emitStep('synthesize_category', 'done');

  // Client position
  emitStep('client_position', 'running');

  // Build extra context for client position
  let extraContext = '';
  if (input.clientDescription) {
    extraContext += `\n\nOPIS KLIENTA (od właściciela marki):\n${input.clientDescription}`;
  }

  const clientPositionRaw = await runPrompt(
    fillPrompt(PROMPT_8_CLIENT_POSITION, {
      PROMPT7_RESULT: JSON.stringify(categoryConventions, null, 2),
      CLIENT_BRAND_NAME: input.clientBrand.name,
      CLIENT_BRAND_PROFILE: JSON.stringify(
        brandProfiles[input.clientBrand.name],
        null,
        2
      ),
    }) + extraContext,
    'claude-opus-4-5'
  );
  const clientPosition = parseJsonResponse<ClientPosition>(clientPositionRaw);

  // Blue Ocean Finale — runs after client position
  let blueOceanFinale: BlueOceanFinale | undefined;
  try {
    const blueOceanRaw = await runPrompt(
      fillPrompt(PROMPT_9_BLUE_OCEAN, {
        PROMPT7_RESULT: JSON.stringify(categoryConventions, null, 2),
        PROMPT8_RESULT: JSON.stringify(clientPosition, null, 2),
        CLIENT_BRAND_NAME: input.clientBrand.name,
        CLIENT_BRAND_PROFILE: JSON.stringify(
          brandProfiles[input.clientBrand.name],
          null,
          2
        ),
      }),
      'claude-opus-4-5'
    );
    blueOceanFinale = parseJsonResponse<BlueOceanFinale>(blueOceanRaw);
  } catch (err) {
    console.error('Blue ocean finale failed:', err);
  }

  emitStep('client_position', 'done');

  // === BUILD REPORT ===
  const report: ScannerReport = {
    meta: {
      clientBrand: input.clientBrand.name,
      category: input.category,
      brandsAnalyzed: allBrands.map((b) => b.name),
      generatedAt: new Date().toISOString(),
    },
    brandProfiles: allBrands.map((brand) => {
      const profile = brandProfiles[brand.name];
      const data = brandData[brand.name];
      const analysis = atomicAnalyses[brand.name];
      return {
        brandName: brand.name,
        isClient: brand.name === input.clientBrand.name,
        logikaSprzedazy: profile.logikaSprzedazy,
        implikowanyKlient: profile.implikowanyKlient,
        kluczoweDowody: profile.kluczoweDowody,
        samplePostScreenshots: data.posts
          .slice(0, 2)
          .map((p) => p.screenshotBase64)
          .filter(Boolean),
        sampleWebsiteQuotes: [
          analysis.claim.framingProduktu?.dowod,
          analysis.claim.obietnicaZmiany?.dowod,
        ].filter(Boolean) as string[],
        konwencjaWizualna: brandVisuals[brand.name] || undefined,
        zrodlaZewnetrzne: brandCitations[brand.name] || [],
      };
    }),
    mapaKategorii: categoryMap || undefined,
    lukiKomunikacyjne: comparativeGaps || undefined,
    konwencjaKategorii: categoryConventions,
    konwencjaWizualnaKategorii: categoryVisualConventions,
    pozycjaKlienta: clientPosition,
    blueOceanFinale,
    notaKoncowa: NOTA_KONCOWA,
  };

  // Save report to Redis
  await saveReport(scanId, report);

  // Send email
  sendReportEmail(lead.email, {
    firstName: lead.firstName,
    brandName: input.clientBrand.name,
    categoryMechanism: categoryConventions.mechanizmKategorii.regula,
    clientPositionSummary: `${clientPosition.zgodnosc.ocena}. ${clientPosition.odchylenia.znaczenieStrategiczne}`,
    openQuestion: clientPosition.pytanieOtwarte,
    reportUrl,
  }).catch((err) => console.error('Email send error:', err));

  const totalDuration = ((Date.now() - pipelineStart) / 1000).toFixed(0);
  console.log(`Pipeline: DONE — ${allBrands.length} brands, ${totalPosts} posts, ${totalDuration}s total`);

  return { scanId, report };
}
