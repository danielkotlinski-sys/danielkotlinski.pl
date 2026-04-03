# CATSCAN // CATERING INTELLIGENCE ENGINE
## Brief produktowy — v0.2

---

## 1. CO TO JEST

Sektorowa baza wiedzy o rynku cateringów dietetycznych w Polsce.
400-600 marek. 21 wymiarów analizy per marka. ~100,000 atrybutów.
Dane komunikacyjne + finansowe + reklamowe + social + reputacja.
Odświeżane cyklicznie. Odpytywane w języku naturalnym.

Produkt docelowy: interfejs typu "zapytaj o cokolwiek w tej branży".
Produkt MVP: raport sektorowy + prosta wyszukiwarka + chat AI.

Patrz też: `CATSCAN_KRS_SUPPLEMENT.md` — szczegóły pozyskania danych z KRS.

---

## 2. SKĄD DANE

### 2.1 Źródło startowe: Dietly.pl

Dietly to największa platforma do zamawiania cateringów w Polsce.
Kataloguje marki z danymi strukturalnymi. Tylko Warszawa = 157 marek.

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

### 2.2 Źródło wtórne: strony www marek

Z Dietly mamy nazwy. Szukamy domen (Google/Perplexity).
Crawlujemy 3-5 podstron per marka:
- Homepage
- O nas / About
- Menu / Oferta
- Cennik / Pricing
- Blog (jeśli jest)

### 2.3 Źródło: Meta Ad Library

Publiczne API Meta. Wyszukujemy po nazwie marki.
Widzimy: aktywne reklamy, formaty, copy, CTA, daty uruchomienia.

### 2.4 Źródło: Social media

Apify actors na: Instagram, Facebook, TikTok.
Publiczne profile — posty, followersi, engagement, częstotliwość.

### 2.5 Źródło: Google Maps / Reviews

Rating, liczba opinii, lokalizacja, zdjęcia.

### 2.6 Źródło: Perplexity (kontekstowe)

Dla pytań wymagających kontekstu rynkowego:
trendy, media mentions, nowi gracze, zamknięcia.

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

### Faza 1: SEED (Dietly scrape)

Wejście: Dietly.pl — wszystkie miasta
Wyjście: lista marek + Dietly URL + metryki z Dietly
Narzędzie: Apify (web scraper) lub custom Playwright script
Czas: 1-2h
Koszt: ~$5

Wynik: ~500 encji z wymiarami 01 (częściowo), 02 (częściowo),
       03 (częściowo), 13 (Dietly dane), 14 (częściowo), 18 (częściowo)

### Faza 2: DOMAIN DISCOVERY

Wejście: nazwy marek z fazy 1
Wyjście: URL strony www per marka
Narzędzie: Perplexity batch lub Google search API
Czas: 1h
Koszt: ~$5-10

### Faza 3: WEBSITE CRAWL

Wejście: ~500 URL-i x 3-5 podstron = 1500-2500 URL-i
Wyjście: HTML + text + screenshots
Narzędzie: Apify website-content-crawler + screenshot actor
Czas: 2-4h
Koszt: ~$20-30

### Faza 4: STRUCTURED EXTRACTION

Wejście: raw text z crawla
Wyjście: JSON per marka — wymiary 04-07, 15-17, 19
Narzędzie: Claude Haiku per strona (~2K tokens in, ~1K out)
Czas: 30 min (parallel)
Koszt: ~$3-5

### Faza 5: SOCIAL MEDIA

Wejście: nazwy marek / URL-e social profiles
Wyjście: wymiary 09-12
Narzędzia:
  - Apify instagram-profile-scraper + post-scraper (20 postów/marka): ~$15-20
  - Apify facebook-pages-scraper (15 postów/marka): ~$10-15
  - Apify tiktok-scraper (10 filmów/marka): ~$10-15
Czas: 2-4h
Koszt: ~$35-50
Volume: 500 profili x 3 platformy, ~20,000 postów total

### Faza 6: REKLAMY (META)

Wejście: nazwy marek
Wyjście: wymiar 08
Narzędzie: Meta Ad Library API (darmowe, publiczne)
Czas: 2-3h
Koszt: $0
Volume: ~7,500 aktywnych kreacji reklamowych (est.)

### Faza 7: REVIEWS & GEO

Wejście: nazwy marek
Wyjście: wymiary 13 (Google), 14
Narzędzie: Apify Google Maps scraper
Czas: 1-2h
Koszt: ~$10-15

### Faza 8: KRS + DANE FINANSOWE

Wejście: nazwy marek z fazy 1
Wyjście: wymiar 21
Pipeline (szczegóły: CATSCAN_KRS_SUPPLEMENT.md):
  1. Perplexity batch: nazwa → NIP/KRS (~$10, 1-2h)
  2. API KRS: dane rejestrowe ($0, 2-3h)
  3. CEIDG API: dane JDG ($0, 30 min)
  4. Rejestr.io/RDF: sprawozdania finansowe za 3 lata (~$20-30, 3-5h)
  5. Parse + enrichment (~$2-3, 1h)
Czas: 8-12h
Koszt: ~$35-45
Coverage: ~70% rejestrowe, ~50-60% finansowe

### Faza 9: INTERPRETATION

Wejście: all structured data (21 wymiarów)
Wyjście: wymiar 20 (market signals) + cross-entity patterns + category fingerprint
Narzędzie: Claude Sonnet — category-level analysis
Czas: 15-30 min
Koszt: ~$10-15

### TOTAL PIPELINE:
- Czas: 3-4 dni (z testowaniem i poprawkami, jednorazowo)
- Koszt: ~$120-170
- Wynik: ~500 encji x ~180 atrybutów = ~90,000 data points
- Plus: ~7,500 kreacji reklamowych, ~20,000 postów social, ~750 sprawozdań finansowych

---

## 5. STORAGE

### Baza danych: Postgres (Supabase / Neon — free tier na start)

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

### 6.1 Strona główna: Search + Dashboard

Prosty ekran. Na górze:

  ┌─────────────────────────────────────────────┐
  │  🔍  Zapytaj o cokolwiek w branży...       │
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

### 6.2 Query result

User wpisuje pytanie → Claude Sonnet:
  1. Parsuje intencję
  2. Generuje SQL do Postgres
  3. Wykonuje query
  4. Interpretuje wyniki
  5. Zwraca: tekst + tabela + linki do encji

Wynik wyświetla się pod searchem. Zawiera:
  - Odpowiedź tekstowa (2-5 zdań)
  - Tabela z danymi (sortowalna)
  - Screenshoty stron (klikalne)
  - Źródła: "Na podstawie crawla z 03.04.2026"
  - Akcje: [Eksportuj PDF] [Dodaj do raportu] [Pogłęb]

### 6.3 Entity view

Klikam w markę → pełna karta:
  - Wszystkie 20 wymiarów
  - Screenshot strony
  - Aktywne reklamy (screenshoty)
  - Timeline zmian (jeśli mamy historię)
  - Porównanie z kategoria (percentyle)

### 6.4 Report generator

User wybiera:
  - Typ: Pełny sektor / Segment / Marka vs konkurenci
  - Format: PDF / Prezentacja / Dashboard link
  - Zakres: Wszystkie wymiary / Wybrane

System generuje raport z gotowymi insightami.

---

## 7. STACK TECHNOLOGICZNY

- Frontend: Next.js (mamy już) + CATSCAN Design System (mamy już)
- Backend: Next.js API routes + Postgres (Supabase)
- AI: Claude Sonnet (interpretacja) + Claude Haiku (extraction)
- Crawling: Apify (actors) + Meta Ad Library API
- Storage: Supabase Postgres (dane) + Cloudflare R2 (screenshoty)
- Scheduling: Vercel Cron lub Supabase Edge Functions (cykliczne scany)
- Auth: to co mamy (email + org system)

---

## 8. FAZY BUDOWY

### FAZA 0: Extraction schema + seed data (tydzień 1)
- Zdefiniuj schema w TypeScript (types)
- Scrapuj Dietly → seed ~500 marek
- Znajdź domeny dla marek
- Wynik: lista encji z podstawowymi danymi

### FAZA 1: Pipeline + pierwszy full scan (tydzień 2-3)
- Zbuduj pipeline: crawl → extract → store
- Pierwszy full scan 500 marek
- Dane w Postgres
- Wynik: baza z ~75,000 atrybutów

### FAZA 2: Query interface (tydzień 3-4)
- Prosty search UI
- Claude Sonnet jako query engine
- Entity view (karta marki)
- Wynik: działający prototyp do pokazania

### FAZA 3: Report generator (tydzień 4-5)
- PDF export
- Prezentacja export
- Pre-built report templates
- Wynik: produkt do sprzedaży

### FAZA 4: Monitoring (tydzień 5-6)
- Cron: weekly re-scan
- Diff engine: co się zmieniło
- Email alerts
- Wynik: Pulse — wartość cykliczna

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

1. Zbuduj dataset (faza 0-1)
2. Wygeneruj sample report: "TOP 50 cateringów w Polsce — kto naprawdę się wyróżnia"
3. Opublikuj fragment na LinkedIn (5 insightów z danych)
4. Wyślij pełny sample do 10 największych cateringów
5. "Pełny raport z 487 markami + dostęp do bazy: 12,000 PLN"

---

*CATSCAN_OS // v0.2 // CATERING_DIETETYCZNY*
*Updated: 2026-04-03*
*Changelog v0.2: dodano wymiar 21 (KRS + finanse), rozszerzono social/ads, poprawiono pipeline i koszty*
