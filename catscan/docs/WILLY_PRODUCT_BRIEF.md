# WILLY // INDUSTRY INTELLIGENCE SYSTEM
## Brief produktowy — v0.1

---

## 1. CO TO JEST

System do automatycznej analizy dowolnej branży.
Zbiera dane o wszystkich graczach, wyciąga konwencje kategorii, wizualizuje rynek.

Trzy warstwy, każda z własną wartością:

```
WARSTWA 3: INTERFACE      — Constellation View + Report Builder
WARSTWA 2: INTELLIGENCE   — Skan Kategorii (model wnioskowania)
WARSTWA 1: DATA ENGINE    — CATSCAN (model zbierania danych)
```

**Produkt docelowy:** "Powiedz mi branżę — dostaniesz pełną analizę rynku, konwencje kategorii, profil klienta, mapę graczy i raporty strategiczne."

**Dla kogo:**
- Agencje brandingowe / strategiczne — zamiast ręcznego researchu
- Marki wchodzące na rynek — "pokaż mi kto tu jest i jak myślą"
- Fundusze / M&A — due diligence sektora
- Konsultanci strategiczni — narzędzie pracy

---

## 2. TRZY WARSTWY

### WARSTWA 1: DATA ENGINE (ex-CATSCAN)

**Cel:** Zbierz wszystko o wszystkich w branży X.

**Model:** Pipeline N faz, każda faza działa na liście encji (marek/firm).
Fazy są generyczne — crawl, extract, visual, context, pricing, discovery, social, ads, reviews, finance, interpret.

**Co się zmienia per branża:**
- **Seed** — skąd lista graczy? (Dietly dla cateringów, Clutch dla agencji, Google Maps dla restauracji, LinkedIn dla SaaS...)
- **Extraction schema** — jakie wymiary? Catering ma 19, agencje SEO będą miały inne. Ale framework jest ten sam: wymiary → atrybuty → typy.
- **Źródła finansowe** — KRS dla polskich sp. z o.o., Companies House dla UK, SEC dla US publicznych...

**Co się NIE zmienia:**
- Crawl (HTTP + headless)
- Extract (Claude structured output z HTML → schema)
- Visual identity (screenshot + vision AI)
- Context (Perplexity — kontekst rynkowy)
- Social (Apify — IG, TikTok, FB, YouTube)
- Ads (Meta Ad Library)
- Reviews (Google Maps)
- Orchestrator (batch, resume, circuit breaker, validation)
- Storage (SQLite → normalized tables)
- Command Center UI

**Status:** Zbudowany i przetestowany na branży catering dietetyczny (239 marek, 19 wymiarów, 175 atrybutów). Patrz: `CATSCAN_CATERING_BRIEF.md`.

**Praca do generyczności:**
1. Extraction schema jako config (nie hardcoded) — YAML/JSON definition per branża
2. Seed phase jako plugin — adapter per marketplace/source
3. Finance phase jako plugin — adapter per jurisdiction
4. Wymiary i walidacja parametryzowane per branża

### WARSTWA 2: INTELLIGENCE (ex-Skan Kategorii)

**Cel:** Z danych wyciągnij wnioski strategiczne, których dane same nie pokażą.

**Model wnioskowania (know-how):**

```
INPUT:  dane o N graczach w branży X
        ↓
KROK 1: Analiza głównych graczy
        → dominująca obietnica
        → słowa klucze komunikacji
        → do kogo mówią (psychograficznie)
        → jak uzasadniają wartość
        → co przemilczają
        → co frustrujące dla klienta
        ↓
KROK 2: Analiza mniejszych/niszowych
        → co robią inaczej
        → czy łamią konwencje, jak
        ↓
KROK 3: Synteza konwencji kategorii
        → dominująca definicja wartości (za co NAPRAWDĘ płacą)
        → 3 główne konwencje (co wszyscy robią, skąd, co to kosztuje klienta)
        → skrypt kategorii (zdania pasujące do 80% firm)
        → tabu kategorii (czego nikt nie mówi)
        → klient wykluczony (kogo model pomija)
        ↓
KROK 4: Profil klienta konwencji
        → czego naprawdę chce
        → czego się boi
        → jak decyduje
        → historia którą opowiada sobie
        → kogo strukturalnie wyklucza
        → napięcie strategiczne
        ↓
KROK 5: Brand vs kategoria (opcjonalny — dla konkretnej marki)
        → wskaźnik konwencjonalności
        → ocena per konwencja (wpisuje się / łamie / pośrednie)
        → gdzie się wyłamuje
        → uśpiony wyróżnik
        → rekomendacja strategiczna
```

**Kluczowa zasada:** Żadnych banalnych obserwacji. Nie "firmy podkreślają jakość" — to truizm. Szukamy strukturalnych założeń: niepisanych reguł, które kategoria bierze za pewnik, a które są decyzjami podjętymi kiedyś, nie prawami natury.

**Teraz vs docelowo:**

| Aspekt | Teraz (Skan Kategorii) | Docelowo (Willy) |
|--------|----------------------|------------------|
| Input | 3-5 URL-i, ręczny scrape | Dane z Data Engine (N marek, pełne wymiary) |
| Skala | 5 firm | 50-500 firm |
| Analiza | Claude na surowym HTML | Claude na structured data (lepsze, tańsze, szybsze) |
| Klasyfikacja | Brak | Każda marka tagged vs konwencje |
| Output | Raport Markdown | Dane w DB + raport + mapa |

**Zmiana z dużą skalą:**
Gdy masz 239 marek z danymi, synteza konwencji nie jest opinią AI na 5 stronach — jest **statystycznie podparta**. "85% marek używa słowa 'świeżość' w headline" to fakt, nie obserwacja. Konwencje wyłaniają się z danych, nie z interpretacji.

**Status:** Zbudowany jako standalone Python + Streamlit app. Repo: `danielkotlinski-sys/skan-kategorii`. Prompty przetestowane, model wnioskowania walidowany.

### WARSTWA 3: INTERFACE (Constellation View + Report Builder)

**Cel:** Mapa branży, którą eksplorujesz — a raport pisze się sam z twojej eksploracji.

**Constellation View:**

239 punktów w przestrzeni 3D. Każdy punkt = marka.

- **Osie:** 3 wybrane wymiary (np. revenue × engagement × price)
- **Wielkość:** wybrana zmienna kwantyfikowalna
- **Kolor:** segment / klaster / konwencjonalność
- **Grawitacja:** marki podobne do siebie przyciągają się

Panel filtrów (slidery + toggles):
- Każdy filtr natychmiast przesuwa punkty z animacją
- Co nie spełnia warunku → blednie (opacity 0.1)
- Widać intersection: 239 → 47 → 28 marek
- Klastry formują się same — to jest insight

Category Lens (z warstwy Intelligence):
- Filtr "konwencja #1: wpisuje się / łamie" → mapa się koloruje
- Filtr "klient wykluczony" → podświetla marki z potencjałem
- Filtr "uśpiony wyróżnik" → podświetla niewykorzystaną przewagę

Inspect panel (kliknięcie w punkt):
- Pełna karta marki
- Pozycja vs **aktualny filtrowany zbiór** (nie vs cały rynek)
- Rank, percentyle, porównanie

Porównanie (ctrl+click 2-5 marek):
- Tabela side-by-side
- Radar chart (wielokąty nakładane)
- AI insight ("Viking ma 2.3x lepszy engagement przy 30% niższej cenie...")

**Report Builder:**

Raport nie jest generowany od zera. Jest **śladem eksploracji:**

```
SESSION:
1. Załadowano branżę: catering dietetyczny (239 marek)
2. Skan Kategorii: 3 konwencje, 5 tabu, profil klienta
3. Constellation: filtr revenue >5M → 47 marek
4. Filtr: has TikTok → 28 marek
5. Inspect: Maczfit (top revenue)
6. Compare: Maczfit vs Viking vs BeDiet
7. Category Lens: "łamie konwencję #2" → 12 marek
8. AI question: "Dlaczego te 12 rosną szybciej?"

→ GENERATE REPORT → narracja oparta na krokach 1-8
```

Claude dostaje sekwencję filtrów, porównań, inspekcji i generuje raport, który jest **dokładnie tym czego szukałeś** — nie generyczny "raport branżowy", ale ślad twojego myślenia z danymi.

**Formaty output:**
- Interactive dashboard (link, shareable)
- PDF raport (react-pdf)
- Prezentacja (slide deck)
- Raw data export (CSV/JSON)

**Status:** Koncept. Nie zaimplementowany.

---

## 3. JAK TO DZIAŁA END-TO-END

```
USER: "Przeanalizuj branżę agencji SEO w Polsce"
  ↓
WARSTWA 1 — DATA ENGINE:
  1. Seed: Google search "agencja SEO [miasta]" + Clutch.co scrape → 150 firm
  2. Schema: generate extraction schema for "agencje SEO" (Claude)
  3. Pipeline: crawl → extract → visual → context → pricing → discovery →
              social → ads → reviews → finance → interpret
  4. Output: 150 firm × N wymiarów w SQLite
  ↓
WARSTWA 2 — INTELLIGENCE:
  5. Auto-select: top 5 (revenue) + 5 niszowych (unusual messaging)
  6. Skan Kategorii: konwencje, tabu, profil klienta, klient wykluczony
  7. Classify: 150 firm tagged per konwencja (wpisuje/łamie/pośrednie)
  8. Output: synthesis + per-brand tags w SQLite
  ↓
WARSTWA 3 — INTERFACE:
  9. Constellation View: 150 punktów, filtry, category lens
  10. Eksploracja: user filtruje, porównuje, pyta
  11. Report Builder: generuje raport ze śladu sesji
  12. Output: interaktywna mapa + PDF + prezentacja
```

**Czas:**
- Data Engine: 1-2 dni (zautomatyzowane, ~$0.50-1.00/firma)
- Intelligence: 30 min (Claude, ~$5-10 za syntezę)
- Interface: natychmiast (dane w DB, UI gotowe)

**Total per branża:** ~$100-300 za pełny scan + analiza.
**Wartość sprzedażowa:** 8,000-25,000 PLN per raport.

---

## 4. CO MAMY, CZEGO BRAKUJE

### Mamy (zbudowane, działające):

| Komponent | Status | Gdzie |
|-----------|--------|-------|
| Data Engine — pipeline 11 faz | Gotowy, przetestowany | `catscan/lib/pipeline/` |
| Data Engine — SQLite storage | Gotowy | `catscan/lib/db/sqlite.ts` |
| Data Engine — Command Center | Gotowy | `catscan/app/scan/page.tsx` |
| Data Engine — batch/rescan/validation | Gotowy | `catscan/app/api/scan/route.ts` |
| Data Engine — circuit breaker | Gotowy | `catscan/app/api/scan/route.ts` |
| Data Engine — resilient fetch | Gotowy (not wired) | `catscan/lib/utils/resilient-fetch.ts` |
| Intelligence — prompty | Gotowe, przetestowane | `skan-kategorii/prompts.py` |
| Intelligence — model wnioskowania | Gotowy (5 kroków) | `skan-kategorii/main.py` |
| Intelligence — Streamlit UI | Gotowe | `skan-kategorii/app.py` |
| Dane — catering PL | 239 marek, 8 zeskanowanych | `catscan/data/catscan.db` |

### Brakuje (do zbudowania):

| Komponent | Priorytet | Trudność |
|-----------|-----------|----------|
| Extraction schema jako config (nie hardcoded) | P1 | Średnia |
| Seed phase jako plugin per source | P1 | Średnia |
| Intelligence zintegrowany z Data Engine | P1 | Niska (prompty gotowe) |
| Auto-classify brands per konwencja | P1 | Niska |
| Constellation View (d3-force lub Three.js) | P2 | Wysoka |
| Filter engine (zustand + URL params) | P2 | Średnia |
| Inspect panel + compare mode | P2 | Średnia |
| Category Lens (konwencje jako filtry) | P2 | Niska |
| Report Builder (session replay → Claude → PDF) | P3 | Średnia |
| Multi-branża w jednej instancji | P3 | Średnia |
| Auth + multi-user | P3 | Niska |

---

## 5. BIZNES

### Model:

**Tier 1: Self-serve (SaaS)**
- Klient podaje branżę → Willy skanuje → raport w 48h
- Cena: 2,000-5,000 PLN per branża
- Koszt: ~$100-300 (compute + API)
- Margin: ~80%

**Tier 2: Managed (consultancy)**
- Willy scan + ludzka interpretacja + prezentacja
- Cena: 12,000-25,000 PLN per branża
- Koszt: ~$300 + 1-2 dni pracy
- Margin: ~70%

**Tier 3: Pulse (subscription)**
- Monthly re-scan + diff detection + alerts
- "Co się zmieniło w twojej branży w tym miesiącu"
- Cena: 3,000-5,000 PLN/mies
- Koszt: ~$50-100/mies (re-scan)
- Margin: ~90%

### Pierwszy ruch:

1. Dokończ full scan catering (239 marek) — proof of concept
2. Uruchom Intelligence na danych catering — pierwszy pełny raport
3. Zbuduj Constellation View — visual demo
4. Sprzedaj pierwszy raport agencji brandingowej / cateringowi
5. Powtórz na drugiej branży (agencje SEO? e-commerce? fitness?)
6. Po 3 branżach — parametryzuj, zbuduj self-serve

---

## 6. NAZWA

**Willy.**

---

*WILLY // v0.1 // INDUSTRY INTELLIGENCE SYSTEM*
*Created: 2026-04-05*
