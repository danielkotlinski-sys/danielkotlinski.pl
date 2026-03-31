const SUBPAGES_TO_TRY = [
  '/oferta', '/produkty', '/uslugi', '/shop',
  '/o-nas', '/about', '/about-us',
];

async function fetchPage(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(jinaUrl, {
    headers: {
      'Accept': 'text/plain',
      'X-Return-Format': 'markdown',
      'X-Remove-Selector': 'nav, footer, .cookie-banner',
    },
  });

  if (!response.ok) return '';
  const text = await response.text();
  // Filter out very short responses (likely 404 pages or redirects)
  if (text.length < 200) return '';
  return text;
}

export async function fetchWebsiteText(baseUrl: string): Promise<string> {
  const normalizedUrl = baseUrl.replace(/\/$/, '');

  // Fetch homepage first
  const homepage = await fetchPage(normalizedUrl);

  // Try subpages in parallel
  const subpageResults = await Promise.allSettled(
    SUBPAGES_TO_TRY.map((path) => fetchPage(`${normalizedUrl}${path}`))
  );

  const subpageTexts = subpageResults
    .map((r) => (r.status === 'fulfilled' ? r.value : ''))
    .filter((t) => t.length > 0);

  const parts = [homepage, ...subpageTexts.slice(0, 2)]; // max 2 subpages to keep tokens manageable
  return parts.filter(Boolean).join('\n\n---\n\n');
}
