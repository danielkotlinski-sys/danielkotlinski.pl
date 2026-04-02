'use client';

import type { BlueOceanFinale } from '@/types/scanner';

interface FinaleSectionProps {
  finale: BlueOceanFinale;
  brandName: string;
}

export default function FinaleSection({ finale, brandName }: FinaleSectionProps) {
  const hasNewFormat = finale.hipotezaPekniecia?.wariant1 && finale.kierunki?.length > 0;

  return (
    <div className="space-y-6">
      {/* Mechanism — how the category generates value today */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-10">
        <p className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">
          Mechanizm kategorii
        </p>
        <p className="text-white/80 leading-[1.8] text-[15px]">
          {finale.mechanizmKategorii}
        </p>
      </div>

      {/* Rupture hypothesis */}
      <div className="bg-white rounded-card overflow-hidden border border-beige-dark/20">
        <div className="p-6 md:p-8 border-b border-beige-dark/10">
          <p className="text-xs text-text-gray uppercase tracking-widest font-medium mb-3">
            Konwencja zakłada
          </p>
          <p className="text-text-primary leading-[1.8] text-[15px] font-medium">
            {finale.hipotezaPekniecia.konwencjaZaklada}
          </p>
        </div>

        {hasNewFormat ? (
          <>
            {/* Variant 1 */}
            <div className="p-6 md:p-8 border-b border-beige-dark/10 bg-dk-orange/5">
              <p className="text-xs text-dk-orange uppercase tracking-widest font-medium mb-3">
                To może być błędne, bo — perspektywa 1
              </p>
              <p className="text-text-muted leading-[1.8] text-[15px] mb-4">
                {finale.hipotezaPekniecia.wariant1.toMozeBycBledne}
              </p>
              <div className="bg-white/60 rounded-xl p-4">
                <p className="text-xs text-dk-teal uppercase tracking-wider mb-1.5">Alternatywna logika</p>
                <p className="text-sm text-text-muted leading-relaxed">
                  {finale.hipotezaPekniecia.wariant1.alternatywnaLogika}
                </p>
              </div>
            </div>

            {/* Variant 2 */}
            <div className="p-6 md:p-8 bg-dk-orange/5">
              <p className="text-xs text-dk-orange uppercase tracking-widest font-medium mb-3">
                To może być błędne, bo — perspektywa 2
              </p>
              <p className="text-text-muted leading-[1.8] text-[15px] mb-4">
                {finale.hipotezaPekniecia.wariant2.toMozeBycBledne}
              </p>
              <div className="bg-white/60 rounded-xl p-4">
                <p className="text-xs text-dk-teal uppercase tracking-wider mb-1.5">Alternatywna logika</p>
                <p className="text-sm text-text-muted leading-relaxed">
                  {finale.hipotezaPekniecia.wariant2.alternatywnaLogika}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Legacy single-variant format */}
            <div className="p-6 md:p-8 border-b border-beige-dark/10 bg-dk-orange/5">
              <p className="text-xs text-dk-orange uppercase tracking-widest font-medium mb-3">
                To może być błędne, bo
              </p>
              <p className="text-text-muted leading-[1.8] text-[15px]">
                {finale.hipotezaPekniecia.toMozeBycBledne}
              </p>
            </div>
            <div className="p-6 md:p-8 bg-dk-teal/5">
              <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
                Alternatywna logika
              </p>
              <p className="text-text-muted leading-[1.8] text-[15px]">
                {finale.hipotezaPekniecia.alternatywnaLogika}
              </p>
            </div>
          </>
        )}
      </div>

      {/* "What if" directions — 5 techniques */}
      {finale.kierunki && finale.kierunki.length > 0 && (
        <div className="bg-white rounded-card p-6 md:p-8">
          <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">
            A co gdyby...?
          </p>
          <p className="text-sm text-text-gray mb-6">
            5 kierunków opartych na technikach łamania konwencji — nie rekomendacje, ale możliwości które się otwierają.
          </p>
          <div className="space-y-5">
            {finale.kierunki.map((k, i) => (
              <div key={i} className="border-l-2 border-dk-teal/30 pl-5">
                <p className="text-[10px] text-dk-teal uppercase tracking-widest font-medium mb-1.5">
                  {k.technika}
                </p>
                <p className="text-text-muted leading-[1.8] text-[15px]">
                  {k.aCoGdyby}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy sections for old reports */}
      {!hasNewFormat && finale.ruchStrategiczny && (
        <>
          <div className="bg-dk-teal/5 border border-dk-teal/20 rounded-card p-8 md:p-10">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">
              Ruch strategiczny
            </p>
            <p className="font-heading text-2xl md:text-3xl text-text-primary leading-snug mb-5">
              {finale.ruchStrategiczny.nazwa}
            </p>
            <p className="text-text-muted leading-[1.8] text-[15px] mb-5">
              {finale.ruchStrategiczny.definicja}
            </p>
            <div className="bg-white/60 rounded-xl p-5">
              <p className="text-xs text-dk-teal uppercase tracking-wider mb-1.5">Co się zmienia</p>
              <p className="text-sm text-text-muted leading-relaxed">
                {finale.ruchStrategiczny.coSieZmienia}
              </p>
            </div>
          </div>
          {finale.pierwszyKrok && (
            <div className="bg-white rounded-card p-6 md:p-8">
              <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
                Pierwszy krok testowy dla {brandName}
              </p>
              <p className="text-text-primary font-medium leading-[1.8] text-[15px]">
                {finale.pierwszyKrok}
              </p>
            </div>
          )}
        </>
      )}

      {/* CTA */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-12 text-center">
        <p className="text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-4 text-white/80">
          To co widzisz to próbka &mdash; automatyczny research oparty wyłącznie o publicznie dostępne dane. Pełny proces strategiczny łączy ten autoresearch z pogłębioną analizą stratega oraz wywiadami z&nbsp;Twoimi klientami, żeby zrozumieć ich prawdziwe motywacje.
        </p>
        <p className="text-sm text-white/50 mb-10 max-w-xl mx-auto">
          Dopiero ta kombinacja &mdash; dane + interpretacja + głos klienta &mdash; pozwala zbudować pozycję marki, która wyrwie ją z porównań z konkurencją.
        </p>
        <a
          href="https://danielkotlinski.pl/kontakt"
          className="inline-flex items-center px-8 py-3.5 bg-dk-orange text-white rounded-pill font-medium text-lg hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
        >
          Porozmawiajmy o strategii Twojej marki
        </a>
      </div>
    </div>
  );
}
