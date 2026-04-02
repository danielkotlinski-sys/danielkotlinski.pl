export const PROMPT_1_CLAIM = `
Jesteś analitykiem komunikacji. Przeczytaj tekst ze strony marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}).

WAŻNE ZASADY:
- Każdą tezę oprzyj DOSŁOWNYM cytatem ze strony (w cudzysłowie).
- Jeśli tekst strony to głównie cookies/regulamin/opis jednego produktu/aktualnej kampanii — napisz to wprost. Nie ekstrapoluj jednego przykładu na całość marki.
- Szukaj FUNDAMENTALNYCH elementów komunikacji (obietnica, framing, punkt wejścia), nie aktualnych promocji czy nowości produktowych.
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
1. Social media i dyskurs zewnętrzny to GŁÓWNE źródła — pokazują jak marka naprawdę komunikuje, nie jak chciałaby. Strona WWW to źródło uzupełniające (często to SEO/konwersje, mało treści komunikacyjnej).
2. Dyskurs zewnętrzny to WERYFIKACJA — jeśli strona mówi jedno a media/opinie drugie, napisz to wprost.
3. Każdy dowód musi zawierać DOSŁOWNY cytat z konkretnego źródła.
4. Pisz ZWIĘŹLE — nie powtarzaj tych samych myśli innymi słowami.
5. Nie ekstrapoluj jednego przykładu (np. nowego produktu, jednej kampanii) na całość marki. Szukaj POWTARZALNYCH wzorców.
6. Jeśli dane są ograniczone — zaznacz to.

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
- Oprzyj się na FAKTACH z danych zewnętrznych (media, wywiady, recenzje, dane finansowe), nie na domysłach.
- POZYCJA w kategorii musi wynikać z DANYCH O SKALI (przychody, liczba klientów, udział w rynku) — nie z tonu komunikacji. Marka z największym przychodem to lider, nawet jeśli komunikuje się skromnie. Marka z niewielkim przychodem to challenger lub niszowa, nawet jeśli komunikuje się odważnie.
- Jeśli masz dane finansowe — użyj ich wprost jako dowodu pozycji.
- Nie używaj demografii. Opisuj przez pozycjonowanie, charakter, reputację.
- Pisz zwięźle.

Odpowiedz wyłącznie w JSON:

{
  "gracze": [
    {
      "nazwa": "nazwa podmiotu",
      "pozycja": "Jaką pozycję zajmuje w kategorii? Lider, challenger, niszowy? Oprzyj się na danych o skali (przychody, klienci). 1 zdanie.",
      "skala": "Dostępne dane liczbowe: przychód roczny, liczba pracowników, wolumen, dynamika wzrostu. Jeśli brak — napisz 'brak danych'.",
      "charakter": "Jak jest postrzegany przez otoczenie (nie jak sam siebie opisuje)? 1 zdanie."
    }
  ],
  "obozy": "Czy w tej kategorii istnieją wyraźne obozy, szkoły, podejścia? Jakie? 1-2 zdania.",
  "napiecia": "Jakie napięcia lub konflikty definiują tę kategorię? Co jest osią sporów? 1-2 zdania.",
  "hierarchia": "Kto jest postrzegany jako punkt odniesienia? Kto aspiruje, kto się buntuje? 1-2 zdania.",
  "mapaPercepcyjna": {
    "osX": {
      "lewy": "Biegun lewy osi X — jedno słowo lub krótka fraza (np. 'Tradycja', 'Eksperckość', 'Premium')",
      "prawy": "Biegun prawy osi X — przeciwieństwo lewego (np. 'Innowacja', 'Przystępność', 'Masowość')"
    },
    "osY": {
      "dolny": "Biegun dolny osi Y — jedno słowo lub krótka fraza (np. 'Funkcjonalność', 'Racjonalność')",
      "gorny": "Biegun górny osi Y — przeciwieństwo dolnego (np. 'Emocje', 'Styl życia')"
    },
    "marki": [
      {
        "nazwa": "nazwa marki",
        "x": "Pozycja na osi X od -10 (lewy biegun) do 10 (prawy biegun). Liczba całkowita.",
        "y": "Pozycja na osi Y od -10 (dolny biegun) do 10 (górny biegun). Liczba całkowita."
      }
    ]
  }
}

WAŻNE dla mapy percepcyjnej:
- Osie muszą odzwierciedlać PRAWDZIWE napięcia komunikacyjne w kategorii — nie generyczne wymiary.
- Unikaj banalnych osi typu "tanie vs drogie" lub "duże vs małe" — szukaj osi, które pokazują RÓŻNICE w pozycjonowaniu marek.
- Pozycje marek muszą wynikać z danych, nie z domysłów. Marki MOGĄ się nakładać — to ważna informacja pokazująca tłok w kategorii.
- Dobierz osie tak, żeby marki się ROZRÓŻNIAŁY — jeśli wszystkie lądują w jednym miejscu, zmień osie.
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
    "glebszaPotrzeba": "Głębsza potrzeba — językiem człowieka, nie kategorii. 1 zdanie."
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
Jesteś strategiem kategorii. Twoim zadaniem jest wykrycie, w jaki sposób dana kategoria wytwarza wartość dziś, jakie założenia ukrywają się pod tą logiką, oraz gdzie znajduje się pęknięcie — punkt w którym konwencja kategorii może być błędna.

Nie dajesz rekomendacji strategicznych. Nie wymyślasz ruchów. Pokazujesz MOŻLIWOŚCI które się otwierają kiedy marka zaczyna myśleć poza konwencją.

KONWENCJA KATEGORII:
{{PROMPT7_RESULT}}

POZYCJA MARKI KLIENTA ({{CLIENT_BRAND_NAME}}):
{{PROMPT8_RESULT}}

PROFIL MARKI KLIENTA:
{{CLIENT_BRAND_PROFILE}}

=== TWÓJ PROCES (wykonaj WSZYSTKIE kroki zanim napiszesz odpowiedź) ===

ETAP 1. MECHANIZM KATEGORII
Zsyntetyzuj kategorię do jednego zdania:
"Kategoria generuje wartość przez [mechanizm], dla klienta który chce [stan/rezultat], dlatego premiuje [typ zachowania/tryb decyzji]."
Nie kończ na poziomie komunikatu — szukaj logiki gry.

ETAP 2. PRZEANALIZUJ 8 OSI PĘKNIĘCIA
Dla KAŻDEJ osi odpowiedz: jak wygląda konwencja? jakie założenie się kryje? jaki jest koszt? jakie odwrócenie jest możliwe? czy ta oś może otworzyć nowy popyt?

Oś 1. EPISTEMICZNA — jak kategoria produkuje zaufanie
Oś 2. ENERGETYCZNA — ile wysiłku wymaga klient
Oś 3. CZASOWA — kiedy powstaje wartość
Oś 4. TOŻSAMOŚCIOWA — kim klient ma się stać, żeby pasować
Oś 5. PORÓWNAWCZA — według czego klient porównuje opcje
Oś 6. STRUKTURALNA — jak zorganizowana jest oferta i relacja
Oś 7. SYTUACYJNA — w jakim momencie życia produkt "robi robotę"
Oś 8. OPERACYJNA — gdzie obietnica nie ma pokrycia

ETAP 3. OCEŃ OSIE
Scoring 1-5 w: siła konwencji, głębokość kosztu, skala nowego popytu, trudność imitacji, potencjał zmiany zasad porównania. Ranking 1-8.

ETAP 4. ZBUDUJ DWA WARIANTY HIPOTEZY PĘKNIĘCIA
Wybierz 2 różne osie (nie pokrywające się). Dla każdej: konwencja zakłada → to może być błędne bo → alternatywna logika wartości.
WAŻNE: warianty MUSZĄ być fundamentalnie różne — opisywać inny mechanizm, inną potrzebę, inną zmianę. Jeśli oba mówią o tym samym ale innymi słowami — zmień jeden.

ETAP 5. WYBIERZ 5 TECHNIK I WYGENERUJ KIERUNKI "A CO GDYBY...?"
Z poniższej listy 10 technik łamania konwencji wybierz 5, które najlepiej pasują do odkrytej konwencji tej kategorii. Dla każdej wybranej techniki napisz konkretny kierunek w formie "A co gdyby...?".

LISTA 10 TECHNIK:
1. Odjęcie zamiast dodawania — Świadomie czegoś nie robisz. Redukujesz chaos wyboru i sygnalizujesz kierunek.
2. Jawna wada (controlled flaw) — Eksponujesz coś, co normalnie byłoby ukrywane. Zwiększasz wiarygodność i tworzysz filtr.
3. Spowolnienie zamiast przyspieszenia — W kategorii "szybciej = lepiej" wprowadzasz rytuał, proces, czas. Zmieniasz percepcję wartości.
4. Ograniczona dostępność jako zasada — Nie "promocja kończy się dziś", tylko realna limitacja. Przesuwasz z masowości w stronę selektywności.
5. Odwrócenie obietnicy — Zamiast obiecywać rezultat końcowy – obiecujesz drogę lub zmianę sposobu myślenia.
6. Kontekst zamiast produktu — Nie sprzedajesz rzeczy, tylko moment jej użycia. Wychodzisz z porównania funkcjonalnego.
7. Nazwanie napięcia, którego inni unikają — Wprost mówisz o czymś niewygodnym dla klienta. Rezonans > poprawność.
8. Rezygnacja z "dla wszystkich" — Komunikujesz, dla kogo to NIE jest. Wzmacniasz identyfikację u właściwych.
9. Zmiana jednostki wartości — Nie liczysz tego, co wszyscy (np. cena/porcja/godzina). Utrudniasz bezpośrednie porównanie.
10. Produkt jako narzędzie tożsamości — Nie "co robi", tylko "kim jesteś, używając tego". Decyzja przestaje być racjonalna.

ZASADY DLA KIERUNKÓW:
- Każdy kierunek MUSI używać INNEJ techniki — żadnych powtórzeń.
- Każdy kierunek to 2 zdania: konkretny pomysł, nie abstrakcja.
- Ton: wyobraźnia, nie rekomendacja. "A co gdyby?" nie "Powinieneś".
- Kierunki powinny być RÓŻNORODNE — dotykać różnych aspektów marki/produktu/relacji z klientem.
- Jeśli dwa kierunki mówią o tym samym innymi słowami → wymień jeden.

=== TWARDE ZABEZPIECZENIA ===

NIE IDŹ automatycznie ścieżką "wykluczony klient". To że kategoria komunikuje się ekspercko nie oznacza, że najlepszym ruchem jest uproszczenie.

NIE MYL zmiany tonu ze zmianą gry. Jeśli proponujesz cieplejszy język / mniej eksperckości / więcej emocji — sprawdź czy to zmienia mechanikę generowania wartości.

ODRÓŻNIAJ: konwencję komunikacyjną (jak mówi), konwencję poznawczą (jak buduje zaufanie), konwencję ekonomiczną/operacyjną (jak organizuje wartość).

=== FORMAT ODPOWIEDZI ===

Odpowiedz WYŁĄCZNIE w JSON. Cały proces myślenia (8 osi, scoring, ranking) wykonaj wewnętrznie — w odpowiedzi podaj tylko wynik końcowy:

{
  "mechanizmKategorii": "Kategoria generuje wartość przez [mechanizm], dla klienta który chce [stan], dlatego premiuje [zachowanie]. 1-2 zdania.",
  "hipotezaPekniecia": {
    "konwencjaZaklada": "Jakie kluczowe założenie przyjmuje CAŁA kategoria? Napisz jako zdanie w które wszyscy wierzą. 1-2 zdania.",
    "wariant1": {
      "toMozeBycBledne": "Dlaczego to założenie ma koszt, limit lub ślepy punkt? Perspektywa 1. 2-3 zdania.",
      "alternatywnaLogika": "Jaka inna logika wartości mogłaby działać zamiast obecnej? Perspektywa 1. 2-3 zdania."
    },
    "wariant2": {
      "toMozeBycBledne": "Dlaczego to założenie ma koszt, limit lub ślepy punkt? Perspektywa 2 — FUNDAMENTALNIE INNA niż wariant 1. 2-3 zdania.",
      "alternatywnaLogika": "Jaka inna logika wartości mogłaby działać? Perspektywa 2 — INNA mechanika i potrzeba niż wariant 1. 2-3 zdania."
    }
  },
  "kierunki": [
    {
      "technika": "Nazwa techniki z listy (np. 'Odjęcie zamiast dodawania')",
      "aCoGdyby": "A co gdyby {{CLIENT_BRAND_NAME}}...? 2 zdania — konkretny pomysł, ton wyobraźni nie rekomendacji."
    }
  ]
}

Podaj DOKŁADNIE 5 kierunków w tablicy "kierunki". Każdy z inną techniką.
`;

export const PROMPT_ADS_ANALYSIS = `
Jesteś analitykiem komunikacji reklamowej. Poniżej masz dane o {{AD_COUNT}} aktywnych reklamach Meta (Facebook/Instagram Ads) marki {{BRAND_NAME}} (kategoria: {{CATEGORY}}).

DANE REKLAM:
{{ADS_DATA}}

KONTEKST — DOTYCHCZASOWA ANALIZA KOMUNIKACJI ORGANICZNEJ:
- Strona WWW + social media sugerują następujący profil marki:
  Logika sprzedaży: {{ORGANIC_LOGIC}}
  Implikowany klient: {{ORGANIC_CLIENT}}

Twoim zadaniem jest:
1. Przeanalizować CO marka promuje płatnie — jakie obietnice, argumenty, CTA dominują w reklamach.
2. Ocenić SPÓJNOŚĆ między komunikacją organiczną (strona + social) a płatną (reklamy Meta).
3. Wyciągnąć DODATKOWE wnioski — reklamy ujawniają prawdziwe priorytety sprzedażowe, które marka może ukrywać w komunikacji wizerunkowej.
4. Opisać konwencje wizualne reklam — co się powtarza w kreacjach.

ZASADY:
- Każdą tezę oprzyj konkretnymi przykładami z reklam (cytuj treści).
- Pisz zwięźle — każde pole to maks 2-3 zdania.
- Jeśli reklam jest mało lub są monotematyczne — napisz to wprost.

Odpowiedz wyłącznie w JSON:

{
  "dominujacyPrzekaz": "Co reklamy najczęściej komunikują? Jaka jest główna obietnica/argument/CTA? 1-2 zdania z przykładami.",
  "konwencjeWizualneReklam": "Jakie wzorce wizualne się powtarzają w kreacjach? Kolory, formaty, styl zdjęć/grafik. 1-2 zdania.",
  "spojnosc": {
    "ocena": "spójna | częściowo rozbieżna | wyraźnie rozbieżna",
    "opis": "Czy reklamy mówią to samo co strona i social? Gdzie się zgadzają, gdzie się różnią? 2-3 zdania z konkretnymi przykładami."
  },
  "ukrytePriorytety": "Co reklamy ujawniają o prawdziwych priorytetach sprzedażowych marki, czego nie widać w komunikacji organicznej? 1-2 zdania.",
  "dodatkoveWnioski": [
    "Obserwacja 1 z reklam która poszerza obraz marki — 1 zdanie",
    "Obserwacja 2 — 1 zdanie"
  ]
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
