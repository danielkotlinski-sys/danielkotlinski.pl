'use client';

import type { CategoryConventions, ClientPosition } from '@/types/scanner';

interface ConventionSectionProps {
  conventions: CategoryConventions;
  clientPosition?: ClientPosition;
  clientBrandName?: string;
}

export default function ConventionSection({
  conventions,
  clientPosition,
  clientBrandName,
}: ConventionSectionProps) {
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

      {/* Kto gra w konwencji — jak */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">
          Kto jak gra w konwencji
        </p>
        <p className="text-xs text-text-gray mb-5">
          Ocena każdej marki pod kątem zgodności z odkrytą konwencją kategorii.
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

      {/* Client position — integrated as sub-section */}
      {clientPosition && (
        <>
          <div className="pt-6">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">
              {clientBrandName || 'Twoja marka'} wobec konwencji
            </p>
          </div>

          {/* Convention alignment */}
          <div className="bg-white rounded-card p-6 md:p-8">
            <span className="inline-block text-xs px-3 py-1 bg-beige-light text-text-muted rounded-pill font-medium mb-4">
              {clientPosition.zgodnosc.ocena}
            </span>
            <ul className="space-y-2.5">
              {clientPosition.zgodnosc.elementy.map((el, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-text-muted leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-dk-teal mt-2 shrink-0" />
                  {el}
                </li>
              ))}
            </ul>
          </div>

          {/* Deviations */}
          <div className="bg-white rounded-card p-6 md:p-8">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
              Gdzie wychodzisz poza konwencję
            </p>
            <ul className="space-y-2.5 mb-4">
              {clientPosition.odchylenia.elementy.map((el, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-text-muted leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-dk-orange mt-2 shrink-0" />
                  {el}
                </li>
              ))}
            </ul>
            <div className="bg-beige-light rounded-xl p-4">
              <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Znaczenie strategiczne</p>
              <p className="text-sm text-text-muted italic leading-relaxed">
                {clientPosition.odchylenia.znaczenieStrategiczne}
              </p>
            </div>
          </div>

          {/* Threat */}
          <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-red-400">
            <p className="text-xs text-red-600 uppercase tracking-widest font-medium mb-3">
              Co się stanie jeśli zostaniesz w konwencji
            </p>
            <p className="text-text-muted leading-[1.8] text-[15px]">
              {clientPosition.zagrozenie}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
