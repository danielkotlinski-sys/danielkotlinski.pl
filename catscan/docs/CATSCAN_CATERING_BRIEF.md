# CATSCAN // CATERING INTELLIGENCE ENGINE
## Brief produktowy — v0.9

---

## 1. CO TO JEST

Sektorowa baza wiedzy o rynku cateringów dietetycznych w Polsce.
**239 marek w bazie = pełne pokrycie rynku (po cleanup).** 21 wymiarów analizy per marka. 175 atrybutów per marka = ~41,825 data points.
Dane komunikacyjne + finansowe + reklamowe + social + reputacja.
Odświeżane cyklicznie. Odpytywane w języku naturalnym.

Produkt docelowy: interfejs typu "zapytaj o cokolwiek w tej branży".
Produkt MVP: raport sektorowy + prosta wyszukiwarka + chat AI.

**Status:** MVP zbudowany — pipeline 11 faz, SQLite database, Command Center UI, query interface, audit page.
Baza: 239 marek (po cleanup: 256 → 239, usunięto 15 non-brand + 2 duplikaty, naprawiono 46 nazw).
Production-ready: batch scanning (max 20/run), rescan_incomplete mode, post-scan validation (19/19 dims required), rate limiting + retry.

Patrz też: `CATSCAN_KRS_SUPPLEMENT.md` — szczegóły pozyskania danych z KRS.
Patrz też: `CATSCAN_PRODUCT_INSIGHT.md` — design produktowy (decision maps, nie raporty).

---

## 2. SKĄD DANE

### 2.1 Źródło startowe: Dietly.pl ✅ ZAIMPLEMENTOWANE

Dietly to największa platforma do zamawiania cateringów w Polsce.
Kataloguje marki z danymi strukturalnymi. Scraper zbudowany — parsuje sitemap Dietly.
**Aktualnie:** 177 marek z Dietly + 78 z Google search = 256 → **239 po cleanup** w `data/brands.json`.

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

**Dietly SSR extraction** — z `__NEXT_DATA__` na profilu firmy:
- Pełna struktura diet: nazwy, tiery, warianty kaloryczne, dietCaloriesId
- cityId z query key SSR
- priceRange (minPrice per tier)
- Calorie options (wszystkie dostępne kaloryczności)

**Dietly calculate-price API** (reverse-engineered, v0.8):
- Endpoint: `POST /api/dietly/open/shopping-cart/calculate-price`
- Headers: `company-id`, `x-guest-session`
- Body: shopping cart z cityId, companySlug, simpleOrders[{dietCaloriesId, tierDietOptionId}]
- Response: `totalDietWithoutSideOrdersCost` = dokładna cena dzienna PLN
- Koszt: **$0** (wewnętrzne API Dietly, nie wymaga autentykacji)
- Dokładność: **100%** — ceny z silnika cenowego Dietly
- Pokrycie: ~177 marek Dietly (minus ~10-20% bez skonfigurowanego cennika)

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

Apify actors na: Instagram, Facebook, TikTok + YouTube via Perplexity.
Publiczne profile — posty, followersi, engagement, częstotliwość.
Connector: `lib/connectors/apify.ts`. Wymaga `APIFY_API_TOKEN`.
Fallback: Perplexity AI gdy Apify nie może scrapować (Facebook blokady, etc.).

**Instagram posts — stratified sampling:**
- Call #1 (istniejący): profil — followers, bio, engagement rate
- Call #2 (nowy): ~50 postów → filtrowane do 20 próbkowych:
  - 6 najnowszych (~2 tygodnie) = bieżąca aktywność
  - 14 równomiernie z ostatnich 6 miesięcy = tło strategiczne
- Per post: caption (500 zn.), likes, comments, typ (Image/Video/Sidecar), data, hashtagi
- Analiza: posting frequency, engagement trend (rising/stable/declining), top 15 hashtagów, content mix
- Dodatkowy czas: ~30s per profil (call #2). Dodatkowy koszt: ~$0.01/profil Apify
- Logika próbkowania: jeśli marka ma kampanię w ostatnich 2 tygodniach — widzimy to w 6 recent posts. Ale avg likes/comments historical daje baseline z 6 miesięcy. engagementTrend porównuje recent vs historical — jeśli recent > 1.2x historical = "rising", jeśli < 0.8x = "declining".

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
Każdy wymiar ma 4-29 atrybutów. Łącznie: **175 atrybutów per marka**.
Atrybuty mają typy: text, number, enum, boolean, array, date.

### Volume danych per marka (poza atrybutami):
- Instagram: 20 ostatnich postów (posty z likes, comments, caption)
- Facebook: 15 ostatnich postów (reactions, shares, comments)
- TikTok: 10 ostatnich filmów (views, likes, style)
- Meta Ads: wszystkie aktywne reklamy (typowo 5-30, niektóre 100+)

### Volume łączne przy 239 markach (est.):
- Atrybuty structured: 239 × 175 = **~41,825 data points**
- Social posts: ~9,500 (nie wszystkie marki na każdej platformie; TikTok ~50-80 aktywnych)
- Ad creatives: ~3,600 (239 × ~15 avg aktywnych reklam)
- Sprawozdania finansowe: ~360 (120 sp. z o.o. × 3 lata)

### WYMIAR 01: IDENTYFIKACJA
- name: text — nazwa marki
- slug: text — identyfikator
- website_url: text — domena
- dietly_url: text — profil na Dietly
- logo_url: text — URL logo
- founded_year: number — rok założenia (jeśli dostępny)
- legal_entity: text — nazwa spółki (jeśli dostępna)

### WYMIAR 02: POZYCJONOWANIE CENOWE
Źródło: Dietly calculate-price API (177 marek, 100% dokładność, $0 koszt) + Perplexity fallback (~62 marki non-Dietly).
Metodologia: cena dziennej diety "Wybór menu" / "Standard" (najniższy tier) dla każdego wariantu kalorycznego.
- price_category: enum [ekonomiczny, standardowy, premium, super-premium]
- price_per_day_min: number — najniższa cena za dzień (PLN)
- price_per_day_max: number — najwyższa cena za dzień (PLN)
- price_1500kcal: number — cena benchmarkowa za 1500 kcal/dzień (PLN)
- price_2000kcal: number — cena benchmarkowa za 2000 kcal/dzień (PLN)
- price_by_kcal: map{kcal → price} — pełna mapa cen per kaloryczność (PLN/dzień)
  Przykład: {1200: 65.99, 1500: 72.99, 1800: 75.99, 2000: 77.99, 2500: 85.99, 3000: 91.99}
- cheapest_daily: number — najtańszy wariant kaloryczny (PLN/dzień)
- benchmark_diet_name: text — nazwa diety użytej do benchmarku
- diet_prices: array[{name, kcal, price_per_day}] — rozbicie cen per dieta
- price_source: enum [dietly-api, crawl, perplexity, estimated] — skąd cena
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
Źródło: Apify screenshot-url actor (1440x900, 3s wait) + Claude Haiku 4.5 (multimodal vision).
Nowa faza `visual` w pipeline — automatyczna analiza screenshota homepage.
- dominant_colors: array[text] — hex kolory (z vision analysis)
- color_palette_type: text — typ palety kolorów
- typography_class: enum [sans-serif, serif, mixed, handwritten]
- image_style: enum [food-photography, lifestyle, minimal, illustrative]
- layout_pattern: enum [hero-image, split, video-bg, text-first, carousel]
- overall_aesthetic: enum [premium, clean, bold, playful, clinical, budget]
- logo_description: text — opis logo z vision analysis
- visual_quality_score: number 1-10 — ocena jakości wizualnej (AI)
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
239 marek x ~15 avg = ~3,600 kreacji do przeanalizowania. Koszt API: $0.
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
Źródło: Apify instagram-profile-scraper (Call #1) + instagram-scraper posts (Call #2, stratified).
Zbieramy: profil + 20 próbkowych postów per marka (6 recent + 14 historical). Koszt: ~$15-20 za 239 marek.
- ig_handle: text
- ig_followers: number
- ig_following: number
- ig_posts_count: number
- ig_bio: text
- ig_link_in_bio: text
- ig_verified: boolean
- ig_avg_likes_recent: number — średnia z 6 najnowszych postów
- ig_avg_likes_historical: number — średnia z 14 postów historycznych (6 mies.)
- ig_avg_comments_recent: number
- ig_avg_comments_historical: number
- ig_engagement_rate: number — (likes+comments) / followers %
- ig_engagement_trend: enum [rising, stable, declining, insufficient_data] — recent vs historical
- ig_posting_frequency: text — np. "4.2 posts/week"
- ig_content_mix: object — {Image: N, Video: N, Sidecar: N}
- ig_top_hashtags: array[{tag, count}] — 15 najczęstszych hashtagów
- ig_recent_posts: array[IgPost] — 20 próbkowych (6 recent + 14 historical), per post: caption (500 zn.), likes, comments, typ, data, hashtagi, sampleBucket

### WYMIAR 10: FACEBOOK
Źródło: Apify facebook-pages-scraper. Ostatnie 15 postów. Koszt: ~$10-15 za 239 marek.
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
Źródło: Apify `clockworks~free-tiktok-scraper`. Auto-discovery po slug domeny/nazwy (nie wymaga URL z crawla).
Stratified sampling: 30 raw → 12 postów (4 recent + 8 historical). Koszt: ~$0.04/brand.
Uwaga: realnie 50-100 z 239 marek będzie aktywnych na TikToku.
- tiktok_handle: text
- tiktok_url: text — pełny URL profilu
- tiktok_followers: number
- tiktok_total_likes: number — łączna liczba serc
- tiktok_videos_count: number — łączna liczba filmów
- tiktok_avg_views_recent: number — średnia z 4 najnowszych
- tiktok_avg_views_historical: number — średnia z 8 historycznych
- tiktok_engagement_trend: enum [rising, stable, declining, insufficient_data]
- tiktok_posting_frequency: text — np. "2.4 posts/week"
- tiktok_top_hashtags: array[{tag, count}] — top 15 hashtagów
- tiktok_posts: array[12] — stratified sample:
  - url: text — link do filmu
  - views, likes, comments, shares: number
  - caption: text (500 zn.)
  - hashtags: array[text]
  - timestamp: date
  - sampleBucket: enum [recent, historical]

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

### WYMIAR 21: DANE REJESTROWE I FINANSOWE (KRS + Perplexity fallback)
Źródło: API KRS (darmowe) + RDF/rejestr.io (sprawozdania finansowe) + `/krs-powiazania` (zarząd/udziałowcy).
Fallback: Perplexity sonar gdy KRS nie ma przychodów (holdingi, mikro-spółki, JDG) — szuka podmiotu operacyjnego i szacuje revenue z publicznych źródeł (aleo.com, money.pl, artykuły).
Szczegółowy pipeline: patrz `CATSCAN_KRS_SUPPLEMENT.md`.
Coverage: ~70% dane rejestrowe, ~85% revenue (KRS + Perplexity fallback).
Koszt: ~$74 za 239 marek (~$0.31/brand).
- legal_name: text — pełna nazwa prawna ("FIT CATERING SP. Z O.O.")
- krs_number: text
- nip: text
- regon: text
- legal_form: enum [sp_zoo, sa, jdg, sc, sk, other]
- registration_date: date — kiedy firma powstała
- share_capital: number — kapitał zakładowy (PLN, z parsowania Bilansu)
- shareholders: array[{name, share_pct}] — udziałowcy (z `/krs-powiazania`)
- is_sole_owner: boolean
- board_members: array[{name, role}] — zarząd z rolami (z `/krs-powiazania`)
- board_size: number
- pkd_primary: text — główny kod PKD
- hq_address: text
- has_debt_entries: boolean — zaległości w KRS (dział 4)
- is_in_liquidation: boolean
- revenue_source: enum [krs, perplexity-estimate, unavailable] — skąd dane o przychodach
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
- perplexity_estimate: object|null — gdy `revenue_source = 'perplexity-estimate'`:
  - operating_entity_name: text — nazwa podmiotu operacyjnego (jeśli inna niż KRS entity)
  - operating_entity_nip: text
  - estimated_annual_revenue: number (PLN)
  - confidence: enum [high, medium, low]
  - notes: text — kontekst i źródło szacunku

---

## 4. POZYSKANIE DANYCH — PIPELINE

### Faza 1: SEED (Dietly scrape) ✅ GOTOWE

Wejście: Dietly.pl sitemap + Apify Google Search ("catering dietetyczny [miasto]")
Wyjście: lista marek + Dietly URL + metryki z Dietly + domeny www
Narzędzie: Custom scraper (parsuje sitemap Dietly) + Apify Google Search
Implementacja: `lib/pipeline/phases/seed.ts`
Aktualny wynik: **239 marek** (256 raw → cleanup: -15 non-brand, -2 duplikaty, 46 nazw naprawionych)

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

### Faza 3.5: VISUAL IDENTITY ✅ GOTOWE (nowa)

Wejście: URL homepage marki
Wyjście: wymiar 05 (identyfikacja wizualna — 8 atrybutów z vision AI)
Narzędzia:
  - Apify screenshot-url actor: screenshot homepage 1440x900px, 3s wait
  - Claude Haiku 4.5 (multimodal vision): analiza screenshota
Implementacja: `lib/pipeline/phases/visual.ts`
Atrybuty: dominant_colors (hex), color_palette_type, typography_class, image_style, layout_pattern, overall_aesthetic, logo_description, visual_quality_score (1-10)
Koszt: ~$0.05/brand (Apify screenshot + Haiku vision call)
Resume marker: `visual_identity`
Przykład: Maczfit → dominant_colors: ["#00B341", "#FFFFFF"], overall_aesthetic: "clean", visual_quality_score: 8

### Faza 4: CONTEXT (Perplexity) ✅ GOTOWE — przesunieta przed discovery

Wejście: nazwa marki + kontekst rynkowy
Wyjście: founder, rok założenia, media mentions, influencerzy, unikalne cechy, trajectory, legalName, NIP (bonus)
Narzędzie: Perplexity sonar model (~$0.005/query)
Implementacja: `lib/pipeline/phases/context.ts`
Wymaga: `PERPLEXITY_API_KEY`
Czas: 1-2h (239 marek)
Koszt: ~$2.50
Dwuprzebiegowy: pass 1 = core business data, pass 2 = media intelligence.
Dodatkowe pola: employeeRange, uniqueInsight, legalName (backfill do discovery).

### Faza 4.5: PRICING FALLBACK ✅ GOTOWE (v0.8 — Dietly API)

Wejście: encje bez benchmark pricing
Wyjście: price_1500kcal, price_2000kcal, **price_by_kcal{}**, cheapest_daily, calorie_options[]
Implementacja: `lib/pipeline/phases/pricing-fallback.ts`

**Dwa ścieżki:**

**Path A: Dietly brands (177/239) — Dietly calculate-price API (FREE, 100% accurate)**
  1. Curl profil firmy na Dietly → parse `__NEXT_DATA__` → struktura diet (nazwy, tiery, kaloryczności, ID)
  2. Znajdź dietę benchmarkową: "Wybór menu" > "Standard" > "Klasyczna" > pierwsza
  3. Dla każdego wariantu kalorycznego: call `POST /api/dietly/open/shopping-cart/calculate-price`
  4. Response: `totalDietWithoutSideOrdersCost` = dokładna cena PLN/dzień
  5. Wynik: pełna mapa `price_by_kcal: {1200: 65.99, 1500: 72.99, ..., 3000: 91.99}`
  - Koszt: **$0** (wewnętrzne API Dietly)
  - Dokładność: **100%**
  - Czas: ~1s/wariant, ~7s/brand (avg 7 wariantów)
  - Pokrycie: ~85% marek Dietly (reszta nie ma cennika w Dietly)

**Path B: Non-Dietly brands (62/239) — Perplexity fallback**
  - Targeted query: "cena diety [brand] 1500/2000 kcal"
  - Koszt: ~$0.005/brand
  - Dokładność: ~30-50%

**Calorie options:** wypełnia `menu.calorie_options`:
  1. Z Dietly SSR (free, 100% accurate) — lub —
  2. Z Perplexity response — lub —
  3. Dedykowane zapytanie Perplexity
  Przykład: Viking → [1000, 1200, 1500, 1800, 2000, 2200, 2500, 3000, 3500]

Przykładowe wyniki:
  - Kuchnia Vikinga: {1200: 65.99, 1500: 72.99, 1800: 75.99, 2000: 77.99, 2200: 81.99, 2500: 85.99, 3000: 91.99}
  - Maczfit: {1200: 90, 1500: 99, 1800: 103, 2000: 107, 2500: 113, 3000: 123}

### Faza 5: DISCOVERY (NIP/KRS) ✅ GOTOWE — przepisana

Wejście: nazwa marki + legalName z fazy context + ewentualny NIP z crawla
Wyjście: potwierdzony NIP, numer KRS, forma prawna
Narzędzie: rejestr.io name search (primary) + website legal pages (fallback) + Perplexity (bonus)
Implementacja: `lib/pipeline/phases/discovery.ts`
Walidacja: algorytm checksum NIP
NIP resolution chain (5 kroków):
  1. Crawled z website (footer/regulamin) — bezpośredni, bez luki
  2. Perplexity AI (zna mapowanie brand→legal entity) — AI bridge
  3. rejestr.io search by legalName z Perplexity — trafne wyszukiwanie
  4. rejestr.io search by brand name — hail mary
  5. Legal pages crawl — last resort
Koszt: ~$0.05 PLN/req rejestr.io, ~85% hit rate

### Faza 6: SOCIAL MEDIA ✅ GOTOWE — rozszerzona (IG + TikTok sampling)

Wejście: nazwy marek / URL-e social profiles (z crawla)
Wyjście: wymiary 09-12
Narzędzia:
  - **Instagram** (2 wywołania Apify/marka):
    - Call #1: `apify/instagram-profile-scraper` — profil (followers, bio, posts count)
    - Call #2: `apify/instagram-scraper` — ~50 postów → **20 stratified** (6 recent + 14 historical)
    - Dane per post: URL, caption, hashtags, likes, comments, timestamp, sampleBucket
    - Analiza: posting frequency, engagement rate (likes+comments/followers), trend (recent vs historical)
  - **TikTok** (auto-discovery + sampling):
    - Discovery: generowanie kandydatów slug z domeny/nazwy (np. vikingdietcatering, viking_diet_catering)
    - Call #1: `clockworks~free-tiktok-scraper` — próba każdego kandydata, pierwszy z valid authorMeta = match
    - Call #2: `clockworks~free-tiktok-scraper` — ~30 postów → **12 stratified** (4 recent + 8 historical)
    - Dane per post: URL, caption, hashtags, views, likes, comments, shares, timestamp, sampleBucket
    - Analiza: posting frequency, engagement trend (views-based: recent vs historical), top hashtags
    - Koszt: ~$0.04/marka (~$10 za 239 marek)
  - **Facebook**: Apify facebook-pages-scraper (15 postów/marka): ~$10-15
  - **YouTube**: via Perplexity (subscribers, total views)
  - Fallback: Perplexity AI gdy Apify nie może scrapować (Facebook blokady, prywatne profile)
Implementacja: `lib/pipeline/phases/social.ts`
Connector: `lib/connectors/apify.ts`
Czas: 2-4h
Koszt: ~$40-55
Volume: 239 profili x 4 platformy, ~12,600 postów total (IG 20 + TT 12 + FB 15 + YT meta)

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

### Faza 9: FINANCE (KRS + rejestr.io + Perplexity fallback) ✅ GOTOWE — rozszerzona ekstrakcja

Wejście: NIP z fazy discovery
Wyjście: wymiar 21 (rozszerzony: pełny RZiS + Bilans + wskaźniki + revenue fallback)
Narzędzie: rejestr.io API (primary) + Perplexity sonar (fallback) + KRS API (free)
Implementacja: `lib/pipeline/phases/finance.ts`
Connector: `lib/connectors/rejestr-io.ts`
Pipeline (szczegóły: CATSCAN_KRS_SUPPLEMENT.md):
  1. Discovery: nazwa → NIP/KRS (faza 5, po context)
  2. rejestr.io: dane rejestrowe + sprawozdania finansowe (~$0.05-0.50/req)
  3. `/krs-powiazania`: pełny zarząd z rolami + udziałowcy
  4. **Revenue check**: czy KRS ma przychody w jakimkolwiek roku?
  5. **Perplexity fallback** (gdy brak revenue): szuka podmiotu operacyjnego (holding vs operating entity),
     szacuje przychody z publicznych źródeł (aleo.com, money.pl, artykuły prasowe, InfoVeriti)
  6. **No-NIP path**: gdy brak NIP → Perplexity-only estimation
Rozszerzona ekstrakcja:
  - RZiS: COGS, zysk brutto (regex: "Zysk (strata) ze sprzedaży"), koszty sprzedaży, koszty administracyjne, przychody/koszty finansowe, zysk pre-tax, podatek, amortyzacja, wynagrodzenia
  - Bilans: aktywa trwałe/obrotowe, zapasy, należności, gotówka, kapitał zakładowy (z parsowania Bilansu), zyski zatrzymane, zadłużenie krótko/długoterminowe
  - Wskaźniki: net/operating/gross margin, ROE, ROA, debt/equity ratio, current ratio, revenue growth
  - KRS: członkowie zarządu z rolami, udziałowcy (name + share_pct) — via `/krs-powiazania`
  - **Perplexity fallback**: revenue_2022/2023/2024, net_income, employee_count, operating_entity_name/nip, confidence (high/medium/low)
  - Pole `revenue_source`: `'krs'` | `'perplexity-estimate'` | `'unavailable'`
  - Przykład: Maczfit → shareholders: [Żabka Polska], board: 3 members, grossProfit: 2.8M PLN (source: krs)
  - Przykład: BeDiet → KRS holding 0 PLN revenue, Perplexity: ~42M PLN/rok z money.pl (source: perplexity-estimate, confidence: low)
Czas: 3-5h
Koszt: ~$0.31/brand (~$0.30 rejestr.io + ~$0.005 Perplexity fallback), ~$74 za 239 marek
Coverage: ~70% rejestrowe, ~85% revenue (KRS + Perplexity fallback)

### Faza 10: INTERPRETATION ✅ GOTOWE

Wejście: all structured data (21 wymiarów)
Wyjście: wymiar 20 (market signals) + cross-entity patterns + category fingerprint
Narzędzie: Claude Sonnet — category-level analysis
Implementacja: `lib/pipeline/phases/interpret.ts`
Uwaga: uruchamiana RAZ per scan (nie per-entity)
Czas: 15-30 min
Koszt: ~$10-15

### TOTAL PIPELINE:
- Faz: 12 (seed + 11 faz per-scan). Wszystkie zaimplementowane.
- Kolejność: crawl → extract → **visual** → context → pricing_fallback → discovery → social → ads → reviews → finance → interpret
- Kluczowa zmiana v0.8: **Dietly calculate-price API** (pełna mapa cenowa per kcal, FREE), **TikTok auto-discovery** (slug + Apify, 30→12 postów), **Finance Perplexity fallback** (revenue estimation gdy KRS nie ma danych)
- Kluczowa zmiana v0.7: nowa faza `visual` między extract i context (Apify screenshot + Haiku vision)
- Kluczowa zmiana v0.6: context PRZED discovery (Perplexity dostarcza legalName → trafniejsze wyszukiwanie w rejestr.io)
- Czas: 3-4 dni (z testowaniem i poprawkami, jednorazowo)
- Koszt: ~$145 za 239 marek (~$0.61/brand) — oszczędność ~$15 dzięki Dietly API vs Perplexity
- Wynik: 239 encji x 178+ atrybutów = ~42,500+ data points
- Plus: ~3,600 kreacji reklamowych, ~12,600 postów social (IG 20 + TT 12 + FB 15 per marka), ~360 sprawozdań finansowych
- Orchestrator: `app/api/scan/route.ts` — async, per-entity, z error handling i cost tracking
- AI backend: curl do Claude API (zamiast Anthropic SDK — SDK timeout w sandbox, curl działa stabilnie)
- **Resume**: pipeline potrafi wznowić się po crashu/restarcie serwera (patrz sekcja 4.1)
- **Persistence**: wyniki mergowane do SQLite (`catscan.db`) po każdej fazie (patrz sekcja 5)
- **Validation**: post-scan check — 19 wymiarów wymaganych, brands z brakami flagowane jako INCOMPLETE
- **Batch mode**: `POST /api/scan { batch: 20 }` — skanuje N następnych nieskanowanych marek (cap: 20)
- **Rescan**: `POST /api/scan { rescan_incomplete: true }` — naprawia marki z <19 wymiarami

### 4.1 RESUME — odporność na crash/restart ✅ GOTOWE

Problem: pipeline async biegnie in-memory. Restart serwera (Railway redeploy, crash, timeout) = pipeline umiera, dane w `scans.json` zostają w stanie `running`.

Rozwiązanie — dwupoziomowe:

**Poziom 1: Persistence danych (automatyczny)**
- `mergeScanIntoBrands()` — po każdej zakończonej fazie wyniki mergowane do SQLite (`scan_results` + `financial_years` + `social_posts`)
- Matchowanie entity → brand po domenie (primary) lub nazwie (fallback)
- `catscan.db` żyje w data/ — SQLite z WAL mode, atomowe transakcje
- Explorer, Chat, Entities czytają z SQLite jako jedynego źródła prawdy

**Poziom 2: Resume pipeline (ręczny)**
- Każda faza ma marker w `entity.data` (np. `_meta` dla crawl, `context` dla context, `_discovery` dla discovery)
- `entityHasPhaseData()` sprawdza per-entity czy faza już przeszła
- `runEntityPhase()` pomija encje z istniejącymi danymi — nie powtarza pracy

Flow po crashu:
```
# 1. Reset stuck scan (status running → failed)
PATCH /api/scan  { "scanId": "abc-123" }

# 2. Resume — pomija ukończone fazy + encje z danymi
POST /api/scan   { "resume": "abc-123" }
```

Markery per faza:
| Faza | Marker w entity.data |
|------|---------------------|
| crawl | `_meta` |
| extract | `_extraction` |
| visual | `visual_identity` |
| context | `context` |
| pricing_fallback | `pricing._pricing_fallback_done` |
| discovery | `_discovery` |
| social | `social` |
| ads | `ads` |
| reviews | `reviews` |
| finance | `finance` |

Implementacja: `app/api/scan/route.ts` (PATCH + POST resume + entityHasPhaseData)

---

## 5. STORAGE

### SQLite — jedyne źródło prawdy ✅ ZAIMPLEMENTOWANE (v0.9)

Implementacja: `lib/db/sqlite.ts` (schema + prepared statements) + `lib/db/store.ts` (high-level API)
Plik: `data/catscan.db` (WAL mode, foreign keys)
Deploy: Railway (persistent container)

**Architektura — znormalizowana baza danych:**
- **brands** — 239 rekordów masterdata (slug PK, name, domain, url, dietly_slug, nip, krs, last_scan_id)
- **scan_results** — 1 wiersz per marka (slug PK → brands, data JSON blob ze wszystkimi wymiarami, phase_count, phases[])
- **financial_years** — znormalizowane finanse per marka×rok (revenue, net_income, margins, wskaźniki, revenue_source)
- **social_posts** — znormalizowane posty per marka×platforma×post (IG/TikTok, likes, comments, views, caption, hashtags)
- **scans** — audit log pipeline (id, status, entities JSON, log, cost, timestamps)

**Indeksy:** brands.domain, brands.nip, financial_years.slug, social_posts.slug+platform

**Migracja z JSON:**
- Jednorazowy skrypt: `scripts/migrate-json-to-sqlite.ts`
- Przeniesiono 239 marek z `brands.json` + 8 wyników skanów + financial_years + social_posts
- `brands.json` zachowany jako seed backup, ale NIE jest już źródłem prawdy

**Zapytania (prepared statements):**
- `stmts.getBrand(slug)`, `stmts.getBrandByDomain(domain)`, `stmts.getAllBrands()`
- `stmts.upsertScanResult({slug, data, phaseCount, phases})` — atomowy UPSERT
- `stmts.upsertFinancialYear(...)` — UNIQUE(slug, year_end)
- `stmts.upsertSocialPost(...)` — UNIQUE(slug, platform, post_id)
- `stmts.getScannedBrands()` — JOIN brands+scan_results

**Struktura scan_results.data (JSON blob per marka):**
```json
{
  "_meta": { /* crawl */ },
  "_extraction": { /* extract cost/tokens */ },
  "visual_identity": { /* dominant_colors, aesthetic, quality_score */ },
  "context": { /* founder, trajectory, legalName */ },
  "pricing": { /* ceny, price_by_kcal, benchmarki */ },
  "_discovery": { /* NIP, KRS, forma prawna */ },
  "social": { /* IG, TikTok, FB, YouTube */ },
  "ads": { /* Meta Ads */ },
  "reviews": { /* Google + Dietly ratings */ },
  "finance": { /* KRS + sprawozdania + wskaźniki */ }
}
```

Modele danych (TypeScript):
- `ScanRecord` — id, status, entities[], phasesCompleted[], log[], totalCostUsd
- `EntityRecord` — id, name, url, nip, data (JSONB-like), financials, status, errors

### Docelowo: Postgres (Supabase / Neon) — 🔜 gdy potrzeba

Migracja ma sens gdy: diff engine (porównanie skanów w czasie), multi-user access, albo >1000 marek.
SQLite → Postgres: proste, ten sam model danych.

### Rozmiar:
- `catscan.db`: ~700 KB (8 marek zeskanowanych), est. ~5-8 MB po full scan 239 marek
- Screenshoty (Cloudflare R2): ~500MB per snapshot — do zbudowania

---

## 6. INTERFEJS MVP

### 6.0 Hub / Home ✅ GOTOWE — `app/page.tsx`

Hero: "CATSCAN // MARKET_INTELLIGENCE_ENGINE"
Trzy główne nawigacje:
  - Design_System → `/ds`
  - Scan_Engine → `/scan`
  - Query_Interface → `/chat`

### 6.1 Command Center ✅ GOTOWE — `app/scan/page.tsx` (v0.9 rewrite)

Trzy zakładki — pełny interfejs do zarządzania skanowaniem:

**Tab 1: Dashboard**
  - Progress bar: scanned / total brands
  - 5-stat grid: total brands, scanned, complete (19/19), incomplete, remaining
  - Action buttons: BATCH_20 (skan 20 następnych), BATCH_5, RESCAN_INCOMPLETE (napraw brakujące wymiary)
  - Lista incomplete brands: slug, name, dims count, missing dimensions
  - Recent scans: ostatnie wyniki z phase_count i datą

**Tab 2: Manual**
  - Single brand scan: input na name + URL
  - Start scan → async pipeline w tle

**Tab 3: Log**
  - Real-time pipeline monitor (polling 3s)
  - Active scan card: id, status, faza, koszt, czas
  - Entity progress list: nazwa, status, dim count per entity
  - Full pipeline log: color-coded (fazy, errory, koszty), auto-scroll

API:
  - `POST /api/scan` → start nowy scan, batch (`{ batch: N }`), resume (`{ resume: scanId }`), rescan (`{ rescan_incomplete: true }`)
  - `PATCH /api/scan` → reset stuck scan (`{ scanId }`) — running → failed
  - `GET /api/scan` → list, `GET /api/scan/[id]` → status
  - `GET /api/scan/stats` → database stats (total/scanned/complete/incomplete counts, incomplete list, recent scans)

**Production safeguards:**
  - Batch cap: max 20 brands per run (hard limit)
  - Post-scan validation: 19 expected dimensions checked per entity after every scan
  - `rescan_incomplete`: finds brands with <19 dims, creates scan for all of them
  - Rate limiting: per-provider sliding window (Perplexity 20/min, Apify 10/min, rejestr.io 30/min, Anthropic 15/min)
  - Retry: exponential backoff with ±20% jitter, max 3 retries on 429/503

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

### 6.4 Data Explorer ✅ GOTOWE — `app/explore/page.tsx`

Interaktywne porównanie marek ze scanu:
  - 14 zakładek wymiarowych (pricing, social, messaging, SEO, ads, etc.)
  - Tabela z sortowaniem po dowolnej kolumnie
  - Slide-out panel z detalami encji
  - Szukanie i filtrowanie marek
  - Widok card/table
  - Kolumny IG: frequency, engagement trend, avg likes recent vs historical
  - Kolumny pricing: 1500 kcal, 2000 kcal, diet breakdown
  - Wynik testu: 10/10 extract, 10/10 context, 4/10 finance

### 6.5 Design System ✅ GOTOWE — `app/ds/page.tsx`

Showcase wszystkich komponentów CATSCAN:
  - Sidebar z 5 sekcjami
  - Button, Card, Badge, Input, StatCard, SectionHeader, Table
  - Paleta kolorów i typografia
  - Static preview: `public/ds-preview.html`

### 6.6 Strona główna: Search + Dashboard — 🔜 PLANOWANE

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

### 6.7 Entity view — 🔜 PLANOWANE

Klikam w markę → pełna karta:
  - Wszystkie 21 wymiarów
  - Screenshot strony
  - Aktywne reklamy (screenshoty)
  - Timeline zmian (jeśli mamy historię)
  - Porównanie z kategorią (percentyle)

### 6.8 Report generator — 🔜 PLANOWANE

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
- AI: Claude Sonnet (interpretacja + chat) + Claude Haiku (extraction) — via curl (nie SDK, bo timeout w sandbox)
- Crawling: curl (plain HTTP) + Apify actors (social, reviews, Google search)
- Ads: Meta Ad Library API connector
- Finance: rejestr.io API connector + KRS API
- Context: Perplexity sonar model
- Storage: SQLite (`data/catscan.db`, WAL mode) — `lib/db/sqlite.ts` + `lib/db/store.ts`
- Resilience: `lib/utils/resilient-fetch.ts` — per-provider rate limiting, exponential backoff, retry on 429/503
- Deploy: Railway (persistent container)
- Design System: 9 komponentów (`components/ds/`)

### Do zbudowania 🔜
- Storage upgrade: Postgres (Supabase/Neon) gdy diff engine / multi-user + Cloudflare R2 (screenshoty)
- Wire resilient-fetch.ts into pipeline phases (phases still use raw execSync+curl)
- Scheduling: Railway Cron lub external (cykliczne scany)
- Auth: to co mamy (email + org system)

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
- ✅ Google search discovery → +78 marek = 256 raw
- ✅ Brand data cleanup: 256 → **239 clean brands** (46 bad names fixed, 15 non-brand removed, 2 deduplicated)
- ✅ `data/brands.json` z metadanymi Dietly (rating, reviews, ceny, diety)
- ✅ Domeny www per marka
- 239 marek = pełne pokrycie rynku

### FAZA 1: Pipeline + scan engine ✅ DONE
- ✅ 11-fazowy pipeline: crawl → extract → visual → context → pricing_fallback → discovery → social → ads → reviews → finance → interpret
- ✅ Async orchestrator z error handling per entity (`app/api/scan/route.ts`)
- ✅ Cost tracking per scan (USD)
- ✅ Logging z timestampami
- ✅ Scan Engine UI z real-time progress
- ✅ Pipeline resume po crash/restart (PATCH reset + POST resume)
- ✅ Persistence: wyniki mergowane do SQLite po każdej fazie (atomowe transakcje)
- ✅ SQLite database: znormalizowane tabele (brands, scan_results, financial_years, social_posts, scans)
- ✅ Batch scanning: max 20 brands per run, auto-picks next unscanned from SQLite
- ✅ Rescan incomplete: finds brands with <19 dims, creates scan for all
- ✅ Post-scan validation: 19 expected dimensions checked, INCOMPLETE brands flagged
- ✅ Rate limiting + retry: per-provider sliding window, exponential backoff (resilient-fetch.ts)
- ✅ Command Center UI: 3-tab dashboard (progress/manual/log), real-time monitoring
- Brakuje: pierwszy full scan 239 marek

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
- Deploy: Railway ✅ (już działa)
- Auth (email + org system)
- Opcjonalnie: migracja `brands.json` → Supabase Postgres (gdy diff engine / multi-user)
- Cloudflare R2 (screenshoty, ad creatives)

---

## 9. KOSZTY (REALNIE)

### Koszt per brand (przybliżony):
- crawl: free
- extract: ~$0.01 (Haiku)
- visual: ~$0.05 (Apify screenshot + Haiku vision)
- context: ~$0.005 (Perplexity)
- pricing_fallback: ~$0.01 (Perplexity, 1-2 calls)
- discovery: ~$0.013 (rejestr.io)
- social: ~$0.15 (Apify Instagram/TikTok + Perplexity)
- ads: skipped (waiting for Meta API)
- reviews: ~$0.04 (Apify Google Maps)
- finance: ~$0.31 (rejestr.io + Perplexity fallback gdy brak revenue w KRS)
- interpret: ~$0.06 per brand (shared Sonnet call)
- social/tiktok: ~$0.04 (Apify TikTok: discovery + 30 posts → 12 stratified)
- **Total: ~$0.69/brand, ~$165 za 239 marek**

### Setup (jednorazowo):
- Infrastruktura: $0 (free tiers)
- Pierwszy full scan (21 wymiarów + KRS): ~$155
- Czas: 5-7 tygodni dev

### Operacyjne (miesięcznie):
- Railway: ~$5-10/mies (persistent container)
- Weekly re-scans — website + social (4x): ~$200/mies
- Monthly re-scan — KRS/finanse (1x): ~$40/mies
- Meta Ads monitoring (continuous): $0
- Ad hoc queries (Claude Sonnet): ~$30/mies
- TOTAL: ~$275-280/mies ≈ 1,200 PLN/mies

### Revenue target (3 miesiące od startu):
- 2 klientów Pulse: 2 × 5,000 = 10,000 PLN/mies
- 1 raport jednorazowy/mies: 8,000 PLN
- TOTAL: 18,000 PLN/mies
- PROFIT: ~16,600 PLN/mies

---

## 10. PIERWSZY RUCH

1. ~~Zbuduj dataset (faza 0-1)~~ ✅ Seed ready (239 marek), pipeline gotowy
2. Uruchom pierwszy full scan 239 marek (wszystkie 11 faz, ~$155)
4. Wygeneruj sample report: "TOP 50 cateringów w Polsce — kto naprawdę się wyróżnia"
5. Opublikuj fragment na LinkedIn (5 insightów z danych)
6. Wyślij pełny sample do 10 największych cateringów
6. "Pełny raport z 239 markami + dostęp do bazy: 12,000 PLN"

---

*CATSCAN_OS // v0.9 // CATERING_DIETETYCZNY*
*Updated: 2026-04-05*
*Changelog v0.9: SQLite migration — `data/catscan.db` jako jedyne źródło prawdy (WAL mode, foreign keys). Znormalizowane tabele: brands (239), scan_results (JSON blob per marka), financial_years (marka×rok), social_posts (marka×platforma×post), scans (audit). Prepared statements z UPSERT (atomowe). Migration script: `scripts/migrate-json-to-sqlite.ts`. Command Center UI — rewrite `app/scan/page.tsx`: 3 zakładki (dashboard z progress bar + stats + batch actions, manual single brand scan, real-time log monitor z color coding). `/api/scan/stats` endpoint (total/scanned/complete/incomplete counts, incomplete list z missing dims, recent scans). Production readiness: batch scanning (max 20/run, auto-picks next unscanned), `rescan_incomplete` mode (naprawia marki <19 dims), post-scan validation (19 expected dims checked per entity), resilient-fetch.ts (per-provider rate limiting sliding window + exponential backoff ±20% jitter + retry on 429/503). `brands.json` zachowany jako seed backup ale nie jest już source of truth.*
*Changelog v0.8: Dietly calculate-price API — pełna mapa cenowa per kcal (`price_by_kcal`) dla 177 marek Dietly (FREE, 100% accurate, reverse-engineered z Next.js SSR), `cheapest_daily` + `benchmark_diet_name` + `price_source: dietly-api`, pricing_fallback bez requireKey (Dietly brands nie potrzebują Perplexity). TikTok auto-discovery via Apify slug candidates (bez Perplexity) + stratified sampling 30→12 postów (4 recent + 8 historical), content analysis (posting frequency, engagement trend views-based, top hashtags). Finance Perplexity fallback: gdy KRS nie ma revenue (holdingi, mikro, JDG) → Perplexity szuka podmiotu operacyjnego i szacuje przychody z publicznych źródeł; `revenue_source` field (krs/perplexity-estimate/unavailable); `perplexity_estimate` block z operating_entity_name, confidence, notes; no-NIP path (Perplexity-only). Coverage revenue: ~85% (vs ~50-60% bez fallbacka). Updated costs: ~$0.70/brand, ~$167 za 239 marek*
*Changelog v0.7: nowa faza Visual Identity (wymiar 05 — Apify screenshot + Claude Haiku 4.5 vision, 8 atrybutów wizualnych, ~$0.05/brand), brand data cleanup (256→239: 46 bad names fixed, 15 non-brand removed, 2 deduplicated), calorie_options w pricing-fallback (derive z diet_prices lub Perplexity query), finance: usunięto pkd_code, dodano /krs-powiazania (board_members z rolami + shareholders), fixed grossProfit regex ("Zysk (strata) ze sprzedaży"), share_capital z Bilansu, pipeline order: crawl→extract→visual→context→pricing_fallback→discovery→social→ads→reviews→finance→interpret (11 faz), updated costs: ~$0.65/brand, ~$155 za 239 marek*
*Changelog v0.6: pipeline resume po crash/restart (PATCH reset + POST resume, entityHasPhaseData markery), persistence wyników do brands.json po każdej fazie (brands.json = jedyne źródło prawdy, przeżywa redeploy), fallback reads w /api/entities i /api/chat (czytają z brands.json gdy scans.json zaginął), Railway jako deploy target (nie Vercel), zaktualizowane koszty operacyjne*
*Changelog v0.5: Instagram stratified sampling (6 recent + 14 historical), kcal benchmark pricing (1500/2000 + diet_prices breakdown), pricing-fallback faza (Perplexity dla JS sites), NIP discovery rewrite (rejestr.io search + Perplexity fallback + 5-krokowy chain), zmiana kolejności faz (context przed discovery — legalName bridge), rozszerzona ekstrakcja finansowa (pełny RZiS + Bilans + wskaźniki + zarząd/udziałowcy), Data Explorer UI (/explore — 14 tabs, sort, filter, slide-out), YouTube via Perplexity, Perplexity social fallback, Anthropic SDK→curl migration, CATSCAN_PRODUCT_INSIGHT.md (decision maps), context dwuprzebiegowy (core + media intelligence)*
*Changelog v0.4: 256 marek = 100% pokrycia rynku (nie 500), przeliczone koszty i volume danych, pipeline hardening (URL escaping, JSON safety, temp file cleanup, safe API access)*
*Changelog v0.3: aktualizacja statusu implementacji — wszystkie 9 faz pipeline gotowe, 256 marek w bazie, scan engine + query interface + audit page zbudowane, dodano sekcję o aktualnym storage (JSON MVP), zaktualizowano stack technologiczny i fazy budowy*
*Changelog v0.2: dodano wymiar 21 (KRS + finanse), rozszerzono social/ads, poprawiono pipeline i koszty*
