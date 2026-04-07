/**
 * Data normalization utilities for cross-analysis.
 *
 * Canonical mappings for Polish diet catering market:
 * - City names → canonical aglomerations
 * - Diet type names → canonical diet categories
 * - Price tiers → bucketed ranges
 * - Posting frequency strings → numeric values
 */

// ---------------------------------------------------------------------------
// City normalization — ~50 main Polish agglomerations
// ---------------------------------------------------------------------------

const CITY_ALIASES: Record<string, string[]> = {
  'Warszawa': ['warszawa', 'wawa', 'wwa', 'warsaw', 'piaseczno', 'pruszków', 'legionowo', 'marki', 'ząbki', 'wołomin', 'otwock', 'grodzisk mazowiecki', 'józefów', 'konstancin-jeziorna', 'konstancin', 'wilanów', 'ursynów', 'mokotów', 'bemowo', 'białołęka', 'bielany', 'ochota', 'praga', 'śródmieście', 'targówek', 'wola', 'żoliborz', 'włochy', 'rembertów', 'wesoła', 'wawer', 'okolice warszawy', 'aglomeracja warszawska'],
  'Kraków': ['kraków', 'krakow', 'cracow', 'wieliczka', 'skawina', 'niepołomice', 'okolice krakowa'],
  'Wrocław': ['wrocław', 'wroclaw', 'breslau', 'okolice wrocławia'],
  'Poznań': ['poznań', 'poznan', 'swarzędz', 'luboń', 'okolice poznania'],
  'Gdańsk': ['gdańsk', 'gdansk', 'danzig', 'okolice gdańska'],
  'Gdynia': ['gdynia'],
  'Sopot': ['sopot'],
  'Trójmiasto': ['trójmiasto', 'trojmiasto', 'tri-city'],
  'Łódź': ['łódź', 'lodz', 'zgierz', 'pabianice', 'okolice łodzi'],
  'Katowice': ['katowice', 'okolice katowic'],
  'Śląsk': ['śląsk', 'slask', 'silesia', 'gliwice', 'zabrze', 'bytom', 'sosnowiec', 'chorzów', 'ruda śląska', 'tychy', 'dąbrowa górnicza', 'jaworzno', 'mysłowice', 'siemianowice', 'świętochłowice', 'piekary śląskie', 'aglomeracja śląska', 'górnośląski', 'gop'],
  'Szczecin': ['szczecin', 'stettin', 'okolice szczecina'],
  'Bydgoszcz': ['bydgoszcz'],
  'Lublin': ['lublin'],
  'Białystok': ['białystok', 'bialystok'],
  'Rzeszów': ['rzeszów', 'rzeszow'],
  'Toruń': ['toruń', 'torun'],
  'Kielce': ['kielce'],
  'Olsztyn': ['olsztyn'],
  'Opole': ['opole'],
  'Zielona Góra': ['zielona góra', 'zielona gora'],
  'Gorzów Wielkopolski': ['gorzów wielkopolski', 'gorzow wielkopolski', 'gorzów'],
  'Częstochowa': ['częstochowa', 'czestochowa'],
  'Radom': ['radom'],
  'Płock': ['płock', 'plock'],
  'Elbląg': ['elbląg', 'elblag'],
  'Tarnów': ['tarnów', 'tarnow'],
  'Koszalin': ['koszalin'],
  'Legnica': ['legnica'],
  'Wałbrzych': ['wałbrzych', 'walbrzych'],
  'Nowy Sącz': ['nowy sącz', 'nowy sacz'],
  'Siedlce': ['siedlce'],
  'Piła': ['piła', 'pila'],
  'Konin': ['konin'],
  'Inowrocław': ['inowrocław', 'inowroclaw'],
  'Ostrów Wielkopolski': ['ostrów wielkopolski'],
  'Leszno': ['leszno'],
  'Suwałki': ['suwałki', 'suwalki'],
  'Stalowa Wola': ['stalowa wola'],
  'Mielec': ['mielec'],
  'Zamość': ['zamość', 'zamosc'],
  'Biała Podlaska': ['biała podlaska'],
  'Chełm': ['chełm', 'chelm'],
  'Przemyśl': ['przemyśl', 'przemysl'],
};

// Build reverse lookup: lowercase alias → canonical name
const cityLookup = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
  cityLookup.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    cityLookup.set(alias.toLowerCase(), canonical);
  }
}

// Trójmiasto grouping
const TROJMIASTO = new Set(['Gdańsk', 'Gdynia', 'Sopot']);

export function normalizeCity(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (!lower || lower === 'cała polska' || lower === 'polska') return null; // too generic
  const exact = cityLookup.get(lower);
  if (exact) return exact;
  // Fuzzy: check if raw contains any known alias
  for (const [alias, canonical] of Array.from(cityLookup.entries())) {
    if (lower.includes(alias) && alias.length >= 4) return canonical;
  }
  return raw.trim(); // Return as-is if unknown
}

export function normalizeCities(raw: string[]): string[] {
  const result = new Set<string>();
  for (const city of raw) {
    const normalized = normalizeCity(city);
    if (normalized) result.add(normalized);
  }
  // Merge Trójmiasto: if any 2 of 3 are present, add Trójmiasto
  const trojCount = Array.from(result).filter(c => TROJMIASTO.has(c)).length;
  if (trojCount >= 2) result.add('Trójmiasto');
  return Array.from(result).sort();
}

// ---------------------------------------------------------------------------
// Diet type normalization — ~15 canonical categories
// ---------------------------------------------------------------------------

const DIET_ALIASES: Record<string, string[]> = {
  'standard': ['standard', 'klasyczna', 'klasyk', 'balans', 'balance', 'everyday', 'codzienna', 'basic', 'fit', 'zdrowa', 'healthy', 'optymalna', 'optimal', 'comfort', 'home', 'domowa'],
  'low-calorie': ['low calorie', 'niskokaloryczna', 'light', 'redukcja', 'odchudzanie', 'slim', 'diet', 'dietetyczna', '1200', '1000'],
  'high-protein': ['wysokobiałkowa', 'high protein', 'białkowa', 'protein', 'sport', 'sportowa', 'power', 'muscle', 'masa', 'siłowa', 'gym', 'aktywna', 'active', 'energy'],
  'vegetarian': ['wegetariańska', 'wegetarianska', 'vegetarian', 'vege', 'wege'],
  'vegan': ['wegańska', 'weganska', 'vegan', 'roślinna', 'roslinna', 'plant-based', 'plant based'],
  'keto': ['keto', 'ketogeniczna', 'ketogenic', 'ketoza', 'lchf', 'low carb', 'niskowęglowodanowa'],
  'low-ig': ['low ig', 'niski ig', 'indeks glikemiczny', 'low glycemic', 'cukrzycowa', 'diabetic', 'insulinooporność', 'hashimoto'],
  'gluten-free': ['bezglutenowa', 'gluten-free', 'gluten free', 'bez glutenu'],
  'lactose-free': ['bezlaktozowa', 'lactose-free', 'lactose free', 'bez laktozy'],
  'dash': ['dash', 'sercowa', 'kardiologiczna', 'heart'],
  'mediterranean': ['śródziemnomorska', 'srodziemnomorska', 'mediterranean', 'med'],
  'paleo': ['paleo', 'paleolityczna'],
  'elimination': ['eliminacyjna', 'elimination', 'fodmap', 'aip', 'autoimmune', 'antyalergiczna', 'anti-allergy'],
  'detox': ['detox', 'oczyszczająca', 'detoks', 'juice', 'sokowa'],
  'premium': ['premium', 'exclusive', 'chef', 'gourmet', 'lux', 'luxury'],
};

const dietLookup = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(DIET_ALIASES)) {
  for (const alias of aliases) {
    dietLookup.set(alias.toLowerCase(), canonical);
  }
}

export function normalizeDietType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // Exact match
  const exact = dietLookup.get(lower);
  if (exact) return exact;
  // Partial match: check if raw contains any known alias
  for (const [alias, canonical] of Array.from(dietLookup.entries())) {
    if (alias.length >= 4 && lower.includes(alias)) return canonical;
  }
  return 'other';
}

export function normalizeDietTypes(raw: string[]): string[] {
  const result = new Set<string>();
  for (const diet of raw) {
    result.add(normalizeDietType(diet));
  }
  return Array.from(result).sort();
}

// ---------------------------------------------------------------------------
// Price tier bucketing
// ---------------------------------------------------------------------------

export type PriceTier = 'budget' | 'economy' | 'mid' | 'premium' | 'luxury';

export function priceTier(cheapestDaily: number | null): PriceTier | null {
  if (cheapestDaily == null || cheapestDaily <= 0) return null;
  if (cheapestDaily < 45) return 'budget';
  if (cheapestDaily < 55) return 'economy';
  if (cheapestDaily < 70) return 'mid';
  if (cheapestDaily < 90) return 'premium';
  return 'luxury';
}

// ---------------------------------------------------------------------------
// Posting frequency parser: "4.2 posts/week" → 4.2
// ---------------------------------------------------------------------------

export function parsePostingFrequency(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/([\d.]+)\s*posts?\/week/i);
  if (match) return parseFloat(match[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Size tier estimation (proxy for revenue when KRS unavailable)
// ---------------------------------------------------------------------------

export type SizeTier = 'micro' | 'small' | 'medium' | 'large' | 'enterprise';

export interface SizeTierInput {
  totalFollowers: number | null;
  googleReviewCount: number | null;
  deliveryCityCount: number | null;
  dietCount: number | null;
  metaAdsCount: number | null;
  googleAdsCount: number | null;
}

export function estimateSizeTier(input: SizeTierInput): SizeTier {
  let score = 0;

  // Social reach (0-30 points)
  const f = input.totalFollowers ?? 0;
  if (f >= 100000) score += 30;
  else if (f >= 30000) score += 22;
  else if (f >= 10000) score += 15;
  else if (f >= 3000) score += 8;
  else if (f >= 500) score += 3;

  // Review volume as customer proxy (0-25 points)
  const r = input.googleReviewCount ?? 0;
  if (r >= 500) score += 25;
  else if (r >= 200) score += 18;
  else if (r >= 100) score += 12;
  else if (r >= 30) score += 6;
  else if (r >= 10) score += 2;

  // Geographic reach (0-20 points)
  const c = input.deliveryCityCount ?? 0;
  if (c >= 30) score += 20;
  else if (c >= 15) score += 15;
  else if (c >= 5) score += 10;
  else if (c >= 2) score += 5;

  // Offer breadth (0-10 points)
  const d = input.dietCount ?? 0;
  if (d >= 10) score += 10;
  else if (d >= 5) score += 6;
  else if (d >= 3) score += 3;

  // Ad activity (0-15 points)
  const a = (input.metaAdsCount ?? 0) + (input.googleAdsCount ?? 0);
  if (a >= 30) score += 15;
  else if (a >= 10) score += 10;
  else if (a >= 3) score += 5;
  else if (a >= 1) score += 2;

  // Map score to tier (max 100)
  if (score >= 70) return 'enterprise';
  if (score >= 50) return 'large';
  if (score >= 30) return 'medium';
  if (score >= 12) return 'small';
  return 'micro';
}
