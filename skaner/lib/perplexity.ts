export async function searchExternalDiscourse(
  brandName: string,
  category: string
): Promise<string> {
  const queries = [
    `"${brandName}" ${category} opinie recenzje co mówią klienci`,
    `"${brandName}" ${category} artykuły media prasa jak opisują`,
  ];

  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [{ role: 'user', content: q }],
            max_tokens: 600,
            return_citations: true,
          }),
        });

        if (!response.ok) {
          console.error(`Perplexity error: ${response.status}`);
          return '';
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (error) {
        console.error('Perplexity search failed:', error);
        return '';
      }
    })
  );

  return results.filter(Boolean).join('\n\n---\n\n');
}
