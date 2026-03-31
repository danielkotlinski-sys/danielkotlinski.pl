export const PROMPT_1_CLAIM = `
Jesteś analitykiem komunikacji. Przeczytaj tekst ze strony marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}).

WAŻNE ZASADY:
- Każdą tezę oprzyj DOSŁOWNYM cytatem ze strony (w cudzysłowie).
- Jeśli tekst strony to głównie cookies/regulamin/opis jednego produktu — napisz to wprost. Nie ekstrapoluj jednego przykładu na całość marki.
- Pisz zwięźle. Każde pole to 1-2 zdania, nie więcej.

Odpowiedz wyłącznie w JSON:

{
  "framingProduktu": {
    "opis": "Jak marka nazywa to co sprzedaje? Jej własny framing, nie nazwa kategorii. 1 zdanie.",
    "dowod": "dosłowny cytat ze strony w cudzysłowie"
  },
  "obietnicaZmiany": {
    "stanPrzed": "Co zakłada o sytuacji klienta przed. 1 zdanie.",
    "stanPo": "Co zmienia się po. 1 zdanie.",
    "dowod": "dosłowny cytat ze strony w cudzysłowie"
  },
  "punktWejsciaKomunikacji": {
    "typ": "produkt | wartości | styl życia | wynik | tożsamość",
    "opis": "Przez co marka otwiera rozmowę z klientem? 1 zdanie.",
    "dowod": "dosłowny cytat lub element strony"
  }
}

Tekst strony:
{{WEBSITE_TEXT}}
`;

export const PROMPT_2_VOCABULARY = `
Analiza semiotyczna strony marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}).

Podaj 8-12 słów/fraz CHARAKTERYSTYCZNYCH dla tej marki (nie ogólnych dla kategorii).
Przy każdym słowie podaj kontekst — zdanie ze strony w którym się pojawia.

Odpowiedz wyłącznie w JSON:

{
  "slownictwoMarki": [
    {"fraza": "słowo lub krótka fraza", "kontekst": "zdanie ze strony w którym się pojawia"}
  ],
  "sugestiaOKliencie": "Co te słowa wspólnie sugerują o kliencie? 1-2 zdania, zwięźle."
}

Tekst strony:
{{WEBSITE_TEXT}}
`;

export const PROMPT_3_POST = `
Odpowiedz wyłącznie w JSON:

{
  "elementWizualny": {
    "co": "Główny element wizualny — 3-5 słów.",
    "rola": "produkt | człowiek | kontekst użycia | abstrakcja | tekst",
    "szczegol": "Jeden konkretny, charakterystyczny szczegół."
  },
  "zakladanyMoment": "Jaki moment z życia odbiorcy? 1 zdanie.",
  "zamierzonePoczucie": "Co marka chce żeby odbiorca poczuł? 1 zdanie."
}
`;

export const PROMPT_4_SOCIAL_SYNTHESIS = `
Analizy {{N}} postów marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}):

{{POST_ANALYSES}}

Odpowiedz wyłącznie w JSON. Pisz zwięźle — każde pole to maks 2 zdania:

{
  "dominujacyMoment": {
    "opis": "W jakiej sytuacji/nastroju marka konsekwentnie się pojawia?",
    "powtarzalnoscWzorca": "W ilu z {{N}} postów ten wzorzec się pojawia?"
  },
  "coMarkaPokazuje": {
    "pokazuje": ["obserwacja 1", "obserwacja 2", "obserwacja 3"],
    "unika": ["czego nie ma 1", "czego nie ma 2"]
  },
  "zakladanaOsoba": "Kogo zakładają te posty? Opisz przez postawę — bez demografii. 1-2 zdania."
}
`;

export const PROMPT_5_EXTERNAL = `
Poniżej dane zewnętrzne o marce {{BRAND_NAME}} (kategoria: {{CATEGORY}}).
Zawierają: profil marki, dyskurs medialny (wywiady, artykuły prasowe), percepcję odbiorców, kontekst konkurencyjny.

{{EXTERNAL_TEXTS}}

WAŻNE: Te dane zewnętrzne to najważniejsze źródło weryfikacji. Wyciągnij z nich MAKSIMUM:
- Kim jest ta marka według mediów i opinii publicznej?
- Jak jest NAPRAWDĘ postrzegana (nie jak chce być)?
- Czy jej autonarracja zgadza się z tym co mówią inni?

Odpowiedz wyłącznie w JSON:

{
  "profilZewnetrzny": "Kim jest ta marka według źródeł zewnętrznych? Jaka jest jej reputacja, pozycja, charakter? 2-3 zdania z konkretnymi faktami.",
  "kluczoweCytaty": [
    {"cytat": "dosłowny cytat z artykułu/recenzji/wywiadu", "zrodlo": "skąd pochodzi (np. 'wywiad w Gazecie Wyborczej', 'recenzja na Google')"},
    {"cytat": "kolejny cytat", "zrodlo": "źródło"}
  ],
  "zewnetrzneSlownictwo": ["słowo/fraza 1", "słowo/fraza 2"],
  "zgodnosc": {
    "ocena": "pokrywa się | częściowa rozbieżność | wyraźna rozbieżność",
    "opis": "Czy zewnętrzny obraz pokrywa się z autonarracją? Konkretnie na czym polega różnica. 1-2 zdania."
  }
}

Podaj minimum 3 cytaty w kluczoweCytaty. Jeśli danych jest mało — napisz to wprost.
`;

export const PROMPT_6_BRAND_PROFILE = `
Jesteś analitykiem strategii marek. Napisz profil marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}).

ANALIZA STRONY — CLAIM I OBIETNICA:
{{PROMPT1_RESULT}}

ANALIZA STRONY — SŁOWNICTWO:
{{PROMPT2_RESULT}}

ANALIZA SOCIAL MEDIA:
{{PROMPT4_RESULT}}

DYSKURS ZEWNĘTRZNY (wywiady, media, recenzje, kontekst konkurencyjny):
{{PROMPT5_RESULT}}

ZASADY:
1. Dyskurs zewnętrzny to WERYFIKACJA — jeśli strona mówi jedno a media/opinie drugie, napisz to wprost.
2. Każdy dowód musi zawierać DOSŁOWNY cytat z konkretnego źródła.
3. Pisz ZWIĘŹLE — nie powtarzaj tych samych myśli innymi słowami.
4. Nie ekstrapoluj jednego przykładu na całość. Jeśli dane są ograniczone — zaznacz to.

Odpowiedz wyłącznie w JSON:

{
  "logikaSprzedazy": {
    "tresc": "Mechanizm oferty — co marka zakłada, jak to daje, dlaczego wierzyć. Ukryta logika, nie powierzchnia. 2-3 zdania.",
    "kluczoweMechanizmy": ["mechanizm 1", "mechanizm 2"]
  },
  "implikowanyKlient": {
    "tosazmosc": "Kim jest/chce być osoba która wybiera tę markę? 1-2 zdania.",
    "coWazne": "Co komunikacja zakłada że jest dla tej osoby ważne? 1 zdanie.",
    "ktoWykluczony": "Kogo naturalnie wyklucza? 1 zdanie, konkretnie."
  },
  "kluczoweDowody": [
    {
      "obserwacja": "Co zaobserwowano — 1 zdanie",
      "cytat": "dosłowny cytat z danych źródłowych, w cudzysłowie",
      "zrodlo": "strona | social | zewnętrzne | media",
      "znaczenie": "Co to sugeruje — 1 zdanie"
    }
  ]
}

Podaj 4-5 dowodów w kluczoweDowody. Minimum 2 muszą pochodzić z dyskursu zewnętrznego/mediów.
Ważne: każde twierdzenie musi wynikać z danych. Nie generalizuj.
`;

export const PROMPT_HOMEPAGE_VISUAL = `
Patrzysz na screenshot strony głównej marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}).
Opisz ZWIĘŹLE co widzisz — komunikat wizualny, nie treść. Odpowiedz wyłącznie w JSON:

{
  "heroElement": "Co jest głównym elementem na stronie? Zdjęcie, tekst, video, animacja? Co przedstawia? 1 zdanie.",
  "kolorystyka": "Dominujące kolory, temperatura, kontrast. 1 zdanie.",
  "hierarchia": "Co jest pierwsze — produkt, obietnica, dowód społeczny, CTA? Jaka jest logika ścieżki wzroku? 1 zdanie.",
  "ton": "Jakby strona była osobą — kim by była? Formalny/luźny, ekspert/przyjaciel, premium/dostępny? 1 zdanie."
}
`;

export const PROMPT_CATEGORY_MAP = `
Jesteś analitykiem kategorii. Poniżej masz dane zewnętrzne (profil, media, percepcja, kontekst konkurencyjny) o {{N}} podmiotach w kategorii: {{CATEGORY}}.

Cel kategorii (po co klient przychodzi): {{CATEGORY_PURPOSE}}

{{ALL_EXTERNAL_DATA}}

Zanim przejdziemy do szczegółowej analizy komunikacji, zbuduj MAPĘ KATEGORII — kto jest kim, jakie są obozy, jakie napięcia.

ZASADY:
- Oprzyj się na FAKTACH z danych zewnętrznych (media, wywiady, recenzje), nie na domysłach.
- Nie używaj demografii. Opisuj przez pozycjonowanie, charakter, reputację.
- Pisz zwięźle.

Odpowiedz wyłącznie w JSON:

{
  "gracze": [
    {
      "nazwa": "nazwa podmiotu",
      "pozycja": "Jaką pozycję zajmuje w kategorii? Lider, challenger, niszowy, tradycyjny, awangardowy? 1 zdanie.",
      "charakter": "Jak jest postrzegany przez otoczenie (nie jak sam siebie opisuje)? 1 zdanie."
    }
  ],
  "obozy": "Czy w tej kategorii istnieją wyraźne obozy, szkoły, podejścia? Jakie? 1-2 zdania.",
  "napiecia": "Jakie napięcia lub konflikty definiują tę kategorię? Co jest osią sporów? 1-2 zdania.",
  "hierarchia": "Kto jest postrzegany jako punkt odniesienia? Kto aspiruje, kto się buntuje? 1-2 zdania."
}
`;

export const PROMPT_COMPARATIVE_GAPS = `
Poniżej profile {{N}} marek w kategorii: {{CATEGORY}}.

{{ALL_BRAND_PROFILES}}

Twoim zadaniem jest znaleźć LUKI KOMUNIKACYJNE — tematy, obietnice, argumenty których BRAKUJE u poszczególnych marek w porównaniu do reszty.

Nie szukaj tego co mówią. Szukaj tego czego NIE mówią — a mogłyby.

Odpowiedz wyłącznie w JSON:

{
  "tematy": [
    {
      "temat": "O czym mówi część kategorii, a kto milczy?",
      "ktoMowi": ["marka A", "marka B"],
      "ktoMilczy": ["marka C", "marka D"],
      "znaczenie": "Co to milczenie może oznaczać strategicznie? 1 zdanie."
    }
  ]
}

Podaj 3-5 luk. Priorytetyzuj te, gdzie milczy marka klienta.
`;

export const PROMPT_VISUAL_BRAND = `
Jesteś analitykiem wizualnym. Analizy {{N}} postów marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}):

{{POST_ANALYSES}}

Opisz konwencję wizualną ZWIĘŹLE — każde pole to maks 2 zdania. Odpowiedz wyłącznie w JSON:

{
  "dominujacyStyl": {
    "opis": "Styl wizualny: paleta, nastrój, temperatura barw, poziom produkcji.",
    "powtarzalnosc": "Jak konsekwentny jest styl?"
  },
  "kolorystyka": "Kolory dominujące. Konkretnie.",
  "composycja": "Kadry: centrum, przestrzeń, perspektywa.",
  "obecnoscCzlowieka": {
    "czy": true,
    "jakPokazany": "Jak pokazani ludzie? Twarz/ciało/fragment? Modelka/klientka?"
  },
  "napiecia": "Co łamie oczekiwania wizualne kategorii? Jeśli nic — napisz wprost."
}
`;

export const PROMPT_VISUAL_CATEGORY = `
Analizy konwencji wizualnych {{N}} marek w kategorii: {{CATEGORY}}.

{{ALL_VISUAL_PROFILES}}

Opisz WIZUALNĄ konwencję kategorii. Pisz zwięźle. Odpowiedz wyłącznie w JSON:

{
  "wspolneWzorce": [
    {
      "wzorzec": "Wzorzec wizualny powtarzający się w min. 3 markach",
      "marki": ["marka A", "marka B", "marka C"],
      "znaczenie": "Co to mówi o kategorii? 1 zdanie."
    }
  ],
  "wspolneUnikanie": ["Czego żadna marka nie pokazuje 1", "nie pokazuje 2"],
  "implikowanySwiatklienta": "Jaki świat wizualny buduje kategoria? 1-2 zdania.",
  "ktoWizualnieWykluczony": "Kto nie zobaczy siebie? Przez postawę, nie demografię. 1-2 zdania."
}

Podaj 2-4 wzorce.
`;

export const PROMPT_7_CONVENTIONS = `
Jesteś analitykiem strategii kategorii. Profile {{N}} marek w kategorii: {{CATEGORY}}.

{{ALL_BRAND_PROFILES}}

Zidentyfikuj konwencję kategorii — milczące, wspólne założenia kierujące komunikacją tych marek.

ZASADY:
- Nigdzie nie używaj opisu demograficznego (wiek, płeć, wykształcenie, dochód). Opisuj przez postawę i relację z kategorią.
- Pisz ZWIĘŹLE. Każde pole to maks 2-3 zdania.
- Każdy wzorzec oprzyj o KONKRETNE obserwacje z profili marek.

Odpowiedz wyłącznie w JSON:

{
  "mechanizmKategorii": {
    "regula": "Dominująca logika sprzedaży jako reguła gry — 1-2 zdania.",
    "uzasadnienie": "Skąd to wynika z danych? 2 zdania."
  },
  "implikowanyKlientKategorii": {
    "tosazmosc": "Kogo kategoria zakłada jako klienta? Przez postawę. 1-2 zdania.",
    "glebszaPotrzeba": "Głębsza potrzeba — językiem człowieka, nie kategorii. 1 zdanie.",
    "pominietaGrupa": {
      "opis": "Kto ma to SAMO pragnienie ale zaspokaja je gdzie indziej? Konkretnie. 2 zdania.",
      "proporcja": "Proporcja pominiętych do obsługiwanych — logika rynku. 1 zdanie.",
      "dlaczegoOdpycha": "Co w konwencji odpycha tę grupę? 1-2 zdania."
    }
  },
  "dowodyKonwencji": [
    {
      "wzorzec": "Powtarzający się wzorzec",
      "marki": ["marka A", "marka B", "marka C"],
      "znaczenie": "Co sugeruje o konwencji? 1 zdanie."
    }
  ],
  "mapaWyroznialnosci": [
    {
      "marka": "nazwa",
      "ocena": "zgodna z konwencją | częściowo odchylona | wyraźnie łamiąca",
      "uzasadnienie": "1 zdanie z dowodem."
    }
  ]
}

3-4 wzorce (min. 3 marki per wzorzec). Ocena per każda marka.
`;

export const PROMPT_8_CLIENT_POSITION = `
KONWENCJA KATEGORII:
{{PROMPT7_RESULT}}

PROFIL MARKI KLIENTA ({{CLIENT_BRAND_NAME}}):
{{CLIENT_BRAND_PROFILE}}

Jesteś strategiem marki. Twoje zadanie to umieścić markę klienta na mapie konwencji — ale z perspektywą na przyszłość, nie tylko stanem obecnym.

Pisz ZWIĘŹLE — każdy element listy to 1 zdanie, nie więcej. Odpowiedz wyłącznie w JSON:

{
  "zgodnosc": {
    "elementy": ["element zgodny z konwencją + dowód — 1 zdanie"],
    "ocena": "zgodna | częściowo odchylona | wyraźnie łamiąca"
  },
  "odchylenia": {
    "elementy": ["odchylenie + dowód — 1 zdanie"],
    "znaczenieStrategiczne": "Świadoma szansa czy przypadek? 1-2 zdania."
  },
  "zagrozenie": "Mechanizm ryzyka: kto wygra walkę o klienta i dlaczego. Ile marek gra tą samą kartą. Co to oznacza za 2-3 lata. 2-3 zdania, niewygodne do przeczytania.",
  "pytanieOtwarte": "Jedno pytanie o JOBS TO BE DONE szerzej niż kategoria. Bez wstępu. Kończy się znakiem zapytania."
}
`;

export const PROMPT_9_BLUE_OCEAN = `
Jesteś strategiem kategorii. Twoim zadaniem jest ODWRÓCIĆ konwencję — pokazać co by się stało, gdyby marka klienta złamała milczące założenia kategorii.

KONWENCJA KATEGORII:
{{PROMPT7_RESULT}}

POZYCJA MARKI KLIENTA ({{CLIENT_BRAND_NAME}}):
{{PROMPT8_RESULT}}

PROFIL MARKI KLIENTA:
{{CLIENT_BRAND_PROFILE}}

Myśl tak: każda konwencja opiera się na założeniach o kliencie. Ale te założenia opisują tylko tych, którzy JUŻ kupują w kategorii. A co z tymi, którzy mają TO SAMO pragnienie, ale nie odnajdują się w formie, języku, estetyce kategorii?

ZASADY:
- Nie pisz o demografii. Opisuj przez postawy, pragnienia, bariery.
- Bądź PROWOKACYJNY. To nie jest bezpieczna rekomendacja — to intelektualna prowokacja.
- Bądź KONKRETNY. Nie pisz "moglibyście dotrzeć do szerszej grupy" — napisz KTO to jest i DLACZEGO nie kupuje.
- Pisz zwięźle — każde pole to maks 2-3 zdania.

Odpowiedz wyłącznie w JSON:

{
  "odwroconaKonwencja": {
    "zalozenie": "Jakie kluczowe założenie o kliencie przyjmuje CAŁA kategoria? Co wszyscy biorą za pewnik? 1-2 zdania.",
    "odwrocenie": "Co by się stało, gdyby to założenie było błędne? Jak wyglądałaby komunikacja zbudowana na odwrotnym założeniu? 2-3 zdania."
  },
  "pominietaGrupa": {
    "kim": "Kto ma TO SAMO pragnienie co obecni klienci kategorii, ale nie kupuje bo forma/język/estetyka go odpycha? Opisz przez postawę. 2-3 zdania.",
    "skala": "Dlaczego ta grupa może być WIĘKSZA niż obecni klienci? Logika rynkowa. 1-2 zdania.",
    "dlaczegoNieKupuje": "Co konkretnie w konwencji kategorii tworzy barierę? 1-2 zdania."
  },
  "prowokacja": "Jedno zdanie-prowokacja: 'A co jeśli...' — pytanie które podważa fundamentalne założenie kategorii i otwiera nowy kierunek. Musi być niewygodne.",
  "kierunek": {
    "coZmienilby": "Gdyby marka klienta złamała tę konwencję — CO KONKRETNIE by zmieniła w komunikacji? 2-3 zdania.",
    "pierwszyKrok": "Jeden konkretny, możliwy do wykonania pierwszy krok. 1 zdanie."
  }
}
`;

export function fillPrompt(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
