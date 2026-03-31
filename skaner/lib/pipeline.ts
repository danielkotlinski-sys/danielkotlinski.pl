import { v4 as uuidv4 } from 'uuid';
import type {
  ScannerInput,
  ScannerReport,
  BrandData,
  AtomicAnalysis,
  BrandProfile,
  CategoryConventions,
  ClientPosition,
  PostAnalysis,
  SocialSynthesis,
  LeadInfo,
  Lead,
  ProgressEvent,
  StepId,
} from '@/types/scanner';
import { fetchWebsiteText } from './jina';
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
  PROMPT_7_CONVENTIONS,
  PROMPT_8_CLIENT_POSITION,
  fillPrompt,
} from './prompts';
import { saveReport } from './redis';
import { saveLead } from './airtable';
import { sendReportEmail } from './resend';

const NOTA_KONCOWA = `Konwencja pokazuje jak kategoria konkuruje dziś. Nie mówi nic o tym, czy ta logika odpowiada na to czego klienci naprawdę szukają — i kogo kategoria przez to systematycznie omija. To jest pytanie które zadaję w płatnym Skanie Kategorii — razem z mapą ukrytych motywacji i konkretnym kierunkiem dla Twojej marki.`;

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

  // Collect websites
  emitStep('collect_websites', 'running');
  await Promise.all(
    allBrands.map(async (brand) => {
      const websiteText = await fetchWebsiteText(brand.url);
      brandData[brand.name] = {
        websiteText,
        posts: [],
        externalDiscourse: '',
      };
    })
  );
  emitStep('collect_websites', 'done', `${allBrands.length}/${allBrands.length}`);

  // Collect social media
  emitStep('collect_social', 'running');
  let totalPosts = 0;
  await Promise.all(
    allBrands.map(async (brand) => {
      if (brand.socialHandle) {
        const posts = await scrapeSocialPosts(
          brand.socialHandle,
          brand.socialPlatform,
          8
        );
        brandData[brand.name].posts = posts;
        totalPosts += posts.length;
      }
    })
  );
  emitStep('collect_social', 'done', `${totalPosts} postów`);

  // Collect external discourse
  emitStep('collect_external', 'running');
  await Promise.all(
    allBrands.map(async (brand) => {
      const discourse = await searchExternalDiscourse(brand.name, input.category);
      brandData[brand.name].externalDiscourse = discourse;
    })
  );
  emitStep('collect_external', 'done');

  // === PHASE 2: ATOMIC ANALYSIS ===
  emitStep('analyze_atomic', 'running');
  const atomicAnalyses: Record<string, AtomicAnalysis> = {};

  await Promise.all(
    allBrands.map(async (brand) => {
      const data = brandData[brand.name];

      // Prompts 1 and 2 in parallel
      const [claimRaw, vocabularyRaw] = await Promise.all([
        runPrompt(
          fillPrompt(PROMPT_1_CLAIM, {
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            WEBSITE_TEXT: data.websiteText.slice(0, 8000),
          })
        ),
        runPrompt(
          fillPrompt(PROMPT_2_VOCABULARY, {
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            WEBSITE_TEXT: data.websiteText.slice(0, 8000),
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

      atomicAnalyses[brand.name] = {
        claim: parseJsonResponse(claimRaw),
        vocabulary: parseJsonResponse(vocabularyRaw),
        socialSynthesis: socialSynthesisResult,
        externalAnalysis: parseJsonResponse(externalRaw),
      };
    })
  );
  emitStep('analyze_atomic', 'done');

  // === PHASE 3: BRAND PROFILES ===
  emitStep('synthesize_brands', 'running');
  const brandProfiles: Record<string, BrandProfile> = {};

  await Promise.all(
    allBrands.map(async (brand) => {
      const analysis = atomicAnalyses[brand.name];
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
        }),
        'claude-opus-4-5'
      );
      brandProfiles[brand.name] = parseJsonResponse(raw);
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
  emitStep('synthesize_category', 'done');

  // Client position
  emitStep('client_position', 'running');
  const clientPositionRaw = await runPrompt(
    fillPrompt(PROMPT_8_CLIENT_POSITION, {
      PROMPT7_RESULT: JSON.stringify(categoryConventions, null, 2),
      CLIENT_BRAND_NAME: input.clientBrand.name,
      CLIENT_BRAND_PROFILE: JSON.stringify(
        brandProfiles[input.clientBrand.name],
        null,
        2
      ),
    }),
    'claude-opus-4-5'
  );
  const clientPosition = parseJsonResponse<ClientPosition>(clientPositionRaw);
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
        logikaSprzdazy: profile.logikaSprzdazy,
        implikowanyKlient: profile.implikowanyKlient,
        kluczoweDowody: profile.kluczoweDowody,
        samplePostScreenshots: data.posts
          .slice(0, 2)
          .map((p) => p.screenshotBase64)
          .filter(Boolean),
        sampleWebsiteQuotes: [
          analysis.claim.framingProduktu?.dowod,
          analysis.claim.obietnicaZmiany?.dowod,
          analysis.vocabulary.sugestiaOKliencie,
        ].filter(Boolean) as string[],
      };
    }),
    konwencjaKategorii: categoryConventions,
    pozycjaKlienta: clientPosition,
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

  return { scanId, report };
}
