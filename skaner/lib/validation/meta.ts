/**
 * Lightweight HTML meta extractor for pre-validation.
 * No cheerio dependency — uses targeted regex on first ~50KB of HTML.
 * We only need title / description / h1 / og:title / og:description to let
 * Claude judge whether a URL matches the declared category.
 */

const FETCH_TIMEOUT_MS = 8000;
const HTML_SLICE_LIMIT = 50_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; SkanerBot/1.0; +https://skaner.danielkotlinski.pl)';

export interface PageMeta {
  requestedUrl: string;
  reachable: boolean;
  /** HTTP status code (jeśli dotarliśmy) */
  status?: number;
  /** Final URL po redirectach (może się różnić od requested) */
  finalUrl?: string;
  /** Czy nastąpił redirect */
  redirected?: boolean;
  /** Opis błędu dla nieosiągalnych URL */
  error?: string;
  /** Wyekstrahowane pola (puste stringi jeśli nieznalezione) */
  title: string;
  description: string;
  h1: string;
  ogTitle: string;
  ogDescription: string;
}

/** Prosty decoder podstawowych encji HTML — wystarczy dla meta tagów. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/** Usunięcie wewnętrznych tagów HTML z extracted content (np. <h1><span>foo</span></h1>). */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractTag(html: string, tag: 'title' | 'h1'): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = html.match(regex);
  if (!match) return '';
  return decodeEntities(stripTags(match[1])).slice(0, 300);
}

function extractMetaByName(html: string, name: string): string {
  // Obsłuż oba układy: name="..." content="..." oraz content="..." name="..."
  const a = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i');
  const match = html.match(a) || html.match(b);
  if (!match) return '';
  return decodeEntities(match[1]).slice(0, 500);
}

function extractMetaByProperty(html: string, property: string): string {
  const a = new RegExp(`<meta[^>]+property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i');
  const match = html.match(a) || html.match(b);
  if (!match) return '';
  return decodeEntities(match[1]).slice(0, 500);
}

/**
 * Fetch URL and extract meta. Does 1 GET (HEAD nie zawsze pozwala wyciągnąć body,
 * a i tak chcemy meta, więc od razu GET z limitem body).
 * Zwraca obiekt z `reachable:false` zamiast rzucać — caller decyduje co zrobić.
 */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const base: PageMeta = {
    requestedUrl: url,
    reachable: false,
    title: '',
    description: '',
    h1: '',
    ogTitle: '',
    ogDescription: '',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timeout);

    base.status = res.status;
    base.finalUrl = res.url;
    base.redirected = res.url !== url && res.url !== url + '/';

    // 4xx/5xx — nie parsujemy, ale zapisujemy status
    if (!res.ok) {
      // 403/429 = strona istnieje, tylko zablokowała bota — traktujemy jako "reachable but limited"
      base.reachable = res.status === 403 || res.status === 429;
      return base;
    }

    base.reachable = true;

    // Ograniczamy rozmiar body żeby nie zjeść pamięci — 50KB wystarczy na <head>
    const text = await res.text();
    const html = text.slice(0, HTML_SLICE_LIMIT);

    base.title = extractTag(html, 'title');
    base.description = extractMetaByName(html, 'description');
    base.h1 = extractTag(html, 'h1');
    base.ogTitle = extractMetaByProperty(html, 'og:title');
    base.ogDescription = extractMetaByProperty(html, 'og:description');

    return base;
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    // Rozróżnienie timeout vs DNS/network dla lepszego komunikatu
    if (msg.includes('aborted') || msg.includes('timeout')) {
      base.error = 'Timeout — strona nie odpowiada';
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      base.error = 'Domena nie istnieje (DNS)';
    } else if (msg.includes('ECONNREFUSED')) {
      base.error = 'Serwer odrzucił połączenie';
    } else if (msg.includes('certificate')) {
      base.error = 'Nieprawidłowy certyfikat SSL';
    } else {
      base.error = msg.slice(0, 200);
    }
    return base;
  }
}
