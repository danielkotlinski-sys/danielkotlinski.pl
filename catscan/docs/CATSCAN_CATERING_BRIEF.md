# CATSCAN // CATERING INTELLIGENCE ENGINE
## Brief produktowy — v0.8

---

## 1. CO TO JEST

Sektorowa baza wiedzy o rynku cateringów dietetycznych w Polsce.
**239 marek w bazie = pełne pokrycie rynku (po cleanup).** 21 wymiarów analizy per marka. 175 atrybutów per marka = ~41,825 data points.
Dane komunikacyjne + finansowe + reklamowe + social + reputacja.
Odświeżane cyklicznie. Odpytywane w języku naturalnym.

Produkt docelowy: interfejs typu "zapytaj o cokolwiek w tej branży".
Produkt MVP: raport sektorowy + prosta wyszukiwarka + chat AI.

**Status:** MVP zbudowany — pipeline 11 faz, scan engine UI, query interface, audit page.
Baza: 239 marek (po cleanup: 256 → 239, usunięto 15 non-brand + 2 duplikaty, naprawiono 46 nazw).

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
Źródło: Apify tiktok-scraper. Ostatnie 10 filmów. Koszt: ~$10-15 za 239 marek.
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
Źródło: API KRS (darmowe) + RDF/rejestr.io (sprawozdania finansowe) + `/krs-powiazania` (zarząd/udziałowcy).
Szczegółowy pipeline: patrz `CATSCAN_KRS_SUPPLEMENT.md`.
Coverage: ~70% dane rejestrowe, ~50-60% dane finansowe (JDG nie składają).
Koszt: ~$70 za 239 marek (~$0.30/brand).
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

### Faza 6: SOCIAL MEDIA ✅ GOTOWE — rozszerzona

Wejście: nazwy marek / URL-e social profiles (z crawla)
Wyjście: wymiary 09-12
Narzędzia:
  - Apify instagram-profile-scraper (Call #1, profil) + instagram-scraper (Call #2, ~50 postów → 20 stratified): ~$15-20
  - Apify facebook-pages-scraper (15 postów/marka): ~$10-15
  - Apify tiktok-scraper (10 filmów/marka): ~$10-15
  - YouTube: via Perplexity (subscribers, total views)
  - Fallback: Perplexity AI gdy Apify nie może scrapować (Facebook blokady, prywatne profile)
Implementacja: `lib/pipeline/phases/social.ts`
Connector: `lib/connectors/apify.ts`
Czas: 2-4h
Koszt: ~$35-50
Volume: 239 profili x 4 platformy, ~9,500 postów total

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

### Faza 9: FINANCE (KRS + rejestr.io) ✅ GOTOWE — rozszerzona ekstrakcja

Wejście: NIP z fazy discovery
Wyjście: wymiar 21 (rozszerzony: pełny RZiS + Bilans + wskaźniki)
Narzędzie: rejestr.io API (primary) + KRS API (free) + RDF fallback
Implementacja: `lib/pipeline/phases/finance.ts`
Connector: `lib/connectors/rejestr-io.ts`
Pipeline (szczegóły: CATSCAN_KRS_SUPPLEMENT.md):
  1. Discovery: nazwa → NIP/KRS (faza 5, po context)
  2. rejestr.io: dane rejestrowe + sprawozdania finansowe (~$0.05-0.50/req)
  3. `/krs-powiazania`: pełny zarząd z rolami + udziałowcy
  4. Fallback: KRS API (free) + RDF XML
Rozszerzona ekstrakcja:
  - RZiS: COGS, zysk brutto (regex: "Zysk (strata) ze sprzedaży"), koszty sprzedaży, koszty administracyjne, przychody/koszty finansowe, zysk pre-tax, podatek, amortyzacja, wynagrodzenia
  - Bilans: aktywa trwałe/obrotowe, zapasy, należności, gotówka, kapitał zakładowy (z parsowania Bilansu), zyski zatrzymane, zadłużenie krótko/długoterminowe
  - Wskaźniki: net/operating/gross margin, ROE, ROA, debt/equity ratio, current ratio, revenue growth
  - KRS: członkowie zarządu z rolami, udziałowcy (name + share_pct) — via `/krs-powiazania`
  - Przykład: Maczfit → shareholders: [Żabka Polska], board: 3 members, grossProfit: 2.8M PLN
Czas: 3-5h
Koszt: ~$0.30/brand, ~$70 za 239 marek
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
- Faz: 12 (seed + 11 faz per-scan). Wszystkie zaimplementowane.
- Kolejność: crawl → extract → **visual** → context → pricing_fallback → discovery → social → ads → reviews → finance → interpret
- Kluczowa zmiana v0.8: **Dietly calculate-price API** — pełna mapa cenowa per kcal (FREE, 100% accurate) dla 177 marek
- Kluczowa zmiana v0.7: nowa faza `visual` między extract i context (Apify screenshot + Haiku vision)
- Kluczowa zmiana v0.6: context PRZED discovery (Perplexity dostarcza legalName → trafniejsze wyszukiwanie w rejestr.io)
- Czas: 3-4 dni (z testowaniem i poprawkami, jednorazowo)
- Koszt: ~$140 za 239 marek (~$0.59/brand) — oszczędność ~$15 dzięki Dietly API vs Perplexity
- Wynik: 239 encji x 178+ atrybutów = ~42,500+ data points
- Plus: ~3,600 kreacji reklamowych, ~9,500 postów social (w tym 20 stratified IG per marka), ~360 sprawozdań finansowych
- Orchestrator: `app/api/scan/route.ts` — async, per-entity, z error handling i cost tracking
- AI backend: curl do Claude API (zamiast Anthropic SDK — SDK timeout w sandbox, curl działa stabilnie)
- **Resume**: pipeline potrafi wznowić się po crashu/restarcie serwera (patrz sekcja 4.1)
- **Persistence**: wyniki mergowane do `brands.json` po każdej fazie (patrz sekcja 5)

### 4.1 RESUME — odporność na crash/restart ✅ GOTOWE

Problem: pipeline async biegnie in-memory. Restart serwera (Railway redeploy, crash, timeout) = pipeline umiera, dane w `scans.json` zostają w stanie `running`.

Rozwiązanie — dwupoziomowe:

**Poziom 1: Persistence danych (automatyczny)**
- `mergeScanIntoBrands()` — po każdej zakończonej fazie wyniki mergowane do `brands.json`
- Matchowanie entity → brand po domenie (primary) lub nazwie (fallback)
- `brands.json` żyje w git — commit po scanie = dane na zawsze
- Explorer, Chat, Entities czytają z `brands.json` jako fallback gdy `scans.json` nie istnieje

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

### `brands.json` — jedyne źródło prawdy ✅ AKTUALNIE

Implementacja: `lib/db/store.ts`
Deploy: Railway (persistent container)
Dane w git: tak — commit `brands.json` po scanie = trwałe dane

**Architektura:**
- `brands.json` — 239 marek z seed data + enriched data ze skanów. **Przeżywa redeploy** (w git).
- `scans.json` — working state pipeline (ephemeral). Może zginąć przy redeploy — nieważne, bo wyniki mergowane do `brands.json` po każdej fazie.

**Struktura brandu po scanie:**
```json
{
  "slug": "maczfit-pl",
  "name": "Maczfit",
  "domain": "maczfit.pl",
  "url": "https://maczfit.pl",
  "dietly": { "rating": 4.79, "reviewCount": 1200, ... },
  "data": {
    "_meta": { /* crawl */ },
    "_extraction": { /* extract cost/tokens */ },
    "visual_identity": { /* visual: dominant_colors, aesthetic, quality_score */ },
    "context": { /* perplexity: founder, trajectory, legalName */ },
    "pricing": { /* ceny, diet_prices, benchmarki 1500/2000 kcal */ },
    "_discovery": { /* NIP, KRS, forma prawna */ },
    "social": { /* IG, FB, TikTok, YouTube */ },
    "ads": { /* Meta Ads */ },
    "reviews": { /* Google + Dietly ratings */ },
    "finance": { /* KRS + sprawozdania + wskaźniki */ }
  },
  "financials": { /* kopia finance dla szybkiego dostępu */ },
  "nip": "1234567890",
  "krs": "0000123456",
  "lastScanId": "abc-123",
  "lastScannedAt": "2026-04-05T14:00:00Z"
}
```

**Fallback reads:**
- `/api/entities` — czyta z `scans.json`, fallback na enriched brands z `brands.json`
- `/api/chat` — j.w., Chat działa nawet po utracie `scans.json`
- `/api/scan` — resume czyta stan z `scans.json`

Modele danych (TypeScript):
- `ScanRecord` — id, status, entities[], phasesCompleted[], log[], totalCostUsd
- `EntityRecord` — id, name, url, nip, data (JSONB-like), financials, status, errors
- `BrandRecord` — slug, name, domain, url, data, nip, krs, lastScanId, lastScannedAt

### Docelowo: Postgres (Supabase / Neon) — 🔜 gdy będzie potrzeba

Schema przygotowany: `lib/db/schema.sql`
Migracja ma sens gdy: diff engine (porównanie skanów), multi-user access, albo >1000 marek.

### Rozmiar:
- 239 encji x ~5KB JSON = 1.2MB per snapshot (brands.json po full scanie ~1.5-2MB)
- Screenshoty (Cloudflare R2): ~500MB per snapshot — do zbudowania

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
  - Wybór faz do uruchomienia (domyślnie: wszystkie 11)
  - Start scan → async pipeline w tle
  - Real-time progress (polling 2s):
    - Aktualna faza
    - Live log z timestampami
    - Status per entity (pending → crawled → extracted → enriched → failed)
    - Running cost w USD
    - Kolor statusu (żółty=running, zielony=done, czerwony=failed)
  - Preview danych encji (pricing, delivery, brand tone)
  - Link do Query Interface po zakończeniu

API:
  - `POST /api/scan` → start nowy scan lub resume (`{ resume: scanId }`)
  - `PATCH /api/scan` → reset stuck scan (`{ scanId }`) — running → failed
  - `GET /api/scan` → list, `GET /api/scan/[id]` → status

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
- Storage: `brands.json` (trwałe, w git) + `scans.json` (working state) — `lib/db/store.ts`
- Deploy: Railway (persistent container)
- Design System: 9 komponentów (`components/ds/`)

### Do zbudowania 🔜
- Storage: Supabase Postgres (gdy potrzeba diff engine / multi-user) + Cloudflare R2 (screenshoty)
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
- ✅ Persistence: wyniki mergowane do `brands.json` po każdej fazie
- ✅ Fallback reads: Explorer/Chat czytają z `brands.json` gdy `scans.json` zaginął
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
- finance: ~$0.30 (rejestr.io, multiple doc fetches)
- interpret: ~$0.06 per brand (shared Sonnet call)
- **Total: ~$0.65/brand, ~$155 za 239 marek**

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

*CATSCAN_OS // v0.7 // CATERING_DIETETYCZNY*
*Updated: 2026-04-05*
*Changelog v0.7: nowa faza Visual Identity (wymiar 05 — Apify screenshot + Claude Haiku 4.5 vision, 8 atrybutów wizualnych, ~$0.05/brand), brand data cleanup (256→239: 46 bad names fixed, 15 non-brand removed, 2 deduplicated), calorie_options w pricing-fallback (derive z diet_prices lub Perplexity query), finance: usunięto pkd_code, dodano /krs-powiazania (board_members z rolami + shareholders), fixed grossProfit regex ("Zysk (strata) ze sprzedaży"), share_capital z Bilansu, pipeline order: crawl→extract→visual→context→pricing_fallback→discovery→social→ads→reviews→finance→interpret (11 faz), updated costs: ~$0.65/brand, ~$155 za 239 marek*
*Changelog v0.6: pipeline resume po crash/restart (PATCH reset + POST resume, entityHasPhaseData markery), persistence wyników do brands.json po każdej fazie (brands.json = jedyne źródło prawdy, przeżywa redeploy), fallback reads w /api/entities i /api/chat (czytają z brands.json gdy scans.json zaginął), Railway jako deploy target (nie Vercel), zaktualizowane koszty operacyjne*
*Changelog v0.5: Instagram stratified sampling (6 recent + 14 historical), kcal benchmark pricing (1500/2000 + diet_prices breakdown), pricing-fallback faza (Perplexity dla JS sites), NIP discovery rewrite (rejestr.io search + Perplexity fallback + 5-krokowy chain), zmiana kolejności faz (context przed discovery — legalName bridge), rozszerzona ekstrakcja finansowa (pełny RZiS + Bilans + wskaźniki + zarząd/udziałowcy), Data Explorer UI (/explore — 14 tabs, sort, filter, slide-out), YouTube via Perplexity, Perplexity social fallback, Anthropic SDK→curl migration, CATSCAN_PRODUCT_INSIGHT.md (decision maps), context dwuprzebiegowy (core + media intelligence)*
*Changelog v0.4: 256 marek = 100% pokrycia rynku (nie 500), przeliczone koszty i volume danych, pipeline hardening (URL escaping, JSON safety, temp file cleanup, safe API access)*
*Changelog v0.3: aktualizacja statusu implementacji — wszystkie 9 faz pipeline gotowe, 256 marek w bazie, scan engine + query interface + audit page zbudowane, dodano sekcję o aktualnym storage (JSON MVP), zaktualizowano stack technologiczny i fazy budowy*
*Changelog v0.2: dodano wymiar 21 (KRS + finanse), rozszerzono social/ads, poprawiono pipeline i koszty*
