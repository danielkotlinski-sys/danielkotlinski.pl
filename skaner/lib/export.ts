import type { ScannerReport } from '@/types/scanner';

// ===================== MARKDOWN EXPORT =====================

export function reportToMarkdown(report: ScannerReport): string {
  const lines: string[] = [];
  const add = (text: string) => lines.push(text);
  const blank = () => lines.push('');

  add(`# Skan kategorii: ${report.meta.category}`);
  add(`**Marka klienta:** ${report.meta.clientBrand}`);
  add(`**Marki analizowane:** ${report.meta.brandsAnalyzed.join(', ')}`);
  add(`**Data generowania:** ${new Date(report.meta.generatedAt).toLocaleDateString('pl-PL')}`);
  blank();

  // Brand profiles
  add('---');
  add('## 1. Profile marek');
  blank();
  for (const profile of report.brandProfiles) {
    add(`### ${profile.brandName}${profile.isClient ? ' (marka klienta)' : ''}`);
    blank();
    add(`**Logika sprzedaży:** ${profile.logikaSprzedazy.tresc}`);
    if (profile.logikaSprzedazy.kluczoweMechanizmy?.length) {
      add(`**Mechanizmy:** ${profile.logikaSprzedazy.kluczoweMechanizmy.join(', ')}`);
    }
    blank();
    add(`**Implikowany klient:**`);
    add(`- Tożsamość: ${profile.implikowanyKlient.tosazmosc}`);
    add(`- Co ważne: ${profile.implikowanyKlient.coWazne}`);
    add(`- Kto wykluczony: ${profile.implikowanyKlient.ktoWykluczony}`);
    blank();
    if (profile.kluczoweDowody?.length) {
      add('**Kluczowe dowody:**');
      for (const d of profile.kluczoweDowody) {
        add(`- ${d.obserwacja}${d.cytat ? ` — „${d.cytat}"` : ''} *(${d.zrodlo})*`);
      }
      blank();
    }
  }

  // Visual conventions
  if (report.konwencjaWizualnaKategorii) {
    add('---');
    add('## 2. Konwencje wizualne');
    blank();
    const viz = report.konwencjaWizualnaKategorii;
    if (viz.wspolneWzorce?.length) {
      add('**Wspólne wzorce:**');
      for (const w of viz.wspolneWzorce) {
        add(`- ${w.wzorzec} (${w.marki.join(', ')}) — ${w.znaczenie}`);
      }
      blank();
    }
    add(`**Implikowany świat klienta:** ${viz.implikowanySwiatklienta}`);
    blank();
  }

  // Category map
  if (report.mapaKategorii) {
    add('---');
    add('## 3. Krajobraz kategorii');
    blank();
    add(`**Hierarchia:** ${report.mapaKategorii.hierarchia}`);
    add(`**Obozy:** ${report.mapaKategorii.obozy}`);
    blank();
    add('**Gracze:**');
    for (const g of report.mapaKategorii.gracze) {
      add(`- **${g.nazwa}** — ${g.pozycja}. ${g.charakter}${g.skala && g.skala !== 'brak danych' ? `. Skala: ${g.skala}` : ''}`);
    }
    blank();
  }

  // Communication gaps
  if (report.lukiKomunikacyjne?.tematy?.length) {
    add('---');
    add('## 4. Luki komunikacyjne');
    blank();
    for (const t of report.lukiKomunikacyjne.tematy) {
      add(`### ${t.temat}`);
      add(`- Kto mówi: ${t.ktoMowi.join(', ')}`);
      add(`- Kto milczy: ${t.ktoMilczy.join(', ')}`);
      add(`- Znaczenie: ${t.znaczenie}`);
      blank();
    }
  }

  // Convention
  add('---');
  add('## 5. Konwencja kategorii');
  blank();
  const conv = report.konwencjaKategorii;
  add(`**Mechanizm:** ${conv.mechanizmKategorii.regula}`);
  add(`**Uzasadnienie:** ${conv.mechanizmKategorii.uzasadnienie}`);
  blank();
  add(`**Implikowany klient kategorii:** ${conv.implikowanyKlientKategorii.tosazmosc}`);
  add(`**Głębsza potrzeba:** ${conv.implikowanyKlientKategorii.glebszaPotrzeba}`);
  blank();
  if (conv.dowodyKonwencji?.length) {
    add('**Dowody konwencji:**');
    for (const d of conv.dowodyKonwencji) {
      add(`- ${d.wzorzec} (${d.marki.join(', ')}) — ${d.znaczenie}`);
    }
    blank();
  }

  // Client position
  add('---');
  add('## 6. Pozycja marki klienta');
  blank();
  const pos = report.pozycjaKlienta;
  add(`**Zgodność z konwencją:** ${pos.zgodnosc.ocena}`);
  if (pos.zgodnosc.elementy?.length) {
    for (const e of pos.zgodnosc.elementy) add(`- ${e}`);
  }
  blank();
  if (pos.odchylenia.elementy?.length) {
    add('**Odchylenia:**');
    for (const e of pos.odchylenia.elementy) add(`- ${e}`);
    add(`*${pos.odchylenia.znaczenieStrategiczne}*`);
    blank();
  }
  add(`**Zagrożenie:** ${pos.zagrozenie}`);
  blank();

  // Blue Ocean / Rupture
  if (report.blueOceanFinale) {
    add('---');
    add('## 7. Pęknięcie strategiczne');
    blank();
    const bo = report.blueOceanFinale;
    add(`**Mechanizm kategorii:** ${bo.mechanizmKategorii}`);
    blank();
    add('### Hipoteza pęknięcia');
    add(`**Konwencja zakłada:** ${bo.hipotezaPekniecia.konwencjaZaklada}`);
    add(`**To może być błędne, bo:** ${bo.hipotezaPekniecia.toMozeBycBledne}`);
    add(`**Alternatywna logika:** ${bo.hipotezaPekniecia.alternatywnaLogika}`);
    blank();
    add('### Nowy popyt');
    add(`- **Stan:** ${bo.nowyPopyt.stan}`);
    add(`- **Sytuacja:** ${bo.nowyPopyt.sytuacja}`);
    add(`- **Napięcie:** ${bo.nowyPopyt.napiecie}`);
    add(`- **Dlaczego nieobsługiwany:** ${bo.nowyPopyt.dlaczegoNieobslugiwany}`);
    blank();
    add(`### Ruch strategiczny: ${bo.ruchStrategiczny.nazwa}`);
    add(`**Definicja:** ${bo.ruchStrategiczny.definicja}`);
    add(`**Co się zmienia:** ${bo.ruchStrategiczny.coSieZmienia}`);
    blank();
    add(`**Pierwszy krok testowy:** ${bo.pierwszyKrok}`);
    blank();
    if (bo.odrzuconeKierunki?.length) {
      add('### Odrzucone kierunki');
      for (const k of bo.odrzuconeKierunki) {
        add(`- **${k.kierunek}** — ${k.dlaczegoOdrzucony}`);
      }
      blank();
    }
  }

  add('---');
  add(`*${report.notaKoncowa}*`);
  blank();
  add('*Raport wygenerowany przez Skaner Kategorii — danielkotlinski.pl*');

  return lines.join('\n');
}

// ===================== SOURCE DATA EXPORT =====================

export function reportSourcesToTxt(report: ScannerReport): string {
  const lines: string[] = [];
  const add = (text: string) => lines.push(text);
  const blank = () => lines.push('');
  const separator = () => lines.push('='.repeat(80));

  add('ŹRÓDŁA DANYCH — SKANER KATEGORII');
  add(`Kategoria: ${report.meta.category}`);
  add(`Data: ${new Date(report.meta.generatedAt).toLocaleDateString('pl-PL')}`);
  add(`Marki: ${report.meta.brandsAnalyzed.join(', ')}`);
  separator();
  blank();

  for (const profile of report.brandProfiles) {
    add(`MARKA: ${profile.brandName.toUpperCase()}${profile.isClient ? ' (KLIENT)' : ''}`);
    separator();
    blank();

    // Website quotes → used by: Prompt 1 (claim), Prompt 2 (vocabulary)
    add('--- STRONA WWW (użyte w: analiza claimu, analiza słownictwa) ---');
    if (profile.sampleWebsiteQuotes?.length) {
      for (const q of profile.sampleWebsiteQuotes) {
        if (q) add(`  „${q}"`);
      }
    } else {
      add('  (brak danych)');
    }
    blank();

    // Evidence quotes → used by: Prompt 6 (brand profile synthesis)
    add('--- DOWODY Z ANALIZY (użyte w: profil strategiczny marki) ---');
    if (profile.kluczoweDowody?.length) {
      for (const d of profile.kluczoweDowody) {
        add(`  [${d.zrodlo}] ${d.obserwacja}`);
        if (d.cytat) add(`  Cytat: „${d.cytat}"`);
        add(`  Znaczenie: ${d.znaczenie}`);
        blank();
      }
    }

    // External sources → used by: Prompt 5 (external analysis), Prompt CATEGORY_MAP
    add('--- ŹRÓDŁA ZEWNĘTRZNE (użyte w: analiza dyskursu zewnętrznego, mapa kategorii) ---');
    if (profile.zrodlaZewnetrzne?.length) {
      for (const z of profile.zrodlaZewnetrzne) {
        add(`  ${z}`);
      }
    } else {
      add('  (brak danych — źródła z Perplexity: profil, media, percepcja, konkurencja, skala)');
    }
    blank();

    // Visual data → used by: Prompt 3 (post vision), Prompt VISUAL
    if (profile.konwencjaWizualna) {
      add('--- ANALIZA WIZUALNA (użyte w: konwencja wizualna kategorii) ---');
      add(`  Styl: ${profile.konwencjaWizualna.dominujacyStyl.opis}`);
      add(`  Powtarzalność: ${profile.konwencjaWizualna.dominujacyStyl.powtarzalnosc}`);
      add(`  Kolorystyka: ${profile.konwencjaWizualna.kolorystyka}`);
      add(`  Kompozycja: ${profile.konwencjaWizualna.composycja}`);
      add(`  Obecność człowieka: ${profile.konwencjaWizualna.obecnoscCzlowieka.czy ? 'tak' : 'nie'} — ${profile.konwencjaWizualna.obecnoscCzlowieka.jakPokazany}`);
      blank();
    }

    // Social posts count
    add(`--- SOCIAL MEDIA (${profile.samplePostScreenshots?.length || 0} screenshotów w raporcie, do 12 postów scrapowanych, 8 analizowanych wizualnie) ---`);
    add('  Użyte w: analiza wizualna postów, synteza social media, profil marki');
    blank();
    blank();
  }

  // Category-level sources
  separator();
  add('ŹRÓDŁA KATEGORIOWE');
  separator();
  blank();

  add('--- KONWENCJA KATEGORII (Prompt 7 — synteza wszystkich profili marek) ---');
  add(`  Mechanizm: ${report.konwencjaKategorii.mechanizmKategorii.regula}`);
  add(`  Uzasadnienie: ${report.konwencjaKategorii.mechanizmKategorii.uzasadnienie}`);
  blank();

  if (report.konwencjaKategorii.dowodyKonwencji?.length) {
    add('  Dowody:');
    for (const d of report.konwencjaKategorii.dowodyKonwencji) {
      add(`  - ${d.wzorzec} (${d.marki.join(', ')})`);
    }
    blank();
  }

  add('--- MAPA KATEGORII (Prompt MAP — dane zewnętrzne z Perplexity) ---');
  if (report.mapaKategorii) {
    add(`  Hierarchia: ${report.mapaKategorii.hierarchia}`);
    for (const g of report.mapaKategorii.gracze) {
      add(`  ${g.nazwa}: ${g.pozycja}${g.skala && g.skala !== 'brak danych' ? ` [${g.skala}]` : ''}`);
    }
  }
  blank();

  add('--- PĘKNIĘCIE STRATEGICZNE (Prompt 9 — Multi-Axis Strategic Rupture Engine) ---');
  add('  Źródło: synteza konwencji + pozycja klienta + profil klienta');
  add('  Analiza: 8 osi (epistemiczna, energetyczna, czasowa, tożsamościowa, porównawcza, strukturalna, sytuacyjna, operacyjna)');
  blank();

  separator();
  add('PIPELINE ŹRÓDEŁ DANYCH');
  separator();
  add('  Jina AI → tekst strony WWW + screenshot strony głównej');
  add('  Apify → posty z social media (obrazy + captiony + daty)');
  add('  Perplexity (sonar-pro) → 5 zapytań/markę: profil, media, percepcja, konkurencja, skala');
  add('  Claude Sonnet → analiza atomowa (prompty 1-5)');
  add('  Claude Opus → synteza strategiczna (prompty 6-9)');

  return lines.join('\n');
}
