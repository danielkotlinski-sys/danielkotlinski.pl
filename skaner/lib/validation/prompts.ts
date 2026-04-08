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

  return `Jesteś ekspertem weryfikującym dane wejściowe do analizy marketingowej marek. Dostajesz zestaw marek (klient + konkurenci) oraz opis kategorii. Twoje zadanie: wykryć niespójności, które zaburzyłyby jakość analizy.

=== KATEGORIA ===
Opis: ${input.category}
Typ: ${input.categoryType}
Cel klienta w kategorii: ${input.categoryPurpose}

=== MARKI DO WERYFIKACJI ===
${brandBlocks}

=== TWOJE ZADANIE ===

Dla każdej marki oceń NIEZALEŻNIE 3 wymiary:

1. **Czy content strony (meta) pasuje do kategorii?**
   - Jeśli kategoria to "soniczne szczoteczki" a strona ma tytuł "Sklep z oponami" → TO HARD ERROR (confidence > 0.9)
   - Jeśli strona zajmuje się częściowo inną kategorią ale też tą → warning
   - Ignoruj przypadki gdzie meta jest pusta (nie mamy danych do oceny)

2. **Czy nazwa marki pasuje do tytułu strony?**
   - Jeśli user wpisał "Oral V" ale title="Oral-B Polska — szczoteczki" → warning z sugestią "Oral-B"
   - Drobne różnice case/interpunkcji (oral b vs Oral-B) → info, nie warning
   - Literówki ewidentne (literka obok na klawiaturze) → warning

3. **Czy handle social pasuje do deklarowanej platformy i marki?**
   - Underscore w FB handle → to już wykryte deterministycznie, NIE duplikuj
   - Handle kompletnie niezwiązany z nazwą marki (np. "Oral-B" + handle "johndoe123") → warning
   - Handle wygląda na konto prywatne (osobowe imię-nazwisko) → info

=== REGUŁY ODPOWIEDZI ===

- Severity 'error' TYLKO dla totalnie off-topic contentu (confidence ≥ 0.9) lub oczywistej literówki w URL
- Severity 'warning' dla częściowych niespójności (confidence 0.6-0.9)
- Severity 'info' dla drobnych kosmetyk (confidence 0.5-0.8)
- NIE halucynuj. Jeśli nie jesteś pewien co zasugerować → suggestion: null
- NIE powtarzaj rzeczy oczywistych z deterministycznych checków (underscore w FB, DNS errors)
- NIE zgłaszaj findingów dla marek gdzie meta jest pusta (reachable: false, albo puste pola)
- MAKS 1-2 findings per marka — zgłaszaj tylko naprawdę istotne

=== FORMAT ODPOWIEDZI (STRICT JSON) ===

{
  "findings": [
    {
      "brand": "nazwa marki DOKŁADNIE jak w inpucie powyżej",
      "role": "client" | "competitor",
      "competitorIndex": <liczba 0-3 gdy role='competitor', null gdy 'client'>,
      "field": "url" | "socialHandle" | "brandName",
      "severity": "error" | "warning" | "info",
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
