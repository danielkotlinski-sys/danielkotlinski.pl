# CATSCAN // CATERING INTELLIGENCE ENGINE
## Brief produktowy — v0.3

---

## 1. CO TO JEST

Sektorowa baza wiedzy o rynku cateringów dietetycznych w Polsce.
256 marek w bazie (docelowo 400-600). 21 wymiarów analizy per marka. ~100,000 atrybutów.
Dane komunikacyjne + finansowe + reklamowe + social + reputacja.
Odświeżane cyklicznie. Odpytywane w języku naturalnym.

Produkt docelowy: interfejs typu "zapytaj o cokolwiek w tej branży".
Produkt MVP: raport sektorowy + prosta wyszukiwarka + chat AI.

**Status:** MVP zbudowany — pipeline 9 faz, scan engine UI, query interface, audit page.
Baza: 256 marek (177 Dietly + 78 Google search + 1 Dietly-city). Brakuje ~250 marek do pełnego pokrycia.

Patrz też: `CATSCAN_KRS_SUPPLEMENT.md` — szczegóły pozyskania danych z KRS.

---

## 2. SKĄD DANE

### 2.1 Źródło startowe: Dietly.pl ✅ ZAIMPLEMENTOWANE

Dietly to największa platforma do zamawiania cateringów w Polsce.
Kataloguje marki z danymi strukturalnymi. Scraper zbudowany — parsuje sitemap Dietly.
**Aktualnie:** 177 marek z Dietly + 78 z Google search = 256 w `data/brands.json`.

Dane dostępne z Dietly per marka:
- Nazwa firmy
- Rating (np. 4.79/5.00)
- Procent pozytywnych ocen posiłków
- Liczba opinii
- Kategoria cenowa (ekonomiczny / standardowy / premium)
- Lista typów diet (8-21 per firma)
- Informacja o dostawie (deadline zamówienia, czas dostawy)
- Aktualne promocje i rabaty
- Krótki opis firmy
- Badge'e (np. Dietly Awards 2025)

To daje nam SEED DATA: listę marek + URL + podstawowe metryki.

### 2.2 Źródło wtórne: strony www marek ✅ ZAIMPLEMENTOWANE

Z Dietly mamy nazwy + domeny. Crawl fazą curl (plain HTTP, bez JS rendering).
SPA sites mają ograniczone dane — faza context (Perplexity) uzupełnia braki.
Crawlujemy 3-5 podstron per marka:
- Homepage
- O nas / About
- Menu / Oferta
- Cennik / Pricing
- Blog (jeśli jest)

### 2.3 Źródło: Meta Ad Library ✅ ZAIMPLEMENTOWANE

Publiczne API Meta. Wyszukujemy po nazwie marki.
Widzimy: aktywne reklamy, formaty, copy, CTA, daty uruchomienia.
Connector: `lib/connectors/meta-ads.ts`. Wymaga `META_ADS_ACCESS_TOKEN`.

### 2.4 Źródło: Social media ✅ ZAIMPLEMENTOWANE

Apify actors na: Instagram, Facebook, TikTok.
Publiczne profile — posty, followersi, engagement, częstotliwość.
Connector: `lib/connectors/apify.ts`. Wymaga `APIFY_API_TOKEN`.

### 2.5 Źródło: Google Maps / Reviews ✅ ZAIMPLEMENTOWANE

Rating, liczba opinii, lokalizacja, zdjęcia.
Apify Google Maps scraper + Dietly ratings z seed data.

### 2.6 Źródło: Perplexity (kontekstowe) ✅ ZAIMPLEMENTOWANE

Faza context: founder, rok założenia, media mentions, influencerzy,
unikalne cechy, status rynkowy, competitive position.
Wymaga `PERPLEXITY_API_KEY`. Koszt: ~$0.005/query.

---

## 3. EXTRACTION SCHEMA — 21 WYMIARÓW

Każda marka (encja) ma 21 wymiarów.
Każdy wymiar ma 3-15 atrybutów.
Atrybuty mają typy: text, number, enum, boolean, array, date.

### WYMIAR 01: IDENTYFIKACJA
- name: text — nazwa marki
- slug: text — identyfikator
- website_url: text — domena
- dietly_url: text — profil na Dietly
- logo_url: text — URL logo
- founded_year: number — rok założenia (jeśli dostępny)
- legal_entity: text — nazwa spółki (jeśli dostępna)

### WYMIAR 02: POZYCJONOWANIE CENOWE
- price_category: enum [ekonomiczny, standardowy, premium, super-premium]
- price_per_day_min: number — najniższa cena za dzień (PLN)
- price_per_day_max: number — najwyższa cena za dzień (PLN)
- pricing_model: enum [subscription, one-time, hybrid]
- has_trial: boolean
- has_discount: boolean
- discount_value: text — opis promocji
- pricing_psychology: enum [anchor-high, show-savings, hide-price, calculator]

### WYMIAR 03: OFERTA DIETETYCZNA
- diet_types: array[text] — lista diet (keto, vege, sport, etc.)
- diet_count: number — ile diet oferuje
- customization_level: enum [none, basic, full]
- calorie_options: array[number] — dostępne kaloryczności
- meal_count_options: array[number] — 3/4/5 posiłków
- has_menu_preview: boolean — czy pokazuje menu z góry

### WYMIAR 04: MESSAGING (HOMEPAGE)
- headline: text — główny nagłówek
- subheadline: text — pod-nagłówek
- primary_cta: text — główne CTA
- value_proposition: text — propozycja wartości (1 zdanie)
- social_proof_type: enum [reviews, counter, logos, celebrities, none]
- emotional_register: enum [aspirational, practical, scientific, friendly, premium]
- claims: array[text] — konkretne obietnice ("świeże składniki", "bez konserwantów")
- cliche_score: number 0-10 — jak bardzo generyczny messaging

### WYMIAR 05: IDENTYFIKACJA WIZUALNA
- dominant_colors: array[text] — hex kolory
- typography_class: enum [sans-serif, serif, mixed, handwritten]
- image_style: enum [food-photography, lifestyle, minimal, illustrative]
- layout_pattern: enum [hero-image, split, video-bg, text-first, carousel]
- overall_aesthetic: enum [premium, clean, bold, playful, clinical, budget]
- screenshot_url: text — URL screenshota homepage

### WYMIAR 06: WEBSITE STRUCTURE
- page_count_estimate: number — ile podstron
- has_blog: boolean
- has_calculator: boolean — kalkulator kaloryczny/cenowy
- has_app: boolean — aplikacja mobilna
- has_live_chat: boolean
- ordering_ux: enum [on-site, redirect-dietly, phone, form]
- tech_signals: array[text] — WordPress, custom, Shopify, etc.

### WYMIAR 07: SEO
- title_tag: text
- meta_description: text
- h1: text
- keyword_focus: array[text] — główne frazy
- has_local_seo: boolean — strony per miasto
- content_strategy: enum [no-blog, occasional, regular, aggressive]

### WYMIAR 08: REKLAMY (META)
Źródło: Meta Ad Library API (darmowe, publiczne, WSZYSTKIE aktywne reklamy).
Typowa marka: 5-30 aktywnych reklam. Niektóre 0, niektóre 100+.
500 marek x ~15 avg = ~7,500 kreacji do przeanalizowania. Koszt API: $0.
- active_ads_count: number
- ad_formats: array[enum] — [image, video, carousel, stories]
- ad_hooks: array[text] — pierwsze zdania reklam (top 10)
- ad_cta_types: array[text] — CTA w reklamach
- ad_offers: array[text] — promocje w reklamach
- estimated_spend_tier: enum [none, low, medium, high, aggressive]
- ad_creative_style: enum [ugc, professional, graphic, mixed]
- ad_start_dates: array[date] — kiedy uruchomione
- ad_platforms: array[enum] — [facebook, instagram, messenger, audience_network]
- ad_screenshot_urls: array[text] — screenshoty kreacji
- longest_running_ad_days: number — najdłużej działająca reklama (proxy na "co działa")

### WYMIAR 09: INSTAGRAM
Źródło: Apify instagram-profile-scraper + instagram-post-scraper.
Zbieramy: profil + ostatnie 20 postów per marka. Koszt: ~$15-20 za 500 marek.
- ig_handle: text
- ig_followers: number
- ig_following: number
- ig_posts_count: number
- ig_bio: text
- ig_link_in_bio: text
- ig_verified: boolean
- ig_avg_likes: number — średnia z ostatnich 20 postów
- ig_avg_comments: number — średnia z ostatnich 20 postów
- ig_engagement_rate: number — (likes+comments) / followers %
- ig_posting_frequency: enum [daily, few-per-week, weekly, irregular, inactive]
- ig_content_types: array[enum] — [food-photo, reels, carousel, ugc, behind-scenes, educational, promo]
- ig_top_hashtags: array[text] — 10 najczęstszych hashtagów
- ig_aesthetic_consistency: number 0-10 — AI assessment
- ig_recent_posts: array[{date, type, likes, comments, caption_excerpt}] — ostatnie 20

### WYMIAR 10: FACEBOOK
Źródło: Apify facebook-pages-scraper. Ostatnie 15 postów. Koszt: ~$10-15 za 500 marek.
- fb_page_url: text
- fb_page_name: text
- fb_followers: number
- fb_likes: number
- fb_avg_reactions: number — średnia z ostatnich 15 postów
- fb_avg_shares: number
- fb_avg_comments: number
- fb_posting_frequency: enum [daily, few-per-week, weekly, irregular, inactive]
- fb_content_types: array[enum] — [link, photo, video, event, offer]
- fb_community_group: boolean — czy ma grupę
- fb_community_size: number — członkowie grupy (jeśli jest)

### WYMIAR 11: TIKTOK
Źródło: Apify tiktok-scraper. Ostatnie 10 filmów. Koszt: ~$10-15 za 500 marek.
Uwaga: realnie 100-150 z 500 będzie aktywnych na TikToku.
- tiktok_handle: text
- tiktok_followers: number
- tiktok_total_likes: number
- tiktok_videos_count: number
- tiktok_active: boolean
- tiktok_avg_views: number — średnia z ostatnich 10
- tiktok_avg_likes: number
- tiktok_content_style: enum [ugc, professional, influencer, educational, trending-audio]
- tiktok_posting_frequency: enum [daily, few-per-week, weekly, irregular, inactive]

### WYMIAR 12: INFLUENCER MARKETING
- influencer_count_detected: number
- influencer_names: array[text]
- influencer_tiers: array[enum] — [nano, micro, mid, macro, celebrity]
- influencer_content_type: enum [review, unboxing, daily-vlog, recipe, sponsored-post]
- influencer_exclusivity: enum [exclusive, shared-few, widely-shared]

### WYMIAR 13: REPUTACJA
- google_rating: number
- google_review_count: number
- dietly_rating: number
- dietly_review_count: number
- dietly_positive_pct: number — procent pozytywnych ocen
- common_complaints: array[text]
- common_praises: array[text]
- trustpilot_rating: number (jeśli obecny)

### WYMIAR 14: ZASIĘG GEOGRAFICZNY
- delivery_cities: array[text]
- delivery_city_count: number
- geographic_focus: enum [local, regional, national]
- hq_city: text

### WYMIAR 15: ZESPÓŁ I WIARYGODNOŚĆ
- founder_visible: boolean
- founder_name: text
- dietitian_on_team: boolean
- team_page_exists: boolean
- certifications: array[text]
- media_mentions: array[text]
- awards: array[text]

### WYMIAR 16: CONTENT MARKETING
- blog_post_count: number
- blog_frequency: enum [none, monthly, weekly, daily]
- blog_topics: array[text]
- has_lead_magnet: boolean — ebook, kalkulator, quiz
- has_newsletter: boolean
- has_youtube: boolean

### WYMIAR 17: CUSTOMER ACQUISITION
- referral_program: boolean
- affiliate_program: boolean
- b2b_offering: boolean — catering firmowy
- partnerships: array[text] — siłownie, firmy, etc.
- dietly_promoted: boolean — czy promowany na Dietly

### WYMIAR 18: DELIVERY & OPERATIONS
- delivery_model: enum [own-fleet, courier, mixed]
- delivery_time: text — np. "zamów do 11:00, dostawa następnego dnia"
- packaging_type: enum [standard, eco, premium]
- ordering_deadline: text

### WYMIAR 19: DIFFERENTIATORS
- unique_claims: array[text] — co twierdzi że jest unikalne
- actual_differentiators: array[text] — co jest naprawdę inne (AI assessment)
- competitive_advantage_type: enum [price, quality, convenience, niche, brand, none]
- niche_focus: text — np. "sport", "keto only", "vegan", "seniors"

### WYMIAR 20: MARKET SIGNALS
- trajectory: enum [growing, stable, declining, new-entrant, exiting]
- last_website_change: date
- hiring_signals: boolean — czy rekrutują
- new_products_signals: array[text]
- competitive_moves: array[text] — ostatnie ruchy strategiczne

### WYMIAR 21: DANE REJESTROWE I FINANSOWE (KRS)
Źródło: API KRS (darmowe) + RDF/rejestr.io (sprawozdania finansowe).
Szczegółowy pipeline: patrz `CATSCAN_KRS_SUPPLEMENT.md`.
Coverage: ~70% dane rejestrowe, ~50-60% dane finansowe (JDG nie składają).
Koszt: ~$35-45 za 500 marek.
- legal_name: text — pełna nazwa prawna ("FIT CATERING SP. Z O.O.")
- krs_number: text
- nip: text
- regon: text
- legal_form: enum [sp_zoo, sa, jdg, sc, sk, other]
- registration_date: date — kiedy firma powstała
- share_capital: number — kapitał zakładowy (PLN)
- shareholders: array[{name, share_pct}] — udziałowcy
- is_sole_owner: boolean
- board_members: array[{name, role}] — zarząd
- board_size: number
- pkd_primary: text — główny kod PKD
- hq_address: text
- has_debt_entries: boolean — zaległości w KRS (dział 4)
- is_in_liquidation: boolean
- revenue_2022: number — przychody netto (PLN)
- revenue_2023: number
- revenue_2024: number
- net_income_2022: number — zysk/strata netto (PLN)
- net_income_2023: number
- net_income_2024: number
- total_assets_latest: number — aktywa razem
- equity_latest: number — kapitał własny
- revenue_yoy_change_pct: number — zmiana przychodów R/R
- revenue_3y_cagr: number — CAGR 3-letni
- net_margin_pct: number — marża netto %
- financial_health: enum [strong, moderate, weak, critical]
- financial_data_source: enum [rdf_xml, rejestr_io, estimated, unavailable]

---

## 4. POZYSKANIE DANYCH — PIPELINE

### Faza 1: SEED (Dietly scrape) ✅ GOTOWE

Wejście: Dietly.pl sitemap + Apify Google Search ("catering dietetyczny [miasto]")
Wyjście: lista marek + Dietly URL + metryki z Dietly + domeny www
Narzędzie: Custom scraper (parsuje sitemap Dietly) + Apify Google Search
Implementacja: `lib/pipeline/phases/seed.ts`
Aktualny wynik: **256 marek** (177 Dietly + 78 search + 1 city)

Wynik: encje z wymiarami 01 (częściowo), 02 (częściowo),
       03 (częściowo), 13 (Dietly dane), 14 (częściowo), 18 (częściowo)

### Faza 2: CRAWL ✅ GOTOWE

Wejście: URL-e stron www marek
Wyjście: HTML + stripped text + wykryte social URLs + kontakt (NIP, email, telefon)
Narzędzie: curl (plain HTTP, bez JS rendering)
Implementacja: `lib/pipeline/phases/crawl.ts`
Uwaga: SPA sites zwracają ograniczony content — faza context uzupełnia braki.
Czas: szybkie, ~0.5-1s per marka
Koszt: $0

### Faza 3: EXTRACT ✅ GOTOWE

Wejście: raw text z crawla
Wyjście: JSON per marka — wymiary 02-07, 14-19
Narzędzie: Claude Haiku per strona (~2K tokens in, ~1K out)
Implementacja: `lib/pipeline/phases/extract.ts`
Czas: 30 min (parallel)
Koszt: ~$3-5

### Faza 4: DISCOVERY (NIP/KRS) ✅ GOTOWE

Wejście: nazwa marki + ewentualny NIP z crawla
Wyjście: potwierdzony NIP, numer KRS, forma prawna
Narzędzie: DuckDuckGo search via curl + analiza stron prawnych (regulamin, polityka prywatności)
Implementacja: `lib/pipeline/phases/discovery.ts`
Walidacja: algorytm checksum NIP
Koszt: $0

### Faza 5: CONTEXT (Perplexity) ✅ GOTOWE

Wejście: nazwa marki + kontekst rynkowy
Wyjście: founder, rok założenia, media mentions, influencerzy, unikalne cechy, trajectory
Narzędzie: Perplexity sonar model (~$0.005/query)
Implementacja: `lib/pipeline/phases/context.ts`
Wymaga: `PERPLEXITY_API_KEY`
Czas: 1-2h (500 marek)
Koszt: ~$2.50

### Faza 6: SOCIAL MEDIA ✅ GOTOWE

Wejście: nazwy marek / URL-e social profiles (z crawla)
Wyjście: wymiary 09-12
Narzędzia:
  - Apify instagram-profile-scraper + post-scraper (20 postów/marka): ~$15-20
  - Apify facebook-pages-scraper (15 postów/marka): ~$10-15
  - Apify tiktok-scraper (10 filmów/marka): ~$10-15
Implementacja: `lib/pipeline/phases/social.ts`
Connector: `lib/connectors/apify.ts`
Czas: 2-4h
Koszt: ~$35-50
Volume: 500 profili x 3 platformy, ~20,000 postów total

### Faza 7: REKLAMY (META) ✅ GOTOWE

Wejście: nazwy marek
Wyjście: wymiar 08
Narzędzie: Meta Ad Library API (darmowe, publiczne)
Implementacja: `lib/pipeline/phases/ads.ts`
Connector: `lib/connectors/meta-ads.ts`
Czas: 2-3h
Koszt: $0
Volume: ~7,500 aktywnych kreacji reklamowych (est.)

### Faza 8: REVIEWS & GEO ✅ GOTOWE

Wejście: nazwy marek
Wyjście: wymiary 13 (Google + Dietly), 14
Narzędzie: Apify Google Maps scraper + Dietly ratings z seed data
Implementacja: `lib/pipeline/phases/reviews.ts`
Czas: 1-2h
Koszt: ~$10-15

### Faza 9: FINANCE (KRS + rejestr.io) ✅ GOTOWE

Wejście: NIP z fazy discovery
Wyjście: wymiar 21
Narzędzie: rejestr.io API (primary) + KRS API (free) + RDF fallback
Implementacja: `lib/pipeline/phases/finance.ts`
Connector: `lib/connectors/rejestr-io.ts`
Pipeline (szczegóły: CATSCAN_KRS_SUPPLEMENT.md):
  1. Discovery: nazwa → NIP/KRS (faza 4)
  2. rejestr.io: dane rejestrowe + sprawozdania finansowe (~$0.05-0.50/req)
  3. Fallback: KRS API (free) + RDF XML
Czas: 3-5h
Koszt: ~$35-45 (zależy od coverage)
Coverage: ~70% rejestrowe, ~50-60% finansowe

### Faza 10: INTERPRETATION ✅ GOTOWE

Wejście: all structured data (21 wymiarów)
Wyjście: wymiar 20 (market signals) + cross-entity patterns + category fingerprint
Narzędzie: Claude Sonnet — category-level analysis
Implementacja: `lib/pipeline/phases/interpret.ts`
Uwaga: uruchamiana RAZ per scan (nie per-entity)
Czas: 15-30 min
Koszt: ~$10-15

### TOTAL PIPELINE:
- Faz: 10 (seed + 9 faz per-scan). Wszystkie zaimplementowane.
- Czas: 3-4 dni (z testowaniem i poprawkami, jednorazowo)
- Koszt: ~$200-250 (w tym ~$105 rejestr.io API za dane finansowe)
- Wynik: ~500 encji x ~180 atrybutów = ~90,000 data points
- Plus: ~7,500 kreacji reklamowych, ~20,000 postów social, ~750 sprawozdań finansowych
- Orchestrator: `app/api/scan/route.ts` — async, per-entity, z error handling i cost tracking

---

## 5. STORAGE

### MVP: JSON file storage ✅ AKTUALNIE

Implementacja: `lib/db/store.ts`
Pliki w `data/`:
- `brands.json` — 256 marek (seed data z Dietly + Google search)
- `scans.json` — historia scanów z pełnymi wynikami

Modele danych (TypeScript):
- `ScanRecord` — id, status, entities[], phasesCompleted[], log[], totalCostUsd
- `EntityRecord` — id, name, url, nip, data (JSONB-like), financials, status, errors

### Docelowo: Postgres (Supabase / Neon)

Schema przygotowany: `lib/db/schema.sql`

Tabele:
- entities — 500 wierszy, podstawowe dane
- snapshots — 1 wiersz per entity per scan (JSONB z atrybutami)
- dimensions — znormalizowane wymiary (opcjonalnie)
- queries — log pytań użytkowników
- reports — wygenerowane raporty

Snapshot JSONB pozwala:
- Łatwo dodawać nowe atrybuty bez migracji
- Porównywać snapshot T-1 vs T-0 (diff)
- Filtrować po dowolnym atrybucie ($->> operator)

### Rozmiar:
- 500 encji x ~5KB JSON = 2.5MB per snapshot
- Daily snapshots x 365 = ~900MB/rok
- Screenshoty (S3/Cloudflare R2): ~500MB per snapshot, ~50GB/rok z kompresją
- Wszystko mieści się w darmowych/tanich tierach

---

## 6. INTERFEJS MVP

### 6.0 Hub / Home ✅ GOTOWE — `app/page.tsx`

Hero: "CATSCAN // MARKET_INTELLIGENCE_ENGINE"
Trzy główne nawigacje:
  - Design_System → `/ds`
  - Scan_Engine → `/scan`
  - Query_Interface → `/chat`

### 6.1 Scan Engine ✅ GOTOWE — `app/scan/page.tsx`

Pełny interfejs do uruchamiania scanów:
  - Tabela input: dodaj firmy po NAME, URL, NIP (opcjonalnie)
  - 3 presetowe firmy (Maczfit, Kuchnia Vikinga, Cateromarket)
  - Wybór faz do uruchomienia (domyślnie: wszystkie 9)
  - Start scan → async pipeline w tle
  - Real-time progress (polling 2s):
    - Aktualna faza
    - Live log z timestampami
    - Status per entity (pending → crawled → extracted → enriched → failed)
    - Running cost w USD
    - Kolor statusu (żółty=running, zielony=done, czerwony=failed)
  - Preview danych encji (pricing, delivery, brand tone)
  - Link do Query Interface po zakończeniu

API: `POST /api/scan` → start, `GET /api/scan` → list, `GET /api/scan/[id]` → status

### 6.2 Query Interface ✅ GOTOWE — `app/chat/page.tsx`

Chat-like interface z Claude Sonnet jako analitykiem:
  - User wpisuje pytanie → Claude Sonnet:
    1. Dostaje pełny JSON dataset z ostatniego scana
    2. Analizuje dane w kontekście pytania
    3. Zwraca: tekst + tabela (markdown) + wnioski
  - Metadata per query: model, token count, koszt
  - Tabele auto-renderowane z markdown
  - Przykłady zapytań (PL):
    - "Pokaż ranking firm po cenie dnia — od najtańszej"
    - "Porównaj pozycjonowanie marek"
    - "Jakie modele dostawy stosują te firmy?"

API: `POST /api/chat`

### 6.3 Audit Page ✅ GOTOWE — `app/audit/page.tsx`

Weryfikacja danych ze scanów:
  - Przegląd wyników per entity
  - Dane finansowe (jeśli pobrane)
  - Quality check extracted dimensions

### 6.4 Design System ✅ GOTOWE — `app/ds/page.tsx`

Showcase wszystkich komponentów CATSCAN:
  - Sidebar z 5 sekcjami
  - Button, Card, Badge, Input, StatCard, SectionHeader, Table
  - Paleta kolorów i typografia
  - Static preview: `public/ds-preview.html`

### 6.5 Strona główna: Search + Dashboard — 🔜 PLANOWANE

Docelowy interfejs po migracji do Postgres:

  ┌─────────────────────────────────────────────┐
  │  Zapytaj o cokolwiek w branży...            │
  └─────────────────────────────────────────────┘

Pod spodem: 4 stat karty
  - 487 marek w bazie
  - ostatni scan: 2h temu
  - średnia cena/dzień: 67 PLN
  - nowych marek w Q1: 12

Pod statami: "Popularne zapytania" — klikalne gotowe pytania:
  - "Które marki mają najlepsze opinie?"
  - "Kto zmienił cennik w tym miesiącu?"
  - "Pokaż marki premium bez bloga"
  - "Top 10 najaktywniejszych na Instagramie"

### 6.6 Entity view — 🔜 PLANOWANE

Klikam w markę → pełna karta:
  - Wszystkie 21 wymiarów
  - Screenshot strony
  - Aktywne reklamy (screenshoty)
  - Timeline zmian (jeśli mamy historię)
  - Porównanie z kategorią (percentyle)

### 6.7 Report generator — 🔜 PLANOWANE

User wybiera:
  - Typ: Pełny sektor / Segment / Marka vs konkurenci
  - Format: PDF / Prezentacja / Dashboard link
  - Zakres: Wszystkie wymiary / Wybrane

System generuje raport z gotowymi insightami.

---

## 7. STACK TECHNOLOGICZNY

### Zaimplementowane ✅
- Frontend: Next.js 14.2 + React 18 + Tailwind CSS 3.4 + CATSCAN Design System
- Backend: Next.js API routes (serverless)
- AI: Claude Sonnet (interpretacja + chat) + Claude Haiku (extraction) — `@anthropic-ai/sdk`
- Crawling: curl (plain HTTP) + Apify actors (social, reviews, Google search)
- Ads: Meta Ad Library API connector
- Finance: rejestr.io API connector + KRS API
- Context: Perplexity sonar model
- Storage: JSON file-based (`lib/db/store.ts`) — MVP
- Design System: 9 komponentów (`components/ds/`)

### Do zbudowania 🔜
- Storage: Supabase Postgres (dane) + Cloudflare R2 (screenshoty)
- Scheduling: Vercel Cron lub Supabase Edge Functions (cykliczne scany)
- Auth: to co mamy (email + org system)
- Deploy: Vercel

### Zmienne środowiskowe (`.env.example`):
- `ANTHROPIC_API_KEY` — wymagany (Claude Haiku + Sonnet)
- `APIFY_API_TOKEN` — opcjonalny (social, reviews, Google search)
- `META_ADS_ACCESS_TOKEN` — opcjonalny (Meta Ad Library)
- `REJESTR_IO_API_KEY` — opcjonalny (dane finansowe)
- `PERPLEXITY_API_KEY` — opcjonalny (faza context)

---

## 8. FAZY BUDOWY

### FAZA 0: Extraction schema + seed data ✅ DONE
- ✅ Schema TypeScript (types w `lib/db/store.ts`, `lib/pipeline/types.ts`)
- ✅ Scraper Dietly sitemap → 177 marek
- ✅ Google search discovery → +78 marek = **256 total**
- ✅ `data/brands.json` z metadanymi Dietly (rating, reviews, ceny, diety)
- ✅ Domeny www per marka
- Brakuje: ~250 marek do docelowych 500

### FAZA 1: Pipeline + scan engine ✅ DONE
- ✅ 9-fazowy pipeline: crawl → extract → discovery → context → social → ads → reviews → finance → interpret
- ✅ Async orchestrator z error handling per entity (`app/api/scan/route.ts`)
- ✅ Cost tracking per scan (USD)
- ✅ Logging z timestampami
- ✅ Scan Engine UI z real-time progress
- ✅ JSON file storage (MVP)
- Brakuje: migracja do Postgres, pierwszy full scan 500 marek

### FAZA 2: Query interface ✅ DONE
- ✅ Chat UI z Claude Sonnet jako analitykiem
- ✅ Natural language queries nad danymi ze skanów
- ✅ Markdown rendering (tabele, listy)
- ✅ Token count + cost per query
- ✅ Audit page do weryfikacji danych
- Brakuje: entity view (karta marki), search dashboard

### FAZA 3: Report generator — 🔜 NASTĘPNA
- PDF export
- Prezentacja export
- Pre-built report templates
- Wynik: produkt do sprzedaży

### FAZA 4: Monitoring — 🔜 PLANOWANE
- Cron: weekly re-scan
- Diff engine: co się zmieniło
- Email alerts
- Wynik: Pulse — wartość cykliczna

### FAZA 5: Production — 🔜 PLANOWANE
- Migracja JSON → Supabase Postgres
- Auth (email + org system)
- Deploy na Vercel
- Cloudflare R2 (screenshoty, ad creatives)

---

## 9. KOSZTY (REALNIE)

### Setup (jednorazowo):
- Infrastruktura: $0 (free tiers)
- Pierwszy full scan (21 wymiarów + KRS): ~$150
- Czas: 5-7 tygodni dev

### Operacyjne (miesięcznie):
- Supabase Pro: $25/mies
- Cloudflare R2: ~$10/mies (screenshoty + ad creatives)
- Weekly re-scans — website + social (4x): ~$200/mies
- Monthly re-scan — KRS/finanse (1x): ~$40/mies
- Meta Ads monitoring (continuous): $0
- Ad hoc queries (Claude Sonnet): ~$30/mies
- Vercel Pro: $20/mies
- TOTAL: ~$325/mies ≈ 1,400 PLN/mies

### Revenue target (3 miesiące od startu):
- 2 klientów Pulse: 2 × 5,000 = 10,000 PLN/mies
- 1 raport jednorazowy/mies: 8,000 PLN
- TOTAL: 18,000 PLN/mies
- PROFIT: ~16,600 PLN/mies

---

## 10. PIERWSZY RUCH

1. ~~Zbuduj dataset (faza 0-1)~~ ✅ Seed ready (256 marek), pipeline gotowy
2. Uzupełnij bazę do ~500 marek (więcej miast, rankingi, polecenia)
3. Uruchom pierwszy full scan (wszystkie 9 faz, ~$200-250)
4. Wygeneruj sample report: "TOP 50 cateringów w Polsce — kto naprawdę się wyróżnia"
5. Opublikuj fragment na LinkedIn (5 insightów z danych)
6. Wyślij pełny sample do 10 największych cateringów
7. "Pełny raport z ~500 markami + dostęp do bazy: 12,000 PLN"

---

*CATSCAN_OS // v0.3 // CATERING_DIETETYCZNY*
*Updated: 2026-04-04*
*Changelog v0.3: aktualizacja statusu implementacji — wszystkie 9 faz pipeline gotowe, 256 marek w bazie, scan engine + query interface + audit page zbudowane, dodano sekcję o aktualnym storage (JSON MVP), zaktualizowano stack technologiczny i fazy budowy*
*Changelog v0.2: dodano wymiar 21 (KRS + finanse), rozszerzono social/ads, poprawiono pipeline i koszty*
