# CATSCAN // SUPLEMENT: DANE FINANSOWE Z KRS
## Jak pozyskać dane rejestrowe i finansowe polskich firm

---

## 1. KONTEKST

Dane z KRS (Krajowy Rejestr Sądowy) i sprawozdania finansowe to osobna
warstwa danych, która łączona z danymi komunikacyjnymi tworzy unikalny obraz.

Pozwala odpowiadać na pytania typu:
- "Które marki rosną >20% rocznie — co mają wspólnego w komunikacji?"
- "Jaka jest korelacja między liczbą reklam a przychodem?"
- "Kto jest właścicielem więcej niż jednej marki?"
- "Które marki premium mają spadające przychody? (marki-zombie)"

---

## 2. ARCHITEKTURA ŹRÓDEŁ — 3 WARSTWY

Dane rejestrowe i finansowe w Polsce są rozproszone w 3 miejscach:

```
WARSTWA A: KRS API (Ministerstwo Sprawiedliwości)
  → dane rejestrowe: nazwa, zarząd, udziałowcy, kapitał, PKD
  → DARMOWE, publiczne API
  → NIE zawiera danych finansowych (przychodów, zysków)

WARSTWA B: RDF — Repozytorium Dokumentów Finansowych
  → sprawozdania finansowe: bilans, RZiS, przychody, zysk netto
  → DARMOWE, publiczny dostęp
  → pliki XML (format e-Sprawozdań) lub PDF
  → brak oficjalnego API — trzeba scrapować interfejs webowy

WARSTWA C: Komercyjne agregatory
  → rejestr.io, infoveriti.pl, aleo.com, bisnode/dun&bradstreet
  → czyste, ustrukturyzowane dane finansowe za wiele lat
  → PŁATNE — od kilku do kilkudziesięciu PLN per raport
  → niektóre mają API
```

---

## 3. WARSTWA A: KRS API — DANE REJESTROWE

### Endpoint

```
GET https://api-krs.ms.gov.pl/api/krs/OdpisPelny/{numer_krs}?rejestr=P&format=json
```

### Dostęp
- Darmowy, publiczny, bez klucza API
- Format: JSON
- Rate limiting: tak (nieudokumentowany, ~1-2 req/s bezpiecznie)
- Nie wymaga rejestracji

### Co zwraca (6 działów)

| Dział | Zawartość |
|-------|-----------|
| **Dział 1** | Nazwa, forma prawna, NIP, REGON, adres, wspólnicy, kapitał |
| **Dział 2** | Zarząd — imiona, nazwiska, funkcje, sposób reprezentacji |
| **Dział 3** | PKD — kody działalności gospodarczej |
| **Dział 4** | Zaległości, egzekucje, zobowiązania publicznoprawne |
| **Dział 5** | Kurator (zazwyczaj pusty) |
| **Dział 6** | Likwidacja, upadłość, rozwiązanie |

### Co NIE zwraca
- Przychody, zysk, strata
- Bilans, rachunek zysków i strat
- Liczba pracowników
- Jakiekolwiek dane finansowe

### Problem: search po nazwie

API KRS wymaga numeru KRS. Nie ma endpointu do szukania po nazwie firmy.

Rozwiązania:
1. **Perplexity/Google**: "NIP [nazwa cateringu]" → wyciągnij NIP/KRS
2. **Scrape rejestr.io**: search po nazwie → KRS number (403 dla botów, trzeba Apify)
3. **CEIDG API** (dla JDG): https://dane.biznes.gov.pl/api — darmowe, search po nazwie
4. **Bulk approach**: mamy nazwy z Dietly → Claude Haiku: 
   "Dla firmy '[nazwa]' w branży catering dietetyczny, znajdź NIP" 
   via Perplexity batch

### Estymowany pipeline

```
500 nazw marek
  → Perplexity batch: "NIP i forma prawna [nazwa]"
  → ~350 zidentyfikowanych (70% hit rate)
  → ~250 to sp. z o.o. (mają KRS)
  → ~100 to JDG/s.c. (nie mają KRS, mają CEIDG)

250 numerów KRS → API KRS → JSON
  Czas: 2-3h (rate limiting ~1/s)
  Koszt: $0

100 JDG → CEIDG API → podstawowe dane
  Czas: 30 min
  Koszt: $0

TOTAL: ~$5-10 (Perplexity za discovery) + $0 (API) = ~$10
```

### Wynikowy schemat danych

```typescript
interface KRSData {
  // Identyfikacja
  legal_name: string;           // "FIT CATERING SP. Z O.O."
  krs_number: string;           // "0000123456"
  nip: string;                  // "1234567890"
  regon: string;                // "123456789"
  legal_form: 'sp_zoo' | 'sa' | 'jdg' | 'sc' | 'sk' | 'other';
  
  // Rejestracja
  registration_date: string;    // data wpisu — "od kiedy istnieje"
  registration_court: string;   // sąd rejestrowy
  
  // Kapitał i własność
  share_capital: number;        // kapitał zakładowy PLN
  shareholders: Array<{
    name: string;
    share_pct: number;          // udział procentowy
    share_value: number;        // wartość udziałów PLN
  }>;
  is_sole_owner: boolean;       // czy 1 właściciel
  
  // Zarząd
  board_members: Array<{
    name: string;
    role: string;               // "PREZES ZARZĄDU", "CZŁONEK ZARZĄDU"
    since: string;              // data powołania
  }>;
  board_size: number;
  
  // Działalność
  pkd_primary: string;          // główny PKD: "56.21.Z"
  pkd_all: string[];            // wszystkie PKD
  
  // Adres
  hq_city: string;
  hq_address: string;
  hq_voivodeship: string;
  
  // Sygnały
  has_debt_entries: boolean;    // wpisy w dziale 4 (zaległości)
  is_in_liquidation: boolean;   // dział 6
  is_in_bankruptcy: boolean;    // dział 6
}
```

---

## 4. WARSTWA B: SPRAWOZDANIA FINANSOWE (RDF)

To jest klucz do danych finansowych. Tu są przychody, zyski, bilanse.

### Gdzie to jest

Repozytorium Dokumentów Finansowych, nowy adres:
```
https://rdf-przegladarka.ms.gov.pl/
```

### Jak działa

1. Wchodzisz na stronę
2. Szukasz po numerze KRS
3. Widzisz listę złożonych dokumentów (sprawozdania za kolejne lata)
4. Pobierasz pliki — format XML (e-Sprawozdanie) lub PDF

### Nie ma API

RDF nie ma publicznego API. Jest tylko interfejs webowy.
Trzeba scrapować lub użyć komercyjnego agregatora.

### Format e-Sprawozdań (XML)

Od 2018 roku sp. z o.o. składają sprawozdania w formacie XML
(standard Ministerstwa Finansów). Struktura:

```xml
<JednostkaMala>  <!-- lub JednostkaInna, JednostkaMikro -->
  <RZiS>  <!-- Rachunek Zysków i Strat -->
    <PrzsychodyNetto>
      <A>12500000.00</A>  <!-- Przychody netto ze sprzedaży -->
    </PrzychodyNetto>
    <KosztyDzialalnosciOperacyjnej>
      <B>11200000.00</B>
    </KosztyDzialalnosciOperacyjnej>
    <ZyskStrataNetto>
      <L>850000.00</L>    <!-- Zysk netto -->
    </ZyskStrataNetto>
  </RZiS>
  <Bilans>
    <Aktywa>
      <AktywaRazem>3200000.00</AktywaRazem>
    </Aktywa>
    <Pasywa>
      <PasywaRazem>3200000.00</PasywaRazem>
      <KapitalWlasny>1500000.00</KapitalWlasny>
    </Pasywa>
  </Bilans>
</JednostkaMala>
```

### Pipeline pozyskania sprawozdań

```
OPCJA A: Scrape RDF (darmowe, ale wolne)

  1. Apify/Playwright: wejdź na rdf-przegladarka.ms.gov.pl
  2. Dla każdego KRS: search → lista dokumentów → pobierz XML
  3. Parse XML → structured JSON
  4. 250 firm x 3 lata = 750 dokumentów
  
  Czas: 4-8h (wolny interfejs, rate limiting)
  Koszt: ~$5-10 (Apify compute)
  Hit rate: ~60-70% (nie wszystkie złożyły, nie wszystkie XML)

OPCJA B: Komercyjny agregator (płatne, ale szybkie)

  rejestr.io — ma dane finansowe ustrukturyzowane
  Nie ma publicznego API, ale:
  - Apify actor "rejestr.io scraper" — scrapuje per KRS
  - Dane: przychody, zysk, aktywa — za 3+ lata
  - Kompletnie sparsowane, czyste dane
  
  Czas: 1-2h
  Koszt: ~$15-20 (Apify compute za 250 firm)
  Hit rate: ~80%+ (lepszy coverage)

OPCJA C: Hybrid (rekomendacja)

  1. Spróbuj rejestr.io scrape dla 250 firm
  2. Dla brakujących: RDF scrape bezpośrednio
  3. Dla nadal brakujących: LLM search 
     ("przychody [nazwa firmy] catering 2024")
  
  Czas: 3-5h
  Koszt: ~$20-30
  Coverage: ~85-90% firm z KRS
```

### Wynikowy schemat danych finansowych

```typescript
interface FinancialData {
  // Per rok (trzymamy 3 lata)
  financials: Array<{
    year: number;                    // 2023, 2024, 2025
    source: 'rdf_xml' | 'rejestr_io' | 'manual' | 'estimated';
    
    // Rachunek Zysków i Strat
    revenue: number;                 // przychody netto (PLN)
    operating_costs: number;         // koszty operacyjne
    operating_profit: number;        // zysk operacyjny
    net_income: number;              // zysk/strata netto
    
    // Bilans
    total_assets: number;            // aktywa razem
    equity: number;                  // kapitał własny
    total_liabilities: number;       // zobowiązania
    
    // Pochodne (kalkulowane)
    net_margin_pct: number;          // marża netto %
    asset_turnover: number;          // przychody / aktywa
    debt_to_equity: number;          // zobowiązania / kapitał
  }>;
  
  // Kalkulowane cross-year
  revenue_3y_cagr: number;          // CAGR przychodów 3-letni
  revenue_yoy_change_pct: number;   // zmiana R/R ostatni rok
  net_income_trend: 'growing' | 'stable' | 'declining' | 'loss_making';
  financial_health: 'strong' | 'moderate' | 'weak' | 'critical';
  
  // Estymacje
  estimated_employee_count: number;  // z danych ZUS lub estymacja z przychodów
  revenue_per_employee: number;      // jeśli mamy oba
}
```

---

## 5. WARSTWA C: KOMERCYJNE AGREGATORY (backup)

Jeśli opcje A+B nie dadzą wystarczającego coverage:

| Serwis | Co daje | Cena | API |
|--------|---------|------|-----|
| **rejestr.io** | KRS + finanse + powiązania | Darmowy podgląd, scraping | Brak oficjalnego |
| **infoveriti.pl** | Pełne raporty finansowe | ~15-30 PLN/raport | Tak (płatne) |
| **aleo.com** | KRS + finanse + scoring | ~5-15 PLN/raport | Tak (płatne) |
| **bisnode.pl** | Credit reports + finanse | ~50-100 PLN/raport | Tak (enterprise) |
| **wywiad-gospodarczy.pl** | Raporty o firmach | ~20-40 PLN/raport | Nie |

Rekomendacja: **rejestr.io scraping** jako primary, bo darmowe i najlepszy
coverage. Komercyjne API jako fallback dla firm których nie znajdziemy.

Hipotetyczny koszt komercyjny dla 250 firm:
- aleo.com: 250 × 10 PLN = 2,500 PLN (~$600) — DROGO
- rejestr.io scraping: ~$20 — TANIO ale ryzyko blokady
- RDF bezpośrednio: $5-10 — DARMOWE ale wolne

---

## 6. KOMPLETNY PIPELINE KRS + FINANSE

```
KROK 1: Name → NIP/KRS discovery
  Input:  500 nazw marek z Dietly
  Tool:   Perplexity batch / Google search
  Output: ~350 zidentyfikowanych NIP/KRS
  Czas:   1-2h
  Koszt:  ~$10

KROK 2: KRS API → dane rejestrowe
  Input:  ~250 numerów KRS (sp. z o.o.)
  Tool:   api-krs.ms.gov.pl (darmowe API)
  Output: zarząd, udziałowcy, kapitał, PKD, adres
  Czas:   2-3h (rate limited)
  Koszt:  $0

KROK 3: CEIDG API → dane JDG
  Input:  ~100 NIP-ów (jednoosobowe działalności)
  Tool:   dane.biznes.gov.pl/api
  Output: imię/nazwisko, adres, PKD, data rejestracji
  Czas:   30 min
  Koszt:  $0

KROK 4: Sprawozdania finansowe (3 lata)
  Input:  ~250 numerów KRS
  Tool:   rejestr.io scraping (primary) + RDF scrape (fallback)
  Output: przychody, zysk, bilans — za 2022, 2023, 2024
  Czas:   3-5h
  Koszt:  ~$20-30

KROK 5: Parse + enrichment
  Input:  raw XML/JSON z kroków 2-4
  Tool:   custom parser + Claude Haiku (edge cases)
  Output: structured FinancialData JSON per marka
  Czas:   1h
  Koszt:  ~$2-3

TOTAL:
  Czas:   8-12h (jednorazowo, potem incremental)
  Koszt:  ~$35-45
  Coverage: ~70% z danymi rejestrowymi, ~50-60% z danymi finansowymi
```

---

## 7. CO DAJE NAM 3 LATA DANYCH FINANSOWYCH

### Nowe typy queries

```
"Ranking top 20 cateringów po przychodach"
→ Tabela: nazwa, przychód 2024, zmiana YoY, marża

"Które marki rosną najszybciej?"
→ Sortuj po revenue_3y_cagr, pokaż top 10

"Pokaż marki z premium messaging ale spadającymi przychodami"
→ JOIN: messaging.emotional_register = 'premium' 
        AND financials.revenue_yoy_change_pct < -10

"Kto jest właścicielem więcej niż jednej marki?"
→ GROUP BY shareholders.name HAVING COUNT(*) > 1
→ Odkrywanie grup kapitałowych

"Średni przychód per nisza: keto vs vege vs sport"
→ GROUP BY niche_focus, AVG(revenue)

"Marki-zombie: high ad spend + declining revenue"
→ ads.active_ads_count > 20 AND financials.net_income_trend = 'declining'

"Ile wynosi średni przychód per typ: własna flota vs kurier?"  
→ Korelacja modelu operacyjnego z wynikami

"Nowi gracze z dużym kapitałem — kto wchodzi na rynek?"
→ registration_date > 2024 AND share_capital > 100000
```

### Cross-dimension insights (unikalne)

Żaden istniejący produkt nie łączy:
- Dane komunikacyjne (messaging, visual, social)
- Dane reklamowe (Meta Ads, kreacje)
- Dane reputacyjne (reviews, ratings)
- Dane finansowe (przychody, zysk, wzrost)

**w jednym interfejsie, dla jednej branży, z możliwością odpytywania.**

To jest jak Bloomberg Terminal dla polskiego rynku D2C food.

---

## 8. OGRANICZENIA I RYZYKA

### Dostępność danych
- ~30-40% firm to JDG — nie składają sprawozdań finansowych
- Sprawozdania mają opóźnienie 6-12 miesięcy (rok 2024 dostępny od połowy 2025)
- Nie wszystkie sp. z o.o. składają na czas (kary są niskie)
- Dane z rejestr.io mogą być niekompletne lub outdated

### Jakość danych
- Mniejsze firmy mogą mieć uproszczone sprawozdania (JednostkaMikro)
- Niektóre XML-e mają niestandardową strukturę — trzeba obsłużyć edge cases
- NIP discovery nie zawsze trafne (podobne nazwy, rebrandingi)

### Prawne
- Dane z KRS i RDF są publiczne — brak ograniczeń prawnych
- Scraping rejestr.io — szara strefa, mogą blokować
- Agregowanie i odsprzedaż danych publicznych — legalne w Polsce
- RODO: dane zarządów sp. z o.o. są publiczne (rejestr jawny)

### Mitygacja
- Zawsze podawaj źródło i datę danych
- Oznaczaj dane estymowane vs potwierdzone
- Walidacja krzyżowa: KRS data vs rejestr.io vs strona firmy
- Dla JDG: estymuj przychody z proxy (liczba opinii, zasięg, ad spend)

---

## 9. ZAKTUALIZOWANY KOSZT FULL SCAN (z KRS)

```
Dietly seed:                     $5
Domain discovery:                $5-10
Website crawl + screenshots:     $20-30
Structured extraction (LLM):     $3-5
Social media (IG+FB+TT):        $35-50
Meta Ads (darmowe API):          $0
Google Reviews:                  $10-15
KRS + CEIDG (dane rejestrowe):  $10
Sprawozdania finansowe:          $20-30
Interpretation layer:            $10-15
                                 ─────────
TOTAL:                           $120-170
```

500 marek. 21 wymiarów. ~100,000 atrybutów. Dane finansowe za 3 lata.
Za cenę kolacji w restauracji.

---

*CATSCAN_OS // SUPLEMENT KRS // v0.1*
*Generated: 2026-04-03*
