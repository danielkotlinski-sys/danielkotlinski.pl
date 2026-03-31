'use client';

import type { ScannerReport } from '@/types/scanner';

interface VisualConventionsSectionProps {
  report: ScannerReport;
}

export default function VisualConventionsSection({ report }: VisualConventionsSectionProps) {
  const brandsWithVisuals = report.brandProfiles.filter((p) => p.konwencjaWizualna);
  const categoryVisuals = report.konwencjaWizualnaKategorii;

  if (brandsWithVisuals.length === 0 && !categoryVisuals) {
    return (
      <div className="bg-white rounded-card p-6 md:p-8 text-center">
        <p className="text-text-gray">
          Brak danych z social media — analiza wizualna niedostępna.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Per-brand visual analysis */}
      {brandsWithVisuals.map((profile) => {
        const v = profile.konwencjaWizualna!;
        return (
          <div key={profile.brandName} className="bg-white rounded-card overflow-hidden">
            <div className="px-6 md:px-8 pt-6 md:pt-8 pb-2 flex items-center gap-3">
              <h3 className="font-heading text-2xl text-text-primary">
                {profile.brandName}
              </h3>
              {profile.isClient && (
                <span className="text-xs px-3 py-1 bg-dk-teal text-white rounded-pill">
                  Twoja marka
                </span>
              )}
            </div>

            <div className="px-6 md:px-8 pb-6 md:pb-8">
              {/* Screenshots row */}
              {profile.samplePostScreenshots?.length > 0 && (
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {profile.samplePostScreenshots.map((screenshot, i) => (
                    <div key={i} className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-beige-light">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/${screenshot.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${screenshot}`}
                        alt={`Post ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Dominant style */}
              <div className="mb-5 pb-5 border-b border-beige">
                <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">
                  Dominujący styl
                </p>
                <p className="text-text-muted leading-[1.8] text-[15px] mb-1">
                  {v.dominujacyStyl.opis}
                </p>
                <p className="text-xs text-text-gray italic">
                  {v.dominujacyStyl.powtarzalnosc}
                </p>
              </div>

              {/* Grid: colors + composition */}
              <div className="grid md:grid-cols-2 gap-4 mb-5 pb-5 border-b border-beige">
                <div className="bg-beige-light rounded-xl p-4">
                  <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Kolorystyka</p>
                  <p className="text-sm text-text-muted leading-relaxed">{v.kolorystyka}</p>
                </div>
                <div className="bg-beige-light rounded-xl p-4">
                  <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Kompozycja</p>
                  <p className="text-sm text-text-muted leading-relaxed">{v.composycja}</p>
                </div>
              </div>

              {/* Human presence */}
              <div className="mb-5 pb-5 border-b border-beige">
                <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Obecność człowieka</p>
                <p className="text-sm text-text-muted leading-relaxed">
                  {v.obecnoscCzlowieka.czy ? v.obecnoscCzlowieka.jakPokazany : 'Ludzie nie pojawiają się w postach tej marki.'}
                </p>
              </div>

              {/* Tensions */}
              {v.napiecia && (
                <div>
                  <p className="text-xs text-dk-orange uppercase tracking-wider mb-1.5">Co łamie wzorzec</p>
                  <p className="text-sm text-text-muted leading-relaxed">{v.napiecia}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Category-level visual synthesis */}
      {categoryVisuals && (
        <>
          {/* Common patterns */}
          <div className="bg-text-dark text-white rounded-card p-8 md:p-10">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
              Wizualna konwencja kategorii
            </p>
            <p className="font-heading text-xl md:text-2xl leading-snug mb-6">
              {categoryVisuals.implikowanySwiatklienta}
            </p>

            <div className="space-y-4 mt-6">
              {categoryVisuals.wspolneWzorce.map((wzorzec, i) => (
                <div key={i} className="border-t border-white/10 pt-4">
                  <p className="text-sm text-white/90 font-medium mb-1">{wzorzec.wzorzec}</p>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {wzorzec.marki.map((m, j) => (
                      <span key={j} className="text-[10px] px-2 py-0.5 bg-white/10 text-white/60 rounded-pill">
                        {m}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-white/50">{wzorzec.znaczenie}</p>
                </div>
              ))}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
