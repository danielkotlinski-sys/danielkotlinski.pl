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
import { scrapeSocialPosts, scrapeFacebookAds, scrapeWebsitePages } from './apify';
import { crawlWebsite } from './firecrawl';
import type { WebsiteScreenshot } from '@/types/scanner';
import type { BrandAdsData, AdsAnalysis } from '@/types/scanner';
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
  PROMPT_ADS_ANALYSIS,
  fillPrompt,
} from './prompts';
import { saveReport, saveScanMeta } from './redis';
import { saveLead, sendReportEmail } from './loops';
import { ScanCostTracker } from './costs';

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
  const costs = new ScanCostTracker(scanId);
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

  // Save scan metadata to Redis (lead + input for admin panel)
  saveScanMeta({
    scanId,
    createdAt: new Date().toISOString(),
    lead,
    input,
    reportUrl,
  }).catch((err) => console.error('Scan meta save error:', err));

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

  // Collect websites + screenshots
  // Priority: Firecrawl → Apify website-content-crawler → Jina (fallback)
  emitStep('collect_websites', 'running');
  const homepageScreenshots: Record<string, string> = {};
  const allWebsiteScreenshots: Array<{ brandName: string; pages: WebsiteScreenshot[] }> = [];
  await Promise.all(
    allBrands.map(async (brand) => {
      let websiteText = '';
      let screenshots: WebsiteScreenshot[] = [];

      // 1. Try Firecrawl (cheapest, handles cookies, screenshots)
      const firecrawlResult = await crawlWebsite(brand.url, 4, costs);
      websiteText = firecrawlResult.websiteText;
      screenshots = firecrawlResult.screenshots;

      // 2. Fallback to Apify website-content-crawler if Firecrawl failed
      if (!websiteText || websiteText.length < 200) {
        console.log(`Pipeline: Firecrawl empty for ${brand.name}, trying Apify website crawler`);
        const apifyResult = await scrapeWebsitePages(brand.url, 4, costs);
        if (apifyResult.websiteText.length > websiteText.length) {
          websiteText = apifyResult.websiteText;
        }
        if (apifyResult.screenshots.length > screenshots.length) {
          screenshots = apifyResult.screenshots;
        }
      }

      // 3. Fallback to Jina for text if both failed
      if (!websiteText || websiteText.length < 200) {
        console.log(`Pipeline: Apify also empty for ${brand.name}, falling back to Jina`);
        websiteText = await fetchWebsiteText(brand.url, costs);
      }

      // 4. Fallback to Jina for screenshot if no screenshots at all
      if (screenshots.length === 0) {
        console.log(`Pipeline: no screenshots for ${brand.name}, falling back to Jina`);
        const jinaScreenshot = await fetchHomepageScreenshot(brand.url, costs);
        if (jinaScreenshot) {
          screenshots = [{ url: brand.url, title: brand.name, screenshotBase64: jinaScreenshot }];
        }
      }

      brandData[brand.name] = {
        websiteText,
        posts: [],
        externalDiscourse: '',
      };

      // Use first screenshot for homepage visual analysis
      if (screenshots.length > 0) {
        homepageScreenshots[brand.name] = screenshots[0].screenshotBase64;
      }

      // Store all screenshots for the report section
      if (screenshots.length > 0) {
        allWebsiteScreenshots.push({ brandName: brand.name, pages: screenshots });
      }
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
        12,
        costs
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

  // Collect Facebook Ads (optional — behind feature flag)
  let adsData: BrandAdsData[] | undefined;
  if (process.env.FB_ADS_ENABLED === 'true') {
    try {
      console.log('Pipeline: Facebook Ads collection enabled');
      const adsResults = await Promise.all(
        allBrands.map(async (brand) => {
          const ads = await scrapeFacebookAds(brand.name, 'PL', 15, costs);
          return {
            brandName: brand.name,
            ads: ads.map((ad) => ({
              bodyText: ad.adBodyText || '',
              linkTitle: ad.adLinkTitle || '',
              linkDescription: ad.adLinkDescription || '',
              isActive: ad.isActive ?? true,
              startDate: ad.startDate || '',
              imageBase64: ad.screenshotBase64,
              spendRange: ad.spendLower && ad.spendUpper
                ? `${ad.spendLower}-${ad.spendUpper} ${ad.currency || 'PLN'}`
                : undefined,
              impressionsRange: ad.impressionsLower && ad.impressionsUpper
                ? `${ad.impressionsLower}-${ad.impressionsUpper}`
                : undefined,
            })),
            adCount: ads.length,
            activeCount: ads.filter((a) => a.isActive).length,
          };
        })
      );
      adsData = adsResults.filter((r) => r.adCount > 0);
      console.log(`Pipeline: Facebook Ads — ${adsData.length} brands with ads, ${adsData.reduce((s, b) => s + b.adCount, 0)} total ads`);
    } catch (err) {
      console.error('Pipeline: Facebook Ads collection failed (non-fatal):', err);
      // Continue without ads data — doesn't block the report
    }
  }

  // Collect external discourse
  emitStep('collect_external', 'running');
  const brandCitations: Record<string, string[]> = {};
  await Promise.all(
    allBrands.map(async (brand) => {
      const { text, citations } = await searchExternalDiscourse(brand.name, input.category, costs);
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
    }),
    'claude-sonnet-4-5',
    costs,
    'category map'
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
            WEBSITE_TEXT: data.websiteText.slice(0, 6000),
          }) + mapContext,
          'claude-sonnet-4-5', costs, `claim: ${brand.name}`
        ),
        runPrompt(
          fillPrompt(PROMPT_2_VOCABULARY, {
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            WEBSITE_TEXT: data.websiteText.slice(0, 6000),
          }),
          'claude-sonnet-4-5', costs, `vocabulary: ${brand.name}`
        ),
      ]);

      // Prompt 3: per post (batches of 3)
      let postAnalyses: PostAnalysis[] = [];
      let socialSynthesisResult: SocialSynthesis | null = null;

      if (data.posts.length > 0) {
        // Analyze up to 8 posts with vision (to stay within timeout)
        // All 15 captions still feed into social synthesis via post analyses
        const postsWithImages = data.posts.filter((p) => p.screenshotBase64);
        const postsForVision = postsWithImages.slice(0, 8);
        const postTasks = postsForVision.map(
            (post) => () =>
              analyzePostVision(
                post.screenshotBase64,
                post.caption,
                PROMPT_3_POST,
                costs, `post vision: ${brand.name}`
              ).then((raw) => parseJsonResponse<PostAnalysis>(raw))
          );

        postAnalyses = await runInBatches(postTasks, 3);

        // Prompt 4: social synthesis — include captions from non-analyzed posts
        const extraCaptions = postsWithImages.slice(8)
          .map((p) => p.caption)
          .filter(Boolean);
        const captionContext = extraCaptions.length > 0
          ? `\n\nDODATKOWE CAPTIONY (${extraCaptions.length} postów bez analizy wizualnej):\n${extraCaptions.map((c, i) => `${i + 1}. ${c.slice(0, 300)}`).join('\n')}`
          : '';
        const socialRaw = await runPrompt(
          fillPrompt(PROMPT_4_SOCIAL_SYNTHESIS, {
            N: String(data.posts.length),
            BRAND_NAME: brand.name,
            CATEGORY: input.category,
            POST_ANALYSES: JSON.stringify(postAnalyses, null, 2),
          }) + captionContext,
          'claude-sonnet-4-5', costs, `social synthesis: ${brand.name}`
        );
        socialSynthesisResult = parseJsonResponse(socialRaw);
      }

      // Prompt 5: external discourse
      const externalRaw = await runPrompt(
        fillPrompt(PROMPT_5_EXTERNAL, {
          BRAND_NAME: brand.name,
          CATEGORY: input.category,
          EXTERNAL_TEXTS: data.externalDiscourse || 'Brak danych zewnętrznych.',
        }),
        'claude-sonnet-4-5', costs, `external: ${brand.name}`
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
          }),
          costs, `homepage visual: ${brand.name}`
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
        'claude-opus-4-5', costs, `brand profile: ${brand.name}`
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
            }),
            'claude-sonnet-4-5', costs, `visual brand: ${brand.name}`
          );
          brandVisuals[brand.name] = parseJsonResponse<BrandVisualConventions>(raw);
        }
      }
    })
  );
  // Ads analysis per brand (if ads data available)
  const brandAdsAnalyses: Record<string, AdsAnalysis> = {};
  if (adsData && adsData.length > 0) {
    await Promise.all(
      adsData.map(async (brandAds) => {
        const profile = brandProfiles[brandAds.brandName];
        if (!profile || brandAds.ads.length === 0) return;

        const adsText = brandAds.ads.map((ad, i) =>
          `[Reklama ${i + 1}]\nTreść: ${ad.bodyText || '(brak)'}\nTytuł linku: ${ad.linkTitle || '(brak)'}\nOpis: ${ad.linkDescription || '(brak)'}\nData: ${ad.startDate || '(brak)'}\nWydatki: ${ad.spendRange || '(brak)'}\nWyświetlenia: ${ad.impressionsRange || '(brak)'}`
        ).join('\n\n');

        try {
          const raw = await runPrompt(
            fillPrompt(PROMPT_ADS_ANALYSIS, {
              AD_COUNT: String(brandAds.ads.length),
              BRAND_NAME: brandAds.brandName,
              CATEGORY: input.category,
              ADS_DATA: adsText,
              ORGANIC_LOGIC: profile.logikaSprzedazy.tresc,
              ORGANIC_CLIENT: profile.implikowanyKlient.tosazmosc,
            }),
            'claude-sonnet-4-5', costs, `ads analysis: ${brandAds.brandName}`
          );
          brandAdsAnalyses[brandAds.brandName] = parseJsonResponse<AdsAnalysis>(raw);
        } catch (err) {
          console.error(`Ads analysis failed for ${brandAds.brandName}:`, err);
        }
      })
    );
    console.log(`Pipeline: Ads analysis done for ${Object.keys(brandAdsAnalyses).length} brands`);

    // Feed ads analysis into brand profiles (enrich PROMPT_6 results)
    for (const [brandName, adsAnalysis] of Object.entries(brandAdsAnalyses)) {
      const profile = brandProfiles[brandName];
      if (profile && adsAnalysis.dodatkoveWnioski?.length > 0) {
        // Add ads-derived evidence to brand profile
        for (const wniosek of adsAnalysis.dodatkoveWnioski) {
          profile.kluczoweDowody.push({
            obserwacja: wniosek,
            cytat: '',
            zrodlo: 'reklamy Meta' as 'strona' | 'social' | 'zewnętrzne' | 'media',
            znaczenie: adsAnalysis.spojnosc.ocena === 'spójna'
              ? 'Potwierdza kierunek komunikacji organicznej'
              : 'Ujawnia rozbieżność między wizerunkiem a sprzedażą',
          });
        }
      }
    }
  }

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
    'claude-opus-4-5', costs, 'conventions'
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
      }),
      'claude-sonnet-4-5', costs, 'visual category'
    );
    categoryVisualConventions = parseJsonResponse<CategoryVisualConventions>(visualRaw);
  }
  // Comparative gaps (parallel with visual category synthesis)
  const gapsRaw = await runPrompt(
    fillPrompt(PROMPT_COMPARATIVE_GAPS, {
      N: String(allBrands.length),
      CATEGORY: input.category,
      ALL_BRAND_PROFILES: allProfilesText,
    }),
    'claude-sonnet-4-5', costs, 'comparative gaps'
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
    'claude-opus-4-5', costs, 'client position'
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
      'claude-opus-4-5', costs, 'blue ocean / rupture'
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
          .slice(0, 4)
          .map((p) => p.screenshotBase64)
          .filter(Boolean),
        sampleWebsiteQuotes: [
          analysis.claim.framingProduktu?.dowod,
          analysis.claim.obietnicaZmiany?.dowod,
        ].filter(Boolean) as string[],
        konwencjaWizualna: brandVisuals[brand.name] || undefined,
        adsAnalysis: brandAdsAnalyses[brand.name] || undefined,
        adsScreenshots: adsData
          ?.find((a) => a.brandName === brand.name)
          ?.ads.map((a) => a.imageBase64)
          .filter(Boolean) as string[] | undefined,
        zrodlaZewnetrzne: brandCitations[brand.name] || [],
      };
    }),
    websiteScreenshots: allWebsiteScreenshots.length > 0 ? allWebsiteScreenshots : undefined,
    mapaKategorii: categoryMap || undefined,
    lukiKomunikacyjne: comparativeGaps || undefined,
    konwencjaKategorii: categoryConventions,
    konwencjaWizualnaKategorii: categoryVisualConventions,
    pozycjaKlienta: clientPosition,
    blueOceanFinale,
    adsData: adsData && adsData.length > 0 ? adsData : undefined,
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

  // Save cost breakdown
  await costs.save();

  const totalDuration = ((Date.now() - pipelineStart) / 1000).toFixed(0);
  console.log(`Pipeline: DONE — ${allBrands.length} brands, ${totalPosts} posts, ${totalDuration}s total`);

  return { scanId, report };
}
