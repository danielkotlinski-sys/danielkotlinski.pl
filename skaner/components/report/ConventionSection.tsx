'use client';

import type { CategoryConventions } from '@/types/scanner';

interface ConventionSectionProps {
  conventions: CategoryConventions;
}

export default function ConventionSection({ conventions }: ConventionSectionProps) {
  const ocenaStyles: Record<string, string> = {
    'zgodna z konwencją': 'bg-beige-light text-text-muted',
    'częściowo odchylona': 'bg-amber-50 text-amber-700',
    'wyraźnie łamiąca': 'bg-red-50 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* Hero: category mechanism */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-10">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Mechanizm kategorii
        </p>
        <p className="font-heading text-2xl md:text-3xl leading-snug mb-6">
          {conventions.mechanizmKategorii.regula}
        </p>
        <p className="text-sm text-white/60 leading-relaxed">
          {conventions.mechanizmKategorii.uzasadnienie}
        </p>
      </div>

      {/* Implied category client */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
          Implikowany klient kategorii
        </p>
        <p className="text-text-muted leading-[1.8] text-[15px] mb-4">
          {conventions.implikowanyKlientKategorii.tosazmosc}
        </p>
        <div className="bg-beige-light rounded-xl p-5">
          <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Głębsza potrzeba</p>
          <p className="text-sm text-text-muted italic leading-relaxed">
            {conventions.implikowanyKlientKategorii.glebszaPotrzeba}
          </p>
        </div>
      </div>

      {/* Excluded group */}
      <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-amber-400">
        <p className="text-xs text-amber-600 uppercase tracking-widest font-medium mb-3">
          Kogo kategoria odpycha swoją formą
        </p>
        <p className="text-text-muted leading-[1.8] text-[15px] mb-5">
          {conventions.implikowanyKlientKategorii.pominietaGrupa.opis}
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Skala</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {conventions.implikowanyKlientKategorii.pominietaGrupa.proporcja}
            </p>
          </div>
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Co ich odpycha</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {conventions.implikowanyKlientKategorii.pominietaGrupa.dlaczegoOdpycha}
            </p>
          </div>
        </div>
      </div>

      {/* Convention evidence */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-5">
          Dowody konwencji
        </p>
        <div className="space-y-5">
          {conventions.dowodyKonwencji.map((dowod, i) => (
            <div key={i} className="pb-5 border-b border-beige last:border-0 last:pb-0">
              <p className="text-[15px] font-medium text-text-primary mb-2">
                {dowod.wzorzec}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {dowod.marki.map((marka, j) => (
                  <span key={j} className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill">
                    {marka}
                  </span>
                ))}
              </div>
              <p className="text-xs text-text-secondary">{dowod.znaczenie}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Distinctiveness map */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-5">
          Mapa wyróżnialności
        </p>
        <div className="space-y-3">
          {conventions.mapaWyroznialnosci.map((item, i) => (
            <div
              key={i}
              className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 py-3 border-b border-beige last:border-0"
            >
              <span className="font-heading text-lg text-text-primary md:w-40 shrink-0">
                {item.marka}
              </span>
              <span
                className={`text-xs px-3 py-1 rounded-pill font-medium shrink-0 w-fit ${
                  ocenaStyles[item.ocena] || 'bg-beige-light text-text-muted'
                }`}
              >
                {item.ocena}
              </span>
              <span className="text-sm text-text-secondary">{item.uzasadnienie}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
