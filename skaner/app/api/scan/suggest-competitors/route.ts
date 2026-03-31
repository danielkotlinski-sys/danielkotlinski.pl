import { NextRequest } from 'next/server';

interface CompetitorSuggestion {
  name: string;
  url: string;
  socialHandle: string;
}

export async function POST(request: NextRequest) {
  try {
    const { brandName, brandUrl, category, categoryType, socialPlatform } = await request.json();

    if (!brandName || !category || category.length < 10) {
      return Response.json({ error: 'Brakuje danych' }, { status: 400 });
    }

    const platformLabel =
      socialPlatform === 'linkedin' ? 'LinkedIn' :
      socialPlatform === 'facebook' ? 'Facebook' : 'Instagram';

    const query = `Marka "${brandName}"${brandUrl ? ` (${brandUrl})` : ''} działa w kategorii: "${category}" (${categoryType || 'b2c'}).

Podaj DOKŁADNIE 3 najbliższych konkurentów tej marki w tej kategorii. Dla każdego podaj:
1. Oficjalną nazwę marki
2. Adres strony WWW (sprawdzony, działający URL)
3. Nazwę profilu na ${platformLabel} (sam handle, bez @ i bez URL — np. "resibobynature" a nie "@resibobynature" ani "instagram.com/resibobynature")

WAŻNE:
- Podaj TYLKO marki które naprawdę istnieją i są bezpośrednimi konkurentami w tej kategorii.
- URL musi być prawdziwy — nie zgaduj, podaj tylko jeśli jesteś pewien.
- Jeśli nie znasz profilu na ${platformLabel}, zostaw pusty string.
- Nie podawaj samej marki "${brandName}" jako konkurenta.

Odpowiedz WYŁĄCZNIE w JSON, bez żadnego innego tekstu:
{"competitors": [{"name": "Nazwa", "url": "https://strona.pl", "socialHandle": "handle_lub_pusty"}, ...]}`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'Jesteś ekspertem od rynku. Podajesz TYLKO zweryfikowane fakty. Odpowiadasz wyłącznie w poprawnym JSON.',
          },
          { role: 'user', content: query },
        ],
        max_tokens: 500,
        return_citations: true,
      }),
    });

    if (!response.ok) {
      console.error(`Perplexity error: ${response.status}`);
      return Response.json({ competitors: [] });
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON in Perplexity response:', content);
      return Response.json({ competitors: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { competitors: CompetitorSuggestion[] };
    const competitors = (parsed.competitors || [])
      .slice(0, 3)
      .map((c) => ({
        name: c.name || '',
        url: c.url || '',
        socialHandle: (c.socialHandle || '').replace(/^@/, ''),
      }));

    return Response.json({ competitors });
  } catch (error) {
    console.error('Suggest competitors error:', error);
    return Response.json({ competitors: [] });
  }
}
