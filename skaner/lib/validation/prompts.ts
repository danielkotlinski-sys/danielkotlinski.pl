import type { ScannerInput } from '@/types/scanner';
import type { PageMeta } from './meta';

/**
 * Build the semantic validation prompt for Claude Haiku.
 *
 * The prompt receives:
 *  - category description + purpose (kontekst do porównania)
 *  - meta-tagi każdej marki (title/description/h1/og)
 *
 * Claude ma wykryć niespójności których deterministyczne checki nie złapały:
 *  - content totalnie off-topic (np. "szczoteczki" ale strona o oponach)
 *  - nazwa marki nie pasuje do tytułu strony
 *  - handle wygląda jak konto z innej platformy
 *  - nazwa marki ma oczywistą literówkę (Oral V vs Oral B)
 */

export interface BrandPromptData {
  role: 'client' | 'competitor';
  index?: number;
  name: string;
  url: string;
  socialHandle: string;
  socialPlatform?: 'instagram' | 'facebook' | 'linkedin'; // tylko dla klienta
  meta: PageMeta;
}

export function buildValidationPrompt(
  input: ScannerInput,
  brands: BrandPromptData[]
): string {
  const brandBlocks = brands
    .map((b, i) => {
      const roleLabel = b.role === 'client' ? '[KLIENT]' : `[KONKURENT ${(b.index ?? 0) + 1}]`;
      const platformInfo = b.socialPlatform ? ` (platforma: ${b.socialPlatform})` : '';
      const metaTitle = b.meta.title || b.meta.ogTitle || '(brak)';
      const metaDesc = b.meta.description || b.meta.ogDescription || '(brak)';
      const metaH1 = b.meta.h1 || '(brak)';
      const reachability = b.meta.reachable
        ? `HTTP ${b.meta.status}${b.meta.redirected ? ` (przekierowanie na ${b.meta.finalUrl})` : ''}`
        : `nieosiągalna: ${b.meta.error || 'nieznany błąd'}`;

      return `${i + 1}. ${roleLabel} "${b.name}"
   URL: ${b.url}
   Status: ${reachability}
   Title strony: "${metaTitle}"
   Description: "${metaDesc}"
   H1: "${metaH1}"
   Handle social: "${b.socialHandle || '(brak)'}"${platformInfo}`;
    })
    .join('\n\n');

  return `Jesteś ekspertem weryfikującym DANE WEJŚCIOWE do analizy marketingowej marek. Dostajesz zestaw marek (klient + konkurenci) oraz opis kategorii. Twoje jedyne zadanie: wykryć sytuacje, w których użytkownik WPROWADZIŁ coś źle i trzeba to poprawić PRZED uruchomieniem skanu.

=== KATEGORIA ===
Opis: ${input.category}
Typ: ${input.categoryType}
Cel klienta w kategorii: ${input.categoryPurpose}

=== MARKI DO WERYFIKACJI ===
${brandBlocks}

=== CO WOLNO CI ZGŁASZAĆ ===

Dla każdej marki oceń NIEZALEŻNIE 3 wymiary — i tylko te 3:

1. **Czy content strony (meta) pasuje do kategorii?**
   - Jeśli kategoria to "soniczne szczoteczki" a strona ma tytuł "Sklep z oponami" → HARD ERROR (confidence > 0.9)
   - Jeśli strona zajmuje się częściowo inną kategorią ale też tą → warning
   - Ignoruj przypadki gdzie meta jest pusta (nie mamy danych do oceny)

2. **Czy nazwa marki pasuje do tytułu strony?**
   - Jeśli user wpisał "Oral V" ale title="Oral-B Polska" → warning z sugestią "Oral-B"
   - Drobne różnice case/interpunkcji (oral b vs Oral-B) → POMIJAJ — nie zgłaszaj
   - Literówki ewidentne (literka obok na klawiaturze) → warning

3. **Czy handle social pasuje do deklarowanej platformy i marki?**
   - Underscore w FB handle → JUŻ wykryte deterministycznie, NIE duplikuj
   - Handle kompletnie niezwiązany z nazwą marki (np. "Oral-B" + handle "johndoe123") → warning

=== CO JEST KATEGORYCZNIE ZABRONIONE ===

To jest PRE-VALIDATION INPUTU, nie audyt strony. Pod ŻADNYM pozorem NIE zgłaszaj:

- ❌ Jakości strony (brak H1, braki SEO, design, content quality, czytelność, UX, accessibility)
- ❌ Długości / jakości meta description, title, og tagów
- ❌ Rekomendacji marketingowych ("marka powinna...", "warto dodać...")
- ❌ Obserwacji o zawartości strony które nie wpływają na input użytkownika
- ❌ Informacji o kategorii / pozycjonowaniu marki (to zadanie samego skanu, nie pre-walidacji)
- ❌ Drobnych kosmetyk case/interpunkcji w nazwie marki
- ❌ Komentarzy o kompletności danych wejściowych innych niż te 3 wymiary wyżej

Jeśli zgłoszenie NIE zmusza użytkownika do POPRAWIENIA url/handle/nazwy marki PRZED skanem — NIE zgłaszaj go. Kropka.

=== REGUŁY WYNIKU ===

- Severity 'error' TYLKO dla totalnie off-topic contentu (confidence ≥ 0.9)
- Severity 'warning' dla niespójności wymagających decyzji użytkownika (confidence 0.7-0.9)
- Severity 'info' POMIJAJ — jeśli to nie jest warning lub error, nie zgłaszaj wcale
- NIE halucynuj. Jeśli nie jesteś pewien co zasugerować → suggestion: null
- **MAKS 1 finding per marka.** Zgłaszaj tylko ten NAJWAŻNIEJSZY problem, który faktycznie wymaga akcji użytkownika.
- NIE zgłaszaj findingów dla marek gdzie meta jest pusta (reachable: false, albo puste pola)
- Jeśli wszystko jest w porządku — zwróć pustą tablicę findings.

=== FORMAT ODPOWIEDZI (STRICT JSON) ===

{
  "findings": [
    {
      "brand": "nazwa marki DOKŁADNIE jak w inpucie powyżej",
      "role": "client" | "competitor",
      "competitorIndex": <liczba 0-3 gdy role='competitor', null gdy 'client'>,
      "field": "url" | "socialHandle" | "brandName",
      "severity": "error" | "warning",
      "issue": "jedno zdanie po polsku co jest nie tak",
      "suggestion": "sugerowana wartość LUB null",
      "confidence": 0.0-1.0,
      "rationale": "jedno zdanie uzasadnienia"
    }
  ]
}

Jeśli wszystko wygląda OK — zwróć pustą tablicę: {"findings": []}.

Odpowiedz WYŁĄCZNIE JSONem. Zero tekstu przed/po. Zero komentarzy.`;
}
