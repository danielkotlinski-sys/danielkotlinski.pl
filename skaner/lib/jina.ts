import type { ScanCostTracker } from './costs';

const SUBPAGES_TO_TRY = [
  '/oferta', '/produkty', '/uslugi', '/shop', '/services',
  '/o-nas', '/about', '/about-us', '/o-teatrze', '/misja',
  '/repertuar', '/portfolio', '/projekty', '/klienci',
];

// Noise patterns to strip from scraped text
const NOISE_PATTERNS = [
  // Cookie banners and consent — match entire blocks, not just single lines
  /cookie[s]?\s*(?:policy|polityka|ustawienia|consent|banner|deklaracj|informacj)[^\n]*/gi,
  /(?:akceptuj|zaakceptuj|accept|zamknij).*?cookie[^\n]*/gi,
  /(?:ta |niniejsza |nasza )?(?:strona|witryna) (?:korzysta|używa|wykorzystuje) z (?:plików )?cookie[^\n]*/gi,
  /pliki cookie[^\n]*/gi,
  /ciasteczk[^\n]*/gi,
  /cookiebot[^\n]*/gi,
  /pliki tekstowe.*?(?:przeglądar|strony internet)[^\n]*/gi,
  /deklaracj[aeę].*?(?:cookie|plik)[^\n]*/gi,
  /(?:niezbędne|preferencj|statystyk|marketingow)[^\n]*?cookie[^\n]*/gi,
  /zgod[ayę] na (?:wszystkie|wybrane|pliki)[^\n]*/gi,
  /zarządzaj? (?:zgodami|preferencjami|cookies)[^\n]*/gi,
  /polityka prywatno[sś]ci[^\n]*/gi,
  /regulamin[^\n]*/gi,
  /newsletter.*?zapis[^\n]*/gi,
  /©\s*\d{4}[^\n]*/gi,
  /wszystkie prawa zastrzeżone[^\n]*/gi,
  /RODO[^\n]*/gi,
  /wyrażam zgodę na przetwarzanie[^\n]*/gi,
  /subscribe to our[^\n]*/gi,
  /powered by[^\n]*/gi,
  /skip to (?:main )?content[^\n]*/gi,
  /^#{1,3}\s*(?:menu|nawigacja|navigation|footer|stopka)\s*$/gim,
];

function cleanScrapedText(text: string): string {
  let cleaned = text;

  // Strip entire Cookiebot / cookie declaration blocks (multi-line)
  cleaned = cleaned.replace(/(?:Deklaracja|Oświadczenie) (?:dot\.|dotycząc[ea]|o) (?:plików )?cookie[\s\S]*?(?=\n#{1,3} |\n---|\Z)/gi, '');
  cleaned = cleaned.replace(/(?:^|\n)#{1,3}.*?cookie[s]?.*?\n[\s\S]*?(?=\n#{1,3} [^c]|\n---|\Z)/gi, '\n');

  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  // Remove lines that are just links or buttons (short lines with URLs)
  cleaned = cleaned.replace(/^.{0,5}https?:\/\/[^\n]*$/gm, '');
  // Remove very short lines (likely navigation items)
  cleaned = cleaned
    .split('\n')
    .filter((line) => line.trim().length > 15 || line.trim().length === 0 || line.startsWith('#'))
    .join('\n');
  return cleaned.trim();
}

async function fetchPage(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Remove-Selector': 'nav, footer, header nav, .cookie-banner, .cookie-consent, .gdpr, #cookie, #cookies, #CookiebotDialog, #cookiebot, .cookieconsent, .cc-banner, .cc-window, [id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [id*="gdpr"], [class*="gdpr"], .newsletter-popup, .popup-overlay, .modal-overlay',
      },
    });

    if (!response.ok) return '';
    const text = await response.text();
    if (text.length < 200) return '';
    return cleanScrapedText(text);
  } catch {
    return '';
  }
}

export async function fetchHomepageScreenshot(baseUrl: string, costTracker?: ScanCostTracker): Promise<string> {
  try {
    const response = await fetch(`https://r.jina.ai/${baseUrl}`, {
      headers: {
        'Accept': 'image/png',
        'X-Return-Format': 'screenshot',
        'X-Remove-Selector': 'nav, footer, header nav, .cookie-banner, .cookie-consent, .gdpr, #cookie, #cookies, #CookiebotDialog, #cookiebot, .cookieconsent, .cc-banner, .cc-window, [id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [id*="gdpr"], [class*="gdpr"], .newsletter-popup, .popup-overlay, .modal-overlay',
        'X-Wait-For-Selector': 'main, article, .hero, .content, #content, [role="main"]',
      },
    });
    if (!response.ok) return '';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    if (base64.length < 1000) return ''; // too small = error page
    console.log(`Jina: screenshot of ${baseUrl} — ${Math.round(base64.length / 1024)}KB`);
    if (costTracker) costTracker.trackJina(`screenshot: ${baseUrl}`, 'screenshot');
    return base64;
  } catch {
    console.log(`Jina: screenshot failed for ${baseUrl}`);
    return '';
  }
}

export async function fetchWebsiteText(baseUrl: string, costTracker?: ScanCostTracker): Promise<string> {
  const normalizedUrl = baseUrl.replace(/\/$/, '');

  // Fetch homepage first
  const homepage = await fetchPage(normalizedUrl);

  // Try subpages in parallel
  const subpageResults = await Promise.allSettled(
    SUBPAGES_TO_TRY.map((path) => fetchPage(`${normalizedUrl}${path}`))
  );

  const subpageTexts = subpageResults
    .map((r) => (r.status === 'fulfilled' ? r.value : ''))
    .filter((t) => t.length > 300); // Higher threshold — skip thin pages

  // Take up to 3 best subpages (longest = most content)
  const sortedSubpages = subpageTexts
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  const parts = [homepage, ...sortedSubpages];
  let combined = parts.filter(Boolean).join('\n\n---\n\n');

  // Truncate to avoid bloated payloads
  const MAX_TOTAL = 15000;
  if (combined.length > MAX_TOTAL) {
    combined = combined.slice(0, MAX_TOTAL) + '\n[...przycinanie: dalszy tekst pominięty]';
  }

  const pageCount = parts.filter(Boolean).length;
  console.log(`Jina: scraped ${normalizedUrl} — ${pageCount} pages, ${combined.length} chars`);
  if (costTracker) costTracker.trackJina(`text: ${normalizedUrl} (${pageCount} pages)`, 'reader', pageCount);
  return combined;
}
