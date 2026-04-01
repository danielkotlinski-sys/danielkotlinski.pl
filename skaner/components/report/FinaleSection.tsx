'use client';

import type { BlueOceanFinale } from '@/types/scanner';

interface FinaleSectionProps {
  finale: BlueOceanFinale;
  brandName: string;
}

export default function FinaleSection({ finale, brandName }: FinaleSectionProps) {
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

      {/* Rupture hypothesis — the core insight */}
      <div className="bg-white rounded-card overflow-hidden border border-beige-dark/20">
        <div className="p-6 md:p-8 border-b border-beige-dark/10">
          <p className="text-xs text-text-gray uppercase tracking-widest font-medium mb-3">
            Konwencja zakłada
          </p>
          <p className="text-text-primary leading-[1.8] text-[15px] font-medium">
            {finale.hipotezaPekniecia.konwencjaZaklada}
          </p>
        </div>
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
      </div>

      {/* New demand — defined by situation, not persona */}
      <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-amber-400">
        <p className="text-xs text-amber-600 uppercase tracking-widest font-medium mb-5">
          Nowy popyt — kogo i kiedy ta logika przyciąga
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Stan</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {finale.nowyPopyt.stan}
            </p>
          </div>
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Sytuacja</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {finale.nowyPopyt.sytuacja}
            </p>
          </div>
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Napięcie</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {finale.nowyPopyt.napiecie}
            </p>
          </div>
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Dlaczego nieobsługiwany</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {finale.nowyPopyt.dlaczegoNieobslugiwany}
            </p>
          </div>
        </div>
      </div>

      {/* Strategic move — the recommended direction */}
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

      {/* First test step */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Pierwszy krok testowy dla {brandName}
        </p>
        <p className="text-text-primary font-medium leading-[1.8] text-[15px]">
          {finale.pierwszyKrok}
        </p>
      </div>

      {/* Rejected directions — builds credibility */}
      {finale.odrzuconeKierunki && finale.odrzuconeKierunki.length > 0 && (
        <div className="bg-beige-light/50 rounded-card p-6 md:p-8">
          <p className="text-xs text-text-gray uppercase tracking-widest font-medium mb-5">
            Kierunki które rozważyliśmy i odrzuciliśmy
          </p>
          <div className="space-y-4">
            {finale.odrzuconeKierunki.map((k, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-text-gray/40 font-medium text-sm mt-0.5 shrink-0">{i + 1}.</span>
                <div>
                  <p className="text-sm text-text-primary font-medium leading-relaxed">
                    {k.kierunek}
                  </p>
                  <p className="text-sm text-text-gray leading-relaxed mt-1">
                    {k.dlaczegoOdrzucony}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-12 text-center">
        <p className="text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-4 text-white/80">
          Ten raport pokazuje konwencję i jej pęknięcia &mdash; ale nie odpowiada na kluczowe pytanie: jak konkretnie Twoja marka może wyrwać się z rywalizacji na te same parametry, o tego samego klienta, i sięgnąć po unikalny, nowy popyt?
        </p>
        <p className="text-sm text-white/50 mb-10 max-w-xl mx-auto">
          W pełnym procesie strategicznym, pomagam markom wejść głębiej w kategorię, badam ukryte motywacje klientów i formułuję przejrzyste, proste w zrozumieniu i implementacji strategie marek.
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
