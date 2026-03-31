export const PROMPT_1_CLAIM = `
Jesteś analitykiem komunikacji. Przeczytaj poniższy tekst ze strony marki {{BRAND_NAME}}
działającej w kategorii: {{CATEGORY}}.

Odpowiedz wyłącznie w JSON według schematu poniżej.
Każdą odpowiedź poprzyj cytatem lub parafrazą konkretnego fragmentu tekstu jako dowodem.

{
  "framingProduktu": {
    "opis": "Jak marka nazywa to co sprzedaje — nie nazwę kategorii ogólną, ale swój własny framing. Co to jest według niej?",
    "dowod": "cytat lub parafraza z tekstu"
  },
  "obietnicaZmiany": {
    "stanPrzed": "Co zakłada się o sytuacji klienta przed zakupem?",
    "stanPo": "Co zmienia się według komunikacji po zakupie lub kontakcie z marką?",
    "dowod": "cytat lub parafraza z tekstu"
  },
  "punktWejsciaKomunikacji": {
    "typ": "produkt | wartości | styl życia | wynik | tożsamość",
    "opis": "Przez co marka otwiera rozmowę z klientem?",
    "dowod": "konkretny element który to potwierdza"
  }
}

Tekst strony:
{{WEBSITE_TEXT}}
`;

export const PROMPT_2_VOCABULARY = `
Jesteś analitykiem semiotycznym. Na podstawie poniższego tekstu ze strony marki {{BRAND_NAME}}:

Odpowiedz wyłącznie w JSON:

{
  "slownictwoMarki": [
    "słowo lub krótka fraza 1",
    "słowo lub krótka fraza 2"
  ],
  "sugestiaOKliencie": "Co te słowa wspólnie sugerują o tym, jak marka rozumie swojego klienta i jego sytuację? 2-3 zdania."
}

Nie chodzi o słowa kluczowe SEO. Chodzi o słowa które tworzą świat znaczeń tej marki.
Podaj 8-12 elementów charakterystycznych dla tej marki, nie ogólnych dla kategorii.

Tekst strony:
{{WEBSITE_TEXT}}
`;

export const PROMPT_3_POST = `
Odpowiedz wyłącznie w JSON:

{
  "elementWizualny": {
    "co": "Co jest głównym elementem wizualnym?",
    "rola": "produkt | człowiek | kontekst użycia | abstrakcja | tekst",
    "szczegol": "jeden konkretny szczegół który jest charakterystyczny"
  },
  "zakladanyMoment": "Jaki moment z życia odbiorcy ten post zakłada lub sugeruje? Opisz sytuację.",
  "zamierzonePoczucie": "Jedno zdanie: co marka chce żeby odbiorca poczuł widząc ten post?"
}
`;

export const PROMPT_4_SOCIAL_SYNTHESIS = `
Poniżej masz analizy {{N}} postów marki {{BRAND_NAME}} w kategorii {{CATEGORY}}.

{{POST_ANALYSES}}

Odpowiedz wyłącznie w JSON:

{
  "dominujacyMoment": {
    "opis": "W jakiej sytuacji, nastroju, kontekście ta marka konsekwentnie się pojawia w życiu klienta?",
    "powtarzalnoscWzorca": "W ilu postach z {{N}} ten wzorzec się pojawia? Podaj liczbę."
  },
  "coMarkaPokazuje": {
    "pokazuje": ["konkretna obserwacja 1", "konkretna obserwacja 2", "konkretna obserwacja 3"],
    "unika": ["czego konsekwentnie nie ma 1", "czego konsekwentnie nie ma 2"]
  },
  "zakladanaOsoba": "Jak wygląda osoba której życie jest zakładane w tych postach? Opisz przez postawę i wartości — bez danych demograficznych."
}
`;

export const PROMPT_5_EXTERNAL = `
Poniżej fragmenty tekstów zewnętrznych o marce {{BRAND_NAME}} z kategorii {{CATEGORY}}.
Mogą to być recenzje, artykuły, komentarze, opisy medialne.

{{EXTERNAL_TEXTS}}

Odpowiedz wyłącznie w JSON:

{
  "zewnetrzneSlownictwo": ["słowo/fraza 1", "słowo/fraza 2"],
  "zgodnosc": {
    "ocena": "pokrywa się | częściowa rozbieżność | wyraźna rozbieżność",
    "opis": "Czy zewnętrzny obraz marki pokrywa się z tym jak opisuje siebie? Na czym polega różnica?"
  }
}

Jeśli danych zewnętrznych jest mało lub są mało informatywne, napisz to wprost w polu 'opis'.
`;

export const PROMPT_6_BRAND_PROFILE = `
Jesteś doświadczonym analitykiem strategii marek.
Poniżej masz wyniki analizy marki {{BRAND_NAME}} w kategorii {{CATEGORY}}.

ANALIZA STRONY — CLAIM I OBIETNICA:
{{PROMPT1_RESULT}}

ANALIZA STRONY — SŁOWNICTWO:
{{PROMPT2_RESULT}}

ANALIZA SOCIAL MEDIA:
{{PROMPT4_RESULT}}

DYSKURS ZEWNĘTRZNY:
{{PROMPT5_RESULT}}

Na podstawie tych danych napisz profil marki. Odpowiedz wyłącznie w JSON:

{
  "logikaSprzedazy": {
    "tresc": "Jaki jest mechanizm tej oferty — co marka zakłada że klient chce, jak twierdzi że to daje, dlaczego klient ma jej wierzyć? Zidentyfikuj ukrytą logikę, nie opisuj powierzchni. 4-6 zdań.",
    "kluczoweMechanizmy": ["mechanizm 1", "mechanizm 2"]
  },
  "implikowanyKlient": {
    "tosazmosc": "Kim staje się lub chce być osoba która wybiera tę markę? 2-3 zdania.",
    "coWazne": "Co ta komunikacja zakłada że jest dla tej osoby ważne?",
    "ktoWykluczony": "Kogo ta komunikacja naturalnie wyklucza? Konkretnie."
  },
  "kluczoweDowody": [
    {
      "obserwacja": "Co konkretnie zaobserwowano w danych",
      "zrodlo": "strona | social | zewnętrzne",
      "znaczenie": "Co to sugeruje o logice marki"
    }
  ]
}

Podaj dokładnie 3 dowody w tablicy kluczoweDowody.
Ważne: każde twierdzenie musi wynikać z obserwacji w dostarczonych danych.
Nie generalizuj ponad to co dane pokazują.
`;

export const PROMPT_VISUAL_BRAND = `
Jesteś analitykiem wizualnym. Poniżej masz analizy {{N}} postów marki {{BRAND_NAME}} w kategorii {{CATEGORY}}.

{{POST_ANALYSES}}

Twoim zadaniem jest opisać konwencję wizualną tej marki w social media. Odpowiedz wyłącznie w JSON:

{
  "dominujacyStyl": {
    "opis": "Jaki jest dominujący styl wizualny? Opisz paletę, nastrój, temperaturę barw, poziom 'produkcji' (surowe vs wypolerowane). 2-3 zdania.",
    "powtarzalnosc": "Jak konsekwentny jest ten styl? Czy wszystkie posty mają tę samą estetykę czy są niespójne?"
  },
  "kolorystyka": "Jakie kolory dominują? Ciepłe/zimne? Pastelowe/nasycone? Konkretnie.",
  "composycja": "Jak zbudowane są kadry? Co jest w centrum? Dużo pustej przestrzeni czy gęsto? Perspektywa bliska czy daleka?",
  "obecnoscCzlowieka": {
    "czy": true,
    "jakPokazany": "Jeśli ludzie się pojawiają — jak? Twarz widoczna? Całe ciało? Fragment? W akcji czy pozowanie? Kto to jest — modelka, klientka, ekspertka?"
  },
  "napiecia": "Co jest wizualnie nieoczywiste lub zaskakujące w tej marce? Co łamie oczekiwania wizualne kategorii? Jeśli nic — napisz że marka trzyma się wizualnego mainstreamu kategorii."
}
`;

export const PROMPT_VISUAL_CATEGORY = `
Poniżej masz analizy konwencji wizualnych {{N}} marek w kategorii: {{CATEGORY}}.

{{ALL_VISUAL_PROFILES}}

Twoim zadaniem jest opisać WIZUALNĄ konwencję kategorii — to co łączy te marki pod względem estetyki, nie komunikatu tekstowego. Odpowiedz wyłącznie w JSON:

{
  "wspolneWzorce": [
    {
      "wzorzec": "Konkretny wzorzec wizualny który się powtarza w minimum 3 markach",
      "marki": ["marka A", "marka B", "marka C"],
      "znaczenie": "Co ten wzorzec mówi o tym, jak kategoria chce być postrzegana?"
    }
  ],
  "wspolneUnikanie": ["Czego ŻADNA marka wizualnie nie pokazuje — mimo że mogłaby? Podaj 2-3 obserwacje."],
  "implikowanySwiatklienta": "Jaki świat wizualny ta kategoria wspólnie buduje? W jakim otoczeniu, nastroju, estetyce żyje implikowany klient kategorii? 2-3 zdania.",
  "ktoWizualnieWykluczony": "Kto NIE zobaczy siebie w tych wizualizacjach? Jaki typ osoby (przez postawę i styl życia, nie demografię) nie rozpozna swojego świata w tym co kategoria pokazuje?"
}

Podaj 2-4 wzorce w wspolneWzorce.
`;

export const PROMPT_7_CONVENTIONS = `
Jesteś analitykiem strategii kategorii. Poniżej masz profile {{N}} marek
działających w kategorii: {{CATEGORY}}.

{{ALL_BRAND_PROFILES}}

Twoim zadaniem jest zidentyfikować konwencję kategorii —
milczące, wspólne założenia które kierują komunikacją tych marek,
nawet jeśli żadna ich wprost nie wypowiada.

Ważne ograniczenie dla całej odpowiedzi: nigdzie nie używaj opisu demograficznego — wieku, płci, wykształcenia, dochodu, zawodu. Opisuj wyłącznie przez postawę, wartości, sposób myślenia o sobie i relację z kategorią. Demografia to skrót który ukrywa mechanizm. Mechanizm jest ważniejszy.

Odpowiedz wyłącznie w JSON:

{
  "mechanizmKategorii": {
    "regula": "Jaka jest dominująca logika sprzedaży w tej kategorii? Opisz jako regułę gry — 1-2 zdania które działają jak definicja, nie lista cech.",
    "uzasadnienie": "Skąd to wynika z danych? 2-3 zdania."
  },
  "implikowanyKlientKategorii": {
    "tosazmosc": "Kogo ta kategoria kolektywnie zakłada jako klienta? Opisz przez postawę i sposób myślenia o sobie — bez danych demograficznych (bez wieku, płci, wykształcenia).",
    "glebszaPotrzeba": "Jaka jest głębsza potrzeba lub pragnienie które ta kategoria próbuje zaspokoić? Opisz ją językiem człowieka, nie językiem kategorii. Przykład: teatr zaspokaja pragnienie intensywnego przeżycia, nie 'potrzebę kultury'.",
    "pominietaGrupa": {
      "opis": "Kto ma to SAMO głębsze pragnienie które adresuje ta kategoria, ale dziś zaspokaja je gdzie indziej — bo język i konwencja tej kategorii nie mówią do niego? Nie chodzi o inny segment demograficzny ani o ludzi z innym budżetem. Chodzi o ludzi z podobną motywacją, których kategoria odpycha swoją formą, nie treścią. Opisz konkretnie kto to jest i gdzie dziś realizuje to pragnienie.",
      "proporcja": "Oszacuj proporcję: ilu jest tych pominiętych w stosunku do klientów których kategoria dziś aktywnie obsługuje? Użyj logiki porównawczej — np. 'na każdego aktywnego klienta kategorii przypada szacunkowo X osób które mają podobne pragnienie ale nie identyfikują się z kategorią'. Oprzyj to na logice rynku, nie na zmyślonych liczbach.",
      "dlaczegoOdpycha": "Co konkretnie w konwencji tej kategorii — w jej języku, w formie oferty, w implikowanej tożsamości klienta — sprawia że ta szersza grupa ludzi nie rozpoznaje kategorii jako odpowiedzi na swoje pragnienie? To nie jest wada tych ludzi. To jest ograniczenie konwencji."
    }
  },
  "dowodyKonwencji": [
    {
      "wzorzec": "Konkretny wzorzec który się powtarza",
      "marki": ["marka A", "marka B", "marka C"],
      "znaczenie": "Co ten wzorzec sugeruje o konwencji?"
    }
  ],
  "mapaWyroznialnosci": [
    {
      "marka": "nazwa",
      "ocena": "zgodna z konwencją | częściowo odchylona | wyraźnie łamiąca",
      "uzasadnienie": "Jedno zdanie z konkretnym dowodem."
    }
  ]
}

Podaj 3-4 wzorce w dowodyKonwencji. Wzorzec kwalifikuje się jako konwencja
tylko jeśli pojawia się w minimum 3 z {{N}} analizowanych marek.
Podaj ocenę per każda marka w mapaWyroznialnosci.
`;

export const PROMPT_8_CLIENT_POSITION = `
Na podstawie mapy konwencji kategorii i profilu marki klienta:

KONWENCJA KATEGORII:
{{PROMPT7_RESULT}}

PROFIL MARKI KLIENTA ({{CLIENT_BRAND_NAME}}):
{{CLIENT_BRAND_PROFILE}}

Odpowiedz wyłącznie w JSON:

{
  "zgodnosc": {
    "elementy": [
      "konkretny element komunikacji klienta który pokrywa się z konwencją — z dowodem"
    ],
    "ocena": "zgodna | częściowo odchylona | wyraźnie łamiąca"
  },
  "odchylenia": {
    "elementy": [
      "gdzie komunikacja klienta wychodzi poza konwencję — z dowodem"
    ],
    "znaczenieStrategiczne": "Czy to odchylenie to świadoma szansa czy przypadkowa różnica? Co z tego wynika?"
  },
  "zagrozenie": "Opisz wprost mechanizm ryzyka dla tej marki jeśli pozostanie w konwencji kategorii. Nie pisz ogólnie o 'trudnym rynku'. Napisz konkretnie: kto wygra walkę o tego samego klienta i dlaczego — budżetem, dystrybucją, skalą, rozpoznawalnością. Ile marek w tej kategorii gra tą samą kartą co klient? Co to oznacza dla jego pozycji za 2-3 lata gdy kategoria dojrzeje dalej? To zdanie musi być niewygodne do przeczytania. 3-4 zdania.",
  "pytanieOtwarte": "Zadaj jedno pytanie które pokazuje, że jest wyjście — ale wymaga odwagi żeby je zadać. Pytanie nie może dotyczyć komunikacji ani estetyki. Musi dotyczyć tego, do KOGO marka mogłaby mówić gdyby zdefiniowała swoje JOBS TO BE DONE szerzej niż robi to dziś cała kategoria. Format: jedno zdanie, bez wstępu, bez wyjaśnienia. Pytanie kończy się znakiem zapytania."
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
