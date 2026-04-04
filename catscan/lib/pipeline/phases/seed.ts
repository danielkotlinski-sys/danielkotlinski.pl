/**
 * Phase: Seed — build master brand list for Polish diet catering market.
 *
 * Source 1: Dietly.pl sitemap → ~198 brands with rich metadata
 * Source 2: DuckDuckGo search "catering dietetyczny [miasto]" × top cities
 * Source 3: DuckDuckGo ranking articles
 *
 * Output: deduplicated brand list saved to data/brands.json
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');

export interface Brand {
  slug: string;           // unique key (domain or dietly slug)
  name: string;           // brand name
  domain: string | null;  // company website domain (without protocol)
  url: string | null;     // full URL to company website
  dietlySlug: string | null;
  dietlyUrl: string | null;
  source: string;         // 'dietly' | 'search' | 'ranking'
  // Dietly metadata (if available)
  dietly?: {
    rating: number | null;
    reviewCount: number | null;
    positivePercent: number | null;
    priceRange: string | null;
    city: string | null;
    email: string | null;
    description: string | null;
    dietCount: number | null;
    badge: string | null;
    awarded: boolean;
  };
  seededAt: string;
}

function curlFetch(url: string, timeoutSec = 20): string | null {
  try {
    const result = execSync(
      `curl -sL -m ${timeoutSec} -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' '${url}'`,
      { maxBuffer: 20 * 1024 * 1024, timeout: (timeoutSec + 5) * 1000 }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

function extractDomain(urlStr: string): string | null {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 1: Dietly sitemap
// ---------------------------------------------------------------------------

function getDietlySlugs(): string[] {
  console.log('[seed] Fetching Dietly sitemap...');
  const xml = curlFetch('https://dietly.pl/sitemap-rest.xml', 30);
  if (!xml) {
    console.warn('[seed] Failed to fetch Dietly sitemap');
    return [];
  }
  const slugs: string[] = [];
  const regex = /catering-dietetyczny-firma\/([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    slugs.push(m[1]);
  }
  console.log(`[seed] Found ${slugs.length} slugs in Dietly sitemap`);
  return Array.from(new Set(slugs));
}

function fetchDietlyBrand(slug: string): Brand | null {
  const pageUrl = `https://dietly.pl/catering-dietetyczny-firma/${slug}`;
  const html = curlFetch(pageUrl, 25);
  if (!html) return null;

  // Extract __NEXT_DATA__
  const marker = '__NEXT_DATA__';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  const start = html.indexOf('>', idx) + 1;
  const end = html.indexOf('</script>', start);
  if (start <= 0 || end < 0) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(html.substring(start, end));
  } catch {
    return null;
  }

  const pageProps = (data as any)?.props?.pageProps?.props;
  if (!pageProps) return null;

  const fd = pageProps.fullDetails;
  if (!fd) return null;

  const header = fd.companyHeader || {};
  const contact = fd.contactDetails || {};

  // Extract domain from logo URL (most reliable source)
  let domain: string | null = null;
  let url: string | null = null;

  const logoUrl: string = contact.logo || header.logoUrl || '';
  if (logoUrl) {
    const logoDomain = extractDomain(logoUrl);
    // Skip CDN domains — we want the company domain
    if (logoDomain && !logoDomain.includes('ml-assets') && !logoDomain.includes('dietly')) {
      domain = logoDomain;
      url = `https://${domain}`;
    }
  }

  const name: string = contact.fullName || header.name || slug;

  return {
    slug: domain || slug,
    name,
    domain,
    url,
    dietlySlug: slug,
    dietlyUrl: pageUrl,
    source: 'dietly',
    dietly: {
      rating: header.feedbackValue ?? header.rate ?? null,
      reviewCount: header.feedbackNumber ?? null,
      positivePercent: header.rateValue ?? null,
      priceRange: contact.priceRangeInfo || null,
      city: contact.address?.cityName || null,
      email: contact.email || null,
      description: (contact.description || '').substring(0, 500) || null,
      dietCount: fd.companyDiets?.length ?? null,
      badge: header.badgeUrl ? 'dietly-awards' : null,
      awarded: !!header.badgeUrl,
    },
    seededAt: new Date().toISOString(),
  };
}

async function seedFromDietly(onProgress?: (msg: string) => void): Promise<Brand[]> {
  const slugs = getDietlySlugs();
  const brands: Brand[] = [];
  let failed = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    if (i % 20 === 0) {
      const msg = `[seed/dietly] ${i}/${slugs.length} brands fetched (${brands.length} OK, ${failed} failed)`;
      console.log(msg);
      onProgress?.(msg);
    }

    const brand = fetchDietlyBrand(slug);
    if (brand) {
      brands.push(brand);
    } else {
      failed++;
    }

    // Rate limit: 300ms between requests
    if (i < slugs.length - 1) {
      execSync('sleep 0.3');
    }
  }

  console.log(`[seed/dietly] Done: ${brands.length} brands, ${failed} failed`);
  return brands;
}

// ---------------------------------------------------------------------------
// Source 2: DuckDuckGo search
// ---------------------------------------------------------------------------

const TOP_CITIES = [
  'warszawa', 'kraków', 'wrocław', 'poznań', 'gdańsk', 'łódź', 'katowice',
  'szczecin', 'bydgoszcz', 'lublin', 'białystok', 'gdynia', 'rzeszów',
  'toruń', 'kielce', 'olsztyn', 'opole', 'radom', 'częstochowa', 'sosnowiec',
  'gliwice', 'zabrze', 'bielsko-biała', 'bytom', 'zielona góra', 'rybnik',
  'ruda śląska', 'tychy', 'dąbrowa górnicza', 'elbląg', 'płock', 'tarnów',
  'chorzów', 'koszalin', 'kalisz', 'legnica', 'grudziądz', 'jaworzno',
  'słupsk', 'jastrzębie-zdrój', 'nowy sącz', 'siedlce', 'mysłowice',
  'piła', 'piotrków trybunalski', 'inowrocław', 'lubin', 'ostrów wielkopolski',
  'suwałki', 'gniezno',
];

function searchDDG(query: string): string[] {
  const encoded = encodeURIComponent(query);
  const html = curlFetch(`https://html.duckduckgo.com/html/?q=${encoded}`, 15);
  if (!html) return [];

  const domains: string[] = [];
  // Extract URLs from DuckDuckGo results
  const urlRegex = /uddg=([^&"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(m[1]);
      const domain = extractDomain(decoded);
      if (domain) domains.push(domain);
    } catch { /* skip */ }
  }
  return domains;
}

const SKIP_DOMAINS = new Set([
  'dietly.pl', 'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com',
  'linkedin.com', 'twitter.com', 'x.com', 'wikipedia.org', 'google.com',
  'google.pl', 'allegro.pl', 'olx.pl', 'ceneo.pl', 'zomato.com',
  'tripadvisor.com', 'pyszne.pl', 'glovo.com', 'ubereats.com',
  'yelp.com', 'trustpilot.com', 'gowork.pl', 'praca.pl', 'pracuj.pl',
  'oferteo.pl', 'panoramafirm.pl', 'aleo.com', 'regon.stat.gov.pl',
  'ceidg.gov.pl', 'krs-online.com.pl', 'rejestr.io', 'biznesradar.pl',
  'money.pl', 'bankier.pl', 'wp.pl', 'onet.pl', 'interia.pl', 'gazeta.pl',
]);

function isDietCateringDomain(domain: string): boolean {
  if (SKIP_DOMAINS.has(domain)) return false;
  // Skip generic/news/gov sites
  if (domain.endsWith('.gov.pl')) return false;
  if (domain.endsWith('.edu.pl')) return false;
  return true;
}

async function seedFromSearch(
  existingDomains: Set<string>,
  onProgress?: (msg: string) => void
): Promise<Brand[]> {
  const brands: Brand[] = [];
  const foundDomains = new Set<string>(existingDomains);

  // Search for catering dietetyczny per city
  const queries: string[] = [];
  for (const city of TOP_CITIES) {
    queries.push(`catering dietetyczny ${city}`);
  }
  // Add ranking queries
  queries.push(
    'ranking cateringów dietetycznych 2025',
    'ranking cateringów dietetycznych 2026',
    'najlepsze cateringi dietetyczne polska',
    'top 10 catering dietetyczny',
    'najlepszy catering dietetyczny opinie',
    'dieta pudełkowa ranking',
    'catering dietetyczny porównanie',
  );

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (i % 10 === 0) {
      const msg = `[seed/search] ${i}/${queries.length} queries, ${brands.length} new brands found`;
      console.log(msg);
      onProgress?.(msg);
    }

    const domains = searchDDG(query);
    for (const domain of domains) {
      if (!isDietCateringDomain(domain)) continue;
      if (foundDomains.has(domain)) continue;
      foundDomains.add(domain);

      // Use domain as brand name (will be refined in crawl phase)
      const nameParts = domain.replace(/\.pl$|\.com$|\.eu$/, '').split('.');
      const name = nameParts[nameParts.length - 1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      brands.push({
        slug: domain,
        name,
        domain,
        url: `https://${domain}`,
        dietlySlug: null,
        dietlyUrl: null,
        source: 'search',
        seededAt: new Date().toISOString(),
      });
    }

    // Rate limit: 1.5s between DDG queries to avoid blocks
    if (i < queries.length - 1) {
      execSync('sleep 1.5');
    }
  }

  console.log(`[seed/search] Done: ${brands.length} new brands from search`);
  return brands;
}

// ---------------------------------------------------------------------------
// Source 2b: Dietly city pages (catch brands not in sitemap)
// ---------------------------------------------------------------------------

async function seedFromDietlyCities(
  existingSlugs: Set<string>,
  onProgress?: (msg: string) => void
): Promise<Brand[]> {
  const brands: Brand[] = [];
  const cities = ['warszawa', 'krakow', 'gdansk', 'poznan', 'wroclaw',
    'katowice', 'lodz', 'lublin', 'szczecin', 'bydgoszcz', 'rzeszow',
    'bialystok', 'kielce', 'olsztyn', 'opole', 'zielonagora'];

  for (const city of cities) {
    const html = curlFetch(`https://dietly.pl/catering-dietetyczny/${city}`, 20);
    if (!html) continue;

    const marker = '__NEXT_DATA__';
    const idx = html.indexOf(marker);
    if (idx < 0) continue;

    const start = html.indexOf('>', idx) + 1;
    const end = html.indexOf('</script>', start);
    if (start <= 0 || end < 0) continue;

    let data: any;
    try {
      data = JSON.parse(html.substring(start, end));
    } catch { continue; }

    const pp = data?.props?.pageProps;
    const ist = pp?.initialState;
    const api = ist?.dietlyApi?.queries;
    if (!api) continue;

    for (const key of Object.keys(api)) {
      if (!key.includes('SearchFull')) continue;
      const d = api[key]?.data;
      if (!d) continue;

      const totalPages = d.totalPages || 1;
      const searchData = d.searchData || [];

      for (const c of searchData) {
        const slug = c.name;
        if (existingSlugs.has(slug)) continue;
        existingSlugs.add(slug);

        brands.push({
          slug,
          name: c.fullName || slug,
          domain: null,
          url: null,
          dietlySlug: slug,
          dietlyUrl: `https://dietly.pl/catering-dietetyczny-firma/${slug}`,
          source: 'dietly-city',
          dietly: {
            rating: c.rate ?? null,
            reviewCount: c.numberOfRates ?? null,
            positivePercent: c.positiveMealsReviewPercent ?? null,
            priceRange: null,
            city,
            email: null,
            description: (c.shortDescription || '').substring(0, 500) || null,
            dietCount: c.numberOfDiets ?? null,
            badge: c.badgeUrl ? 'dietly-awards' : null,
            awarded: !!c.awarded,
          },
          seededAt: new Date().toISOString(),
        });
      }

      // Fetch remaining pages
      for (let page = 2; page <= totalPages; page++) {
        execSync('sleep 0.5');
        const pageHtml = curlFetch(
          `https://dietly.pl/catering-dietetyczny/${city}?page=${page}`, 20
        );
        if (!pageHtml) break;

        const pIdx = pageHtml.indexOf(marker);
        if (pIdx < 0) break;
        const pStart = pageHtml.indexOf('>', pIdx) + 1;
        const pEnd = pageHtml.indexOf('</script>', pStart);
        if (pStart <= 0 || pEnd < 0) break;

        let pData: any;
        try { pData = JSON.parse(pageHtml.substring(pStart, pEnd)); } catch { break; }

        const pApi = pData?.props?.pageProps?.initialState?.dietlyApi?.queries;
        if (!pApi) break;

        for (const pk of Object.keys(pApi)) {
          if (!pk.includes('SearchFull')) continue;
          const sd = pApi[pk]?.data?.searchData || [];
          for (const c of sd) {
            const s = c.name;
            if (existingSlugs.has(s)) continue;
            existingSlugs.add(s);

            brands.push({
              slug: s,
              name: c.fullName || s,
              domain: null,
              url: null,
              dietlySlug: s,
              dietlyUrl: `https://dietly.pl/catering-dietetyczny-firma/${s}`,
              source: 'dietly-city',
              dietly: {
                rating: c.rate ?? null,
                reviewCount: c.numberOfRates ?? null,
                positivePercent: c.positiveMealsReviewPercent ?? null,
                priceRange: null,
                city,
                email: null,
                description: (c.shortDescription || '').substring(0, 500) || null,
                dietCount: c.numberOfDiets ?? null,
                badge: c.badgeUrl ? 'dietly-awards' : null,
                awarded: !!c.awarded,
              },
              seededAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    execSync('sleep 0.5');
  }

  const msg = `[seed/dietly-cities] Done: ${brands.length} extra brands from city pages`;
  console.log(msg);
  onProgress?.(msg);
  return brands;
}

// ---------------------------------------------------------------------------
// Main: run all sources, deduplicate, save
// ---------------------------------------------------------------------------

function deduplicateBrands(brands: Brand[]): Brand[] {
  const byDomain = new Map<string, Brand>();
  const bySlug = new Map<string, Brand>();

  for (const b of brands) {
    // Prefer dedup by domain
    if (b.domain) {
      const existing = byDomain.get(b.domain);
      if (!existing || b.source === 'dietly') {
        // Dietly source has richer data, prefer it
        byDomain.set(b.domain, b);
      }
    } else if (b.dietlySlug) {
      // No domain yet — dedup by dietly slug
      if (!bySlug.has(b.dietlySlug)) {
        bySlug.set(b.dietlySlug, b);
      }
    } else {
      // Fallback: keep by slug
      if (!byDomain.has(b.slug) && !bySlug.has(b.slug)) {
        bySlug.set(b.slug, b);
      }
    }
  }

  // Merge: remove slug entries that match domain entries by dietlySlug
  const domainDietlySlugs = new Set<string>();
  Array.from(byDomain.values()).forEach(b => {
    if (b.dietlySlug) domainDietlySlugs.add(b.dietlySlug);
  });

  const result: Brand[] = Array.from(byDomain.values());
  Array.from(bySlug.entries()).forEach(([slug, b]) => {
    if (!domainDietlySlugs.has(slug)) {
      result.push(b);
    }
  });

  return result;
}

function saveBrands(brands: Brand[]) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(
    join(DATA_DIR, 'brands.json'),
    JSON.stringify(brands, null, 2)
  );
}

export function loadBrands(): Brand[] {
  const fp = join(DATA_DIR, 'brands.json');
  if (!existsSync(fp)) return [];
  return JSON.parse(readFileSync(fp, 'utf-8'));
}

export async function runSeed(
  options: {
    dietly?: boolean;
    search?: boolean;
    onProgress?: (msg: string) => void;
  } = {}
): Promise<Brand[]> {
  const { dietly = true, search = true, onProgress } = options;

  let allBrands: Brand[] = [];

  // Step 1: Dietly sitemap (detailed data per brand)
  if (dietly) {
    onProgress?.('[seed] Step 1: Fetching brands from Dietly sitemap...');
    const dietlyBrands = await seedFromDietly(onProgress);
    allBrands.push(...dietlyBrands);

    // Step 1b: Dietly city pages (catch any missing from sitemap)
    onProgress?.('[seed] Step 1b: Checking Dietly city pages for extras...');
    const dietlySlugs = new Set(dietlyBrands.map(b => b.dietlySlug).filter(Boolean) as string[]);
    const cityBrands = await seedFromDietlyCities(dietlySlugs, onProgress);
    allBrands.push(...cityBrands);
  }

  // Step 2: DuckDuckGo search
  if (search) {
    onProgress?.('[seed] Step 2: Searching DuckDuckGo for more brands...');
    const existingDomains = new Set(
      allBrands.map(b => b.domain).filter(Boolean) as string[]
    );
    const searchBrands = await seedFromSearch(existingDomains, onProgress);
    allBrands.push(...searchBrands);
  }

  // Deduplicate
  onProgress?.('[seed] Deduplicating...');
  const unique = deduplicateBrands(allBrands);

  // Sort: Dietly first (richer data), then by name
  unique.sort((a, b) => {
    if (a.source === 'dietly' && b.source !== 'dietly') return -1;
    if (a.source !== 'dietly' && b.source === 'dietly') return 1;
    return a.name.localeCompare(b.name, 'pl');
  });

  // Save
  saveBrands(unique);
  const msg = `[seed] DONE: ${unique.length} unique brands saved to data/brands.json`;
  console.log(msg);
  onProgress?.(msg);

  return unique;
}
