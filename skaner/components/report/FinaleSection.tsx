'use client';

import type { BlueOceanFinale, CategoryConventions } from '@/types/scanner';

interface FinaleSectionProps {
  finale: BlueOceanFinale;
  conventions: CategoryConventions;
  brandName: string;
}

export default function FinaleSection({ finale, conventions, brandName }: FinaleSectionProps) {
  return (
    <div className="space-y-6">
      {/* Mechanism reminder + reversal side by side */}
      <div className="grid md:grid-cols-2 gap-0 rounded-card overflow-hidden">
        {/* Left: mechanism reminder (no header — it's a callback) */}
        <div className="bg-text-dark text-white p-8 md:p-10">
          <p className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">
            Konwencja mówi
          </p>
          <p className="text-white/70 leading-[1.8] text-[15px]">
            {conventions.mechanizmKategorii.regula}
          </p>
        </div>
        {/* Right: the reversal — this is the clue */}
        <div className="bg-dk-orange text-white p-8 md:p-10">
          <p className="text-xs text-white/70 uppercase tracking-widest font-medium mb-4">
            A co gdyby to było błędne?
          </p>
          <p className="text-white leading-[1.8] text-[15px]">
            {finale.odwroconaKonwencja.odwrocenie}
          </p>
        </div>
      </div>

      {/* Who the category excludes */}
      <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-amber-400">
        <p className="text-xs text-amber-600 uppercase tracking-widest font-medium mb-3">
          Kogo kategoria systematycznie pomija
        </p>
        <p className="text-text-muted leading-[1.8] text-[15px] mb-5">
          {finale.pominietaGrupa.kim}
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Skala</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {finale.pominietaGrupa.skala}
            </p>
          </div>
          <div className="bg-amber-50/50 rounded-xl p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider mb-1.5">Bariera</p>
            <p className="text-sm text-text-muted leading-relaxed">
              {finale.pominietaGrupa.dlaczegoNieKupuje}
            </p>
          </div>
        </div>
      </div>

      {/* Provocation — single moment */}
      <div className="bg-dk-teal/5 border border-dk-teal/20 rounded-card p-8 md:p-12 text-center">
        <p className="font-heading text-2xl md:text-3xl text-text-primary leading-snug">
          {finale.prowokacja}
        </p>
      </div>

      {/* Direction */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Kierunek dla {brandName}
        </p>
        <p className="text-text-muted leading-[1.8] text-[15px] mb-5">
          {finale.kierunek.coZmienilby}
        </p>
        <div className="bg-beige-light rounded-xl p-5">
          <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Pierwszy krok</p>
          <p className="text-sm text-text-primary font-medium leading-relaxed">
            {finale.kierunek.pierwszyKrok}
          </p>
        </div>
      </div>

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
