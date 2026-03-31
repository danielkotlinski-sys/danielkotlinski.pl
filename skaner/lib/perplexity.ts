export interface PerplexityResult {
  content: string;
  citations: string[];
  query: string;
}

async function queryPerplexity(
  systemPrompt: string,
  userQuery: string
): Promise<PerplexityResult> {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery },
        ],
        max_tokens: 1000,
        return_citations: true,
      }),
    });

    if (!response.ok) {
      console.error(`Perplexity error: ${response.status}`);
      return { content: '', citations: [], query: userQuery };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations: string[] = data.citations || [];
    return { content, citations, query: userQuery };
  } catch (error) {
    console.error('Perplexity search failed:', error);
    return { content: '', citations: [], query: userQuery };
  }
}

const SYSTEM_PROMPT = `Jesteś analitykiem badającym markę/instytucję. Podawaj konkretne fakty, cytaty i obserwacje. Zaznaczaj źródło każdej informacji. Nie generalizuj — jeśli nie masz pewnych danych, napisz wprost. Odpowiadaj po polsku.`;

export async function searchExternalDiscourse(
  brandName: string,
  category: string
): Promise<{ text: string; citations: string[] }> {
  // 4 targeted queries for comprehensive research
  const queries = [
    // Q1: Brand identity & profile
    `Kim jest "${brandName}"? Historia, misja, pozycjonowanie, czym się wyróżnia w kategorii "${category}". Szukaj na Wikipedia, stronie marki, w artykułach prasowych.`,

    // Q2: Media discourse — press, interviews
    `"${brandName}" wywiady, artykuły prasowe, profil medialny. Co mówią o sobie w mediach? Jak są opisywani przez dziennikarzy i krytyków? Szukaj w prasie branżowej i ogólnej.`,

    // Q3: Customer/audience perception
    `"${brandName}" opinie, recenzje, komentarze klientów lub odbiorców. Jak postrzegają tę markę/instytucję jej klienci? Co chwalą, co krytykują? Szukaj na forach, Google Reviews, social media.`,

    // Q4: Competitive context
    `"${brandName}" na tle konkurencji w kategorii "${category}". Czym się różni od innych podmiotów? Jaką zajmuje pozycję? Czy jest lider, challenger, niszowa? Szukaj porównań i rankingów.`,

    // Q5: Business scale — revenue, employees, market share
    `"${brandName}" przychody, obroty, liczba pracowników, skala działalności, udział w rynku. Szukaj w KRS, rejestr.io, sprawozdaniach finansowych, ranking firm, wywiadach z danymi sprzedażowymi. Podaj konkretne liczby jeśli dostępne — roczny przychód, dynamika wzrostu, liczba klientów, wolumen sprzedaży. Kategoria: "${category}".`,
  ];

  const results = await Promise.all(
    queries.map((q) => queryPerplexity(SYSTEM_PROMPT, q))
  );

  // Collect all unique citations
  const allCitations = Array.from(new Set(results.flatMap((r) => r.citations)));

  // Format with section headers
  const sections = [
    { label: 'PROFIL I TOŻSAMOŚĆ', result: results[0] },
    { label: 'DYSKURS MEDIALNY', result: results[1] },
    { label: 'PERCEPCJA ODBIORCÓW', result: results[2] },
    { label: 'KONTEKST KONKURENCYJNY', result: results[3] },
    { label: 'SKALA DZIAŁALNOŚCI', result: results[4] },
  ];

  const text = sections
    .filter((s) => s.result.content)
    .map((s) => `### ${s.label}\n${s.result.content}`)
    .join('\n\n---\n\n');

  console.log(`Perplexity: ${brandName} — ${results.filter(r => r.content).length}/4 queries returned, ${allCitations.length} citations`);

  return { text, citations: allCitations };
}
