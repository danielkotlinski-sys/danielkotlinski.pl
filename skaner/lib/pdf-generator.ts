import type { ScannerReport } from '@/types/scanner';

/**
 * Text-based PDF generator using jsPDF with DejaVu Sans (Polish support).
 * Produces lightweight, searchable PDFs with strict page-break control.
 */

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN_X = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 20;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// Colors
const C_BLACK = '#1A1A18';
const C_GRAY = '#6B6B6B';
const C_TEAL = '#2A9D8F';
const C_ORANGE = '#E8734A';

interface PDFContext {
  doc: import('jspdf').jsPDF;
  y: number;
}

function ensureSpace(ctx: PDFContext, needed: number): void {
  if (ctx.y + needed > PAGE_H - MARGIN_BOTTOM) {
    ctx.doc.addPage();
    ctx.y = MARGIN_TOP;
  }
}

function newPage(ctx: PDFContext): void {
  ctx.doc.addPage();
  ctx.y = MARGIN_TOP;
}

function drawFooter(ctx: PDFContext, pageNum: number): void {
  ctx.doc.setFontSize(8);
  ctx.doc.setTextColor(C_GRAY);
  ctx.doc.setFont('DejaVuSans', 'normal');
  ctx.doc.text(`danielkotlinski.pl`, MARGIN_X, PAGE_H - 10);
  ctx.doc.text(`${pageNum}`, PAGE_W - MARGIN_X, PAGE_H - 10, { align: 'right' });
}

function drawSectionTitle(ctx: PDFContext, num: number, title: string): void {
  ensureSpace(ctx, 25);
  ctx.doc.setFontSize(9);
  ctx.doc.setTextColor(C_TEAL);
  ctx.doc.setFont('DejaVuSans', 'normal');
  ctx.doc.text(`CZĘŚĆ ${num}`, MARGIN_X, ctx.y);
  ctx.y += 6;

  ctx.doc.setFontSize(18);
  ctx.doc.setTextColor(C_BLACK);
  ctx.doc.setFont('DejaVuSans', 'bold');
  ctx.doc.text(title, MARGIN_X, ctx.y);
  ctx.y += 10;
}

function drawSubheading(ctx: PDFContext, text: string): void {
  ensureSpace(ctx, 12);
  ctx.doc.setFontSize(12);
  ctx.doc.setTextColor(C_BLACK);
  ctx.doc.setFont('DejaVuSans', 'bold');
  ctx.doc.text(text, MARGIN_X, ctx.y);
  ctx.y += 7;
}

function drawLabel(ctx: PDFContext, text: string): void {
  ensureSpace(ctx, 8);
  ctx.doc.setFontSize(8);
  ctx.doc.setTextColor(C_TEAL);
  ctx.doc.setFont('DejaVuSans', 'bold');
  ctx.doc.text(text.toUpperCase(), MARGIN_X, ctx.y);
  ctx.y += 5;
}

function drawText(ctx: PDFContext, text: string, opts?: { indent?: number; color?: string; size?: number; bold?: boolean }): void {
  const indent = opts?.indent ?? 0;
  const size = opts?.size ?? 9.5;
  const color = opts?.color ?? C_BLACK;
  const bold = opts?.bold ?? false;
  const x = MARGIN_X + indent;
  const maxW = CONTENT_W - indent;

  ctx.doc.setFontSize(size);
  ctx.doc.setTextColor(color);
  ctx.doc.setFont('DejaVuSans', bold ? 'bold' : 'normal');

  const lines = ctx.doc.splitTextToSize(text, maxW);
  const lineH = size * 0.45;

  for (const line of lines) {
    ensureSpace(ctx, lineH + 1);
    ctx.doc.text(line, x, ctx.y);
    ctx.y += lineH;
  }
  ctx.y += 2;
}

function drawBullet(ctx: PDFContext, text: string, opts?: { indent?: number; color?: string }): void {
  const indent = opts?.indent ?? 0;
  drawText(ctx, `•  ${text}`, { indent: indent + 2, color: opts?.color });
}

function drawSpacer(ctx: PDFContext, h: number = 6): void {
  ctx.y += h;
}

function drawHr(ctx: PDFContext): void {
  ensureSpace(ctx, 8);
  ctx.y += 3;
  ctx.doc.setDrawColor(200, 200, 195);
  ctx.doc.setLineWidth(0.3);
  ctx.doc.line(MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
  ctx.y += 5;
}

function safe(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

export async function generateReportPdf(report: ScannerReport): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF('p', 'mm', 'a4');

  // Load Polish-compatible font
  const [fontRegular, fontBold] = await Promise.all([
    fetch('/fonts/DejaVuSans.ttf').then(r => r.arrayBuffer()),
    fetch('/fonts/DejaVuSans-Bold.ttf').then(r => r.arrayBuffer()),
  ]);

  doc.addFileToVFS('DejaVuSans.ttf', arrayBufferToBase64(fontRegular));
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', arrayBufferToBase64(fontBold));
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');

  doc.setFont('DejaVuSans', 'normal');

  const ctx: PDFContext = { doc, y: MARGIN_TOP };
  let sectionNum = 0;

  // ==================== COVER PAGE ====================
  ctx.y = 60;
  doc.setFontSize(11);
  doc.setTextColor(C_GRAY);
  doc.setFont('DejaVuSans', 'normal');
  doc.text('danielkotlinski.pl', MARGIN_X, ctx.y);
  ctx.y += 20;

  doc.setFontSize(28);
  doc.setTextColor(C_BLACK);
  doc.setFont('DejaVuSans', 'bold');
  doc.text('Skan kategorii', MARGIN_X, ctx.y);
  ctx.y += 14;

  doc.setFontSize(16);
  doc.setTextColor(C_GRAY);
  doc.setFont('DejaVuSans', 'normal');
  const catLines = doc.splitTextToSize(report.meta.category, CONTENT_W);
  for (const line of catLines) {
    doc.text(line, MARGIN_X, ctx.y);
    ctx.y += 8;
  }
  ctx.y += 10;

  doc.setFontSize(10);
  doc.setTextColor(C_GRAY);
  doc.text(`Marki: ${report.meta.brandsAnalyzed.join(', ')}`, MARGIN_X, ctx.y);
  ctx.y += 6;
  doc.text(`Data: ${new Date(report.meta.generatedAt).toLocaleDateString('pl-PL')}`, MARGIN_X, ctx.y);
  ctx.y += 6;
  doc.text(`Źródła: strona WWW, social media, dyskurs zewnętrzny`, MARGIN_X, ctx.y);

  // ==================== SECTION 1: BRAND PROFILES ====================
  newPage(ctx);
  sectionNum++;
  drawSectionTitle(ctx, sectionNum, 'Profile marek');
  drawText(ctx, 'Każda marka opowiada historię o swoim kliencie — przez język, obietnicę, mechanizm sprzedaży. Te historie ujawniają założenia, z których marki nawet nie zdają sobie sprawy.', { color: C_GRAY, size: 9 });
  drawSpacer(ctx, 8);

  for (const profile of report.brandProfiles) {
    ensureSpace(ctx, 40);
    drawSubheading(ctx, `${profile.brandName}${profile.isClient ? ' (Twoja marka)' : ''}`);

    drawLabel(ctx, 'Logika sprzedaży');
    drawText(ctx, safe(profile.logikaSprzedazy?.tresc));
    if (profile.logikaSprzedazy?.kluczoweMechanizmy?.length) {
      for (const m of profile.logikaSprzedazy.kluczoweMechanizmy) {
        drawBullet(ctx, m, { indent: 2 });
      }
    }
    drawSpacer(ctx, 3);

    drawLabel(ctx, 'Implikowany klient');
    drawText(ctx, `Tożsamość: ${safe(profile.implikowanyKlient?.tosazmosc)}`);
    drawText(ctx, `Co ważne: ${safe(profile.implikowanyKlient?.coWazne)}`);
    drawText(ctx, `Kto wykluczony: ${safe(profile.implikowanyKlient?.ktoWykluczony)}`);
    drawSpacer(ctx, 3);

    if (profile.kluczoweDowody?.length) {
      drawLabel(ctx, 'Kluczowe dowody');
      for (const d of profile.kluczoweDowody) {
        drawBullet(ctx, `${safe(d.obserwacja)}${d.cytat ? ` — „${d.cytat}"` : ''} (${safe(d.zrodlo)})`, { color: C_BLACK });
      }
    }

    drawHr(ctx);
  }

  // ==================== SECTION 2: VISUAL CONVENTIONS ====================
  if (report.konwencjaWizualnaKategorii) {
    newPage(ctx);
    sectionNum++;
    drawSectionTitle(ctx, sectionNum, 'Konwencje wizualne');
    drawText(ctx, 'Komunikacja wizualna zdradza więcej niż tekst. Powtarzające się kolory, kadry, nastroje — to wizualny język kategorii.', { color: C_GRAY, size: 9 });
    drawSpacer(ctx, 8);

    const viz = report.konwencjaWizualnaKategorii;

    // Per-brand visuals
    for (const profile of report.brandProfiles) {
      if (profile.konwencjaWizualna) {
        ensureSpace(ctx, 25);
        drawSubheading(ctx, profile.brandName);
        drawText(ctx, `Styl: ${safe(profile.konwencjaWizualna.dominujacyStyl?.opis)}`);
        drawText(ctx, `Kolorystyka: ${safe(profile.konwencjaWizualna.kolorystyka)}`);
        drawText(ctx, `Kompozycja: ${safe(profile.konwencjaWizualna.composycja)}`);
        drawText(ctx, `Człowiek: ${profile.konwencjaWizualna.obecnoscCzlowieka?.czy ? 'tak' : 'nie'} — ${safe(profile.konwencjaWizualna.obecnoscCzlowieka?.jakPokazany)}`);
        drawSpacer(ctx, 4);
      }
    }

    drawHr(ctx);
    drawSubheading(ctx, 'Wzorce kategoriowe');

    if (viz.wspolneWzorce?.length) {
      for (const w of viz.wspolneWzorce) {
        drawBullet(ctx, `${safe(w.wzorzec)} (${w.marki?.join(', ')}) — ${safe(w.znaczenie)}`);
      }
      drawSpacer(ctx, 4);
    }

    if (viz.wspolneUnikanie?.length) {
      drawLabel(ctx, 'Wspólne unikanie');
      for (const u of viz.wspolneUnikanie) {
        drawBullet(ctx, u);
      }
      drawSpacer(ctx, 4);
    }

    drawLabel(ctx, 'Implikowany świat klienta');
    drawText(ctx, safe(viz.implikowanySwiatklienta));

    drawLabel(ctx, 'Kto wizualnie wykluczony');
    drawText(ctx, safe(viz.ktoWizualnieWykluczony));
  }

  // ==================== SECTION 3: CATEGORY MAP ====================
  if (report.mapaKategorii) {
    newPage(ctx);
    sectionNum++;
    drawSectionTitle(ctx, sectionNum, 'Krajobraz kategorii');
    drawText(ctx, 'Kim są gracze i jakie pozycje zajmują? Kto jest liderem, kto challengerem, kto gra w inną grę.', { color: C_GRAY, size: 9 });
    drawSpacer(ctx, 8);

    drawLabel(ctx, 'Hierarchia');
    drawText(ctx, safe(report.mapaKategorii.hierarchia));
    drawSpacer(ctx, 4);

    drawLabel(ctx, 'Obozy');
    drawText(ctx, safe(report.mapaKategorii.obozy));
    drawSpacer(ctx, 4);

    drawLabel(ctx, 'Napięcia');
    drawText(ctx, safe(report.mapaKategorii.napiecia));
    drawSpacer(ctx, 6);

    drawSubheading(ctx, 'Gracze');
    for (const g of report.mapaKategorii.gracze) {
      ensureSpace(ctx, 15);
      drawText(ctx, safe(g.nazwa), { bold: true });
      drawText(ctx, `${safe(g.pozycja)}. ${safe(g.charakter)}${g.skala && g.skala !== 'brak danych' ? ` Skala: ${g.skala}` : ''}`, { indent: 2, color: C_GRAY });
      drawSpacer(ctx, 3);
    }
  }

  // ==================== SECTION 4: COMMUNICATION GAPS ====================
  if (report.lukiKomunikacyjne?.tematy?.length) {
    newPage(ctx);
    sectionNum++;
    drawSectionTitle(ctx, sectionNum, 'Luki komunikacyjne');
    drawText(ctx, 'Kto mówi o czym — a kto milczy? Milczenie jest strategiczną informacją.', { color: C_GRAY, size: 9 });
    drawSpacer(ctx, 8);

    for (const t of report.lukiKomunikacyjne.tematy) {
      ensureSpace(ctx, 20);
      drawSubheading(ctx, safe(t.temat));
      drawText(ctx, `Kto mówi: ${t.ktoMowi?.join(', ')}`, { color: C_TEAL });
      drawText(ctx, `Kto milczy: ${t.ktoMilczy?.join(', ')}`, { color: C_ORANGE });
      drawText(ctx, safe(t.znaczenie), { color: C_GRAY });
      drawSpacer(ctx, 5);
    }
  }

  // ==================== SECTION 5: CONVENTION + CLIENT POSITION ====================
  newPage(ctx);
  sectionNum++;
  drawSectionTitle(ctx, sectionNum, 'Konwencja kategorii');
  drawText(ctx, 'Tu wyłania się wzorzec. Wszystkie marki — choć konkurują — grają tę samą grę, według tych samych niepisanych reguł.', { color: C_GRAY, size: 9 });
  drawSpacer(ctx, 8);

  const conv = report.konwencjaKategorii;

  drawLabel(ctx, 'Mechanizm kategorii');
  drawText(ctx, safe(conv.mechanizmKategorii?.regula), { bold: true });
  drawText(ctx, safe(conv.mechanizmKategorii?.uzasadnienie), { color: C_GRAY });
  drawSpacer(ctx, 6);

  drawLabel(ctx, 'Implikowany klient kategorii');
  drawText(ctx, `Tożsamość: ${safe(conv.implikowanyKlientKategorii?.tosazmosc)}`);
  drawText(ctx, `Głębsza potrzeba: ${safe(conv.implikowanyKlientKategorii?.glebszaPotrzeba)}`);
  drawSpacer(ctx, 6);

  if (conv.dowodyKonwencji?.length) {
    drawLabel(ctx, 'Dowody konwencji');
    for (const d of conv.dowodyKonwencji) {
      drawBullet(ctx, `${safe(d.wzorzec)} (${d.marki?.join(', ')}) — ${safe(d.znaczenie)}`);
    }
    drawSpacer(ctx, 6);
  }

  if (conv.mapaWyroznialnosci?.length) {
    drawLabel(ctx, 'Mapa wyróżnialności');
    for (const m of conv.mapaWyroznialnosci) {
      drawBullet(ctx, `${safe(m.marka)}: ${safe(m.ocena)} — ${safe(m.uzasadnienie)}`);
    }
    drawSpacer(ctx, 8);
  }

  // Client position
  drawHr(ctx);
  const pos = report.pozycjaKlienta;
  drawSubheading(ctx, `Pozycja: ${report.meta.clientBrand}`);

  drawLabel(ctx, 'Zgodność z konwencją');
  drawText(ctx, safe(pos.zgodnosc?.ocena));
  if (pos.zgodnosc?.elementy?.length) {
    for (const e of pos.zgodnosc.elementy) {
      drawBullet(ctx, e, { indent: 2 });
    }
  }
  drawSpacer(ctx, 4);

  if (pos.odchylenia?.elementy?.length) {
    drawLabel(ctx, 'Odchylenia');
    for (const e of pos.odchylenia.elementy) {
      drawBullet(ctx, e, { indent: 2 });
    }
    drawText(ctx, safe(pos.odchylenia.znaczenieStrategiczne), { color: C_GRAY, size: 9 });
    drawSpacer(ctx, 4);
  }

  drawLabel(ctx, 'Zagrożenie');
  drawText(ctx, safe(pos.zagrozenie));
  drawSpacer(ctx, 4);

  drawLabel(ctx, 'Pytanie otwarte');
  drawText(ctx, safe(pos.pytanieOtwarte), { color: C_TEAL });

  // ==================== SECTION 6: STRATEGIC RUPTURE ====================
  if (report.blueOceanFinale) {
    newPage(ctx);
    sectionNum++;
    drawSectionTitle(ctx, sectionNum, 'Pęknięcie strategiczne');
    drawText(ctx, 'Konwencja opisuje jak kategoria generuje wartość dziś. Ale każda logika opiera się na założeniach — a założenia mają koszty i ślepe punkty.', { color: C_GRAY, size: 9 });
    drawSpacer(ctx, 8);

    const bo = report.blueOceanFinale;

    drawLabel(ctx, 'Mechanizm kategorii');
    drawText(ctx, safe(bo.mechanizmKategorii), { bold: true });
    drawSpacer(ctx, 8);

    // Hypothesis
    drawSubheading(ctx, 'Hipoteza pęknięcia');

    drawLabel(ctx, 'Konwencja zakłada');
    drawText(ctx, safe(bo.hipotezaPekniecia?.konwencjaZaklada));
    drawSpacer(ctx, 3);

    if (bo.hipotezaPekniecia?.wariant1) {
      // New format: 2 variants
      drawLabel(ctx, 'To może być błędne, bo — perspektywa 1');
      drawText(ctx, safe(bo.hipotezaPekniecia.wariant1.toMozeBycBledne));
      drawLabel(ctx, 'Alternatywna logika');
      drawText(ctx, safe(bo.hipotezaPekniecia.wariant1.alternatywnaLogika));
      drawSpacer(ctx, 5);

      drawLabel(ctx, 'To może być błędne, bo — perspektywa 2');
      drawText(ctx, safe(bo.hipotezaPekniecia.wariant2.toMozeBycBledne));
      drawLabel(ctx, 'Alternatywna logika');
      drawText(ctx, safe(bo.hipotezaPekniecia.wariant2.alternatywnaLogika));
    } else {
      // Legacy format
      drawLabel(ctx, 'To może być błędne, bo');
      drawText(ctx, safe(bo.hipotezaPekniecia?.toMozeBycBledne));
      drawSpacer(ctx, 3);
      drawLabel(ctx, 'Alternatywna logika');
      drawText(ctx, safe(bo.hipotezaPekniecia?.alternatywnaLogika));
    }
    drawSpacer(ctx, 8);

    // "What if" directions
    if (bo.kierunki?.length) {
      ensureSpace(ctx, 30);
      drawSubheading(ctx, 'A co gdyby...?');
      for (const k of bo.kierunki) {
        drawLabel(ctx, safe(k.technika));
        drawText(ctx, safe(k.aCoGdyby));
        drawSpacer(ctx, 3);
      }
    }

    // Legacy sections for old reports
    if (bo.ruchStrategiczny) {
      drawSpacer(ctx, 8);
      ensureSpace(ctx, 30);
      drawSubheading(ctx, `Ruch strategiczny: ${safe(bo.ruchStrategiczny?.nazwa)}`);
      drawText(ctx, safe(bo.ruchStrategiczny?.definicja), { bold: true });
      drawText(ctx, safe(bo.ruchStrategiczny?.coSieZmienia), { color: C_GRAY });
    }
  }

  // ==================== FOOTER NOTE ====================
  drawSpacer(ctx, 10);
  drawHr(ctx);
  drawText(ctx, safe(report.notaKoncowa), { color: C_GRAY, size: 8.5 });

  // ==================== ADD PAGE NUMBERS ====================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter({ doc, y: 0 }, i);
  }

  return doc.output('blob');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
