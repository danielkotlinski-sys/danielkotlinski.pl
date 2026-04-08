'use client';

import { useState } from 'react';
import type { CommunicationSaturation } from '@/types/scanner';

interface Props {
  saturation: CommunicationSaturation;
  deepBrands: string[];  // the 4-5 analyzed brands
  clientBrandName: string;
}

function cellColor(score: number): string {
  if (score === 0) return 'bg-white';
  if (score <= 15) return 'bg-emerald-50';
  if (score <= 30) return 'bg-emerald-100';
  if (score <= 50) return 'bg-emerald-200';
  if (score <= 70) return 'bg-emerald-300';
  if (score <= 85) return 'bg-emerald-400 text-white';
  return 'bg-emerald-600 text-white';
}

/** Renders weryfikacja text — handles both plain text and accidental JSON output from LLM */
function WeryfikacjaContent({ text }: { text: string }) {
  // Try to parse as JSON (LLM sometimes returns JSON despite instructions)
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      const obserwacje: Array<{ tytul: string; tresc: string }> =
        Array.isArray(parsed) ? parsed : parsed.obserwacje || parsed.observations || [];
      if (obserwacje.length > 0) {
        return (
          <div className="space-y-4">
            {obserwacje.map((obs, i) => (
              <div key={i} className="bg-beige-light rounded-xl p-4">
                <p className="text-sm font-medium text-text-primary mb-1">{obs.tytul}</p>
                <p className="text-sm text-text-muted leading-[1.7]">{obs.tresc}</p>
              </div>
            ))}
          </div>
        );
      }
    }
  } catch {
    // Not JSON — render as plain text
  }

  return (
    <div className="text-sm text-text-muted leading-[1.8] whitespace-pre-line">
      {text}
    </div>
  );
}

export default function SaturationHeatmap({ saturation, deepBrands, clientBrandName }: Props) {
  const [showAll, setShowAll] = useState(false);

  // Show deep brands + category average; optionally expand to all
  const displayBrands = showAll
    ? saturation.benchmarkBrands
    : deepBrands;

  const tematy = saturation.tematy;
  const clientUniqueness = saturation.uniqueness[clientBrandName];

  return (
    <div className="bg-white rounded-card p-6 md:p-8">
      <div className="flex items-center gap-3 mb-1">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium">
          Benchmark komunikacyjny
        </p>
        <span className="text-[10px] px-2 py-0.5 bg-dk-teal/10 text-dk-teal rounded-pill font-medium">
          {saturation.benchmarkBrands.length} marek
        </span>
      </div>
      <p className="text-[11px] text-text-gray mb-4">
        Nasycenie tematów komunikacyjnych na podstawie analizy {saturation.benchmarkBrands.length} marek w kategorii.
        Oprócz {deepBrands.length} analizowanych marek, do benchmarku dobrano losową próbkę {saturation.benchmarkBrands.length - deepBrands.length} konkurentów z kategorii,
        aby zwiększyć wiarygodność wniosków i uchwycić rzeczywiste trendy rynkowe.
      </p>

      {/* Legend */}
      <div className="mb-5 p-4 bg-beige-light rounded-xl text-[11px] text-text-gray space-y-2">
        <p className="font-medium text-text-muted text-xs mb-1">Jak czytać tabelę</p>
        <p>
          <strong>Wartość (0–100)</strong> — wskaźnik obecności tematu w komunikacji marki.
          Mierzy, jak bardzo kluczowe frazy marki pokrywają się z danym tematem.
          Wysoki wynik = temat silnie obecny, niski = temat słabo obecny lub nieobecny.
          Wartości nie sumują się do 100 — marka może mieć wysoki wynik w wielu tematach jednocześnie.
          Wyniki benchmarkowych marek bazują na analizie treści ich stron internetowych.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span>Natężenie koloru:</span>
          <span className="inline-block w-6 h-4 rounded bg-white border border-gray-200" /> <span>0</span>
          <span className="inline-block w-6 h-4 rounded bg-emerald-50" /> <span>1–15</span>
          <span className="inline-block w-6 h-4 rounded bg-emerald-100" /> <span>16–30</span>
          <span className="inline-block w-6 h-4 rounded bg-emerald-200" /> <span>31–50</span>
          <span className="inline-block w-6 h-4 rounded bg-emerald-300" /> <span>51–70</span>
          <span className="inline-block w-6 h-4 rounded bg-emerald-400" /> <span>71–85</span>
          <span className="inline-block w-6 h-4 rounded bg-emerald-600" /> <span>86–100</span>
        </div>
        <p>
          <strong>Kat.</strong> — średnia dla całej kategorii ({saturation.benchmarkBrands.length} marek). Pozwala ocenić,
          czy dany temat jest popularny na rynku, czy stanowi niszę.
        </p>
        <p>
          <strong>Wnioski:</strong> Szukaj tematów, w których Twoja marka ma wysoki wynik, a średnia kategorii jest niska — to Twoje wyróżniki.
          Tematy o wysokiej średniej i niskim wyniku to potencjalne luki w komunikacji.
        </p>
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto -mx-2 px-2 pb-2">
        <table className="w-full text-[11px] border-collapse min-w-[500px]">
          <thead>
            <tr>
              <th className="text-left text-text-gray font-normal p-2 w-40 sticky left-0 bg-white z-10">
                Temat
              </th>
              {displayBrands.map((name) => (
                <th
                  key={name}
                  className={`text-center font-medium p-1.5 max-w-[80px] truncate ${
                    name === clientBrandName ? 'text-dk-teal' : 'text-text-gray'
                  }`}
                  title={name}
                >
                  <span className="writing-mode-horizontal block truncate text-[10px]">
                    {name}
                  </span>
                </th>
              ))}
              <th className="text-center text-text-gray font-normal p-1.5 border-l border-beige">
                <span className="text-[10px]">Kat.</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tematy.map((temat, i) => (
              <tr key={i} className="border-t border-beige/50">
                <td className="text-text-muted p-2 font-medium sticky left-0 bg-white z-10">
                  {temat.temat}
                </td>
                {displayBrands.map((name) => {
                  const score = temat.nasycenie[name] ?? 0;
                  return (
                    <td key={name} className="p-1">
                      <div
                        className={`rounded-md text-center py-1.5 px-1 text-[10px] font-medium ${cellColor(score)} ${
                          name === clientBrandName ? 'ring-1 ring-dk-teal/30' : ''
                        }`}
                        title={`${name}: ${score}`}
                      >
                        {score}
                      </div>
                    </td>
                  );
                })}
                <td className="p-1 border-l border-beige">
                  <div className="rounded-md text-center py-1.5 px-1 text-[10px] font-medium bg-gray-100 text-text-gray">
                    {temat.sredniaKategorii}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Toggle to show all brands */}
      {saturation.benchmarkBrands.length > deepBrands.length && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-xs text-dk-teal hover:text-dk-teal/80 transition-colors font-medium"
        >
          {showAll
            ? 'Pokaż tylko analizowane marki'
            : `Pokaż wszystkie ${saturation.benchmarkBrands.length} marek`}
        </button>
      )}

      {/* Empty topics */}
      {saturation.pustePola.length > 0 && (
        <div className="mt-6 pt-5 border-t border-beige">
          <p className="text-xs text-dk-orange uppercase tracking-widest font-medium mb-3">
            Puste pola — tematy których nikt nie porusza
          </p>
          <div className="space-y-2">
            {saturation.pustePola.map((p, i) => (
              <div key={i} className="bg-amber-50/50 rounded-xl p-3">
                <p className="text-sm font-medium text-text-primary">{p.temat}</p>
                <p className="text-xs text-text-gray mt-0.5">{p.dlaczegoWazny}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics row */}
      <div className="mt-6 pt-5 border-t border-beige grid md:grid-cols-3 gap-4">
        {/* Overlap */}
        <div className="bg-beige-light rounded-xl p-4">
          <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Overlap kategorii</p>
          <p className="text-2xl font-heading text-text-primary">
            {Math.round(saturation.overlap.sredniOverlap * 100)}%
          </p>
          <p className="text-[11px] text-text-gray mt-1">
            Jak bardzo marki mówią tym samym językiem
          </p>
        </div>

        {/* Client uniqueness */}
        {clientUniqueness && (
          <div className="bg-beige-light rounded-xl p-4">
            <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Twój uniqueness</p>
            <p className="text-2xl font-heading text-text-primary">
              {clientUniqueness.score}<span className="text-sm text-text-gray">/100</span>
            </p>
            {clientUniqueness.unikalneFrazy.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {clientUniqueness.unikalneFrazy.slice(0, 4).map((f, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-white text-dk-teal rounded-pill">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Closest pair */}
        {saturation.overlap.paryNajblizsze.length > 0 && (
          <div className="bg-beige-light rounded-xl p-4">
            <p className="text-xs text-text-gray uppercase tracking-wider mb-1">Najbliższa para</p>
            <p className="text-sm font-medium text-text-primary">
              {saturation.overlap.paryNajblizsze[0].marka1} &harr; {saturation.overlap.paryNajblizsze[0].marka2}
            </p>
            <p className="text-2xl font-heading text-text-primary mt-1">
              {Math.round(saturation.overlap.paryNajblizsze[0].overlap * 100)}%
              <span className="text-sm text-text-gray"> overlap</span>
            </p>
          </div>
        )}
      </div>

      {/* Opus interpretation */}
      {saturation.weryfikacjaKonwencji && (
        <div className="mt-6 pt-5 border-t border-beige">
          <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
            Weryfikacja konwencji danymi benchmarkowymi
          </p>
          <WeryfikacjaContent text={saturation.weryfikacjaKonwencji} />
        </div>
      )}
    </div>
  );
}
