'use client';

import type { BlueOceanFinale } from '@/types/scanner';

interface FinaleSectionProps {
  finale: BlueOceanFinale;
  brandName: string;
}

export default function FinaleSection({ finale, brandName }: FinaleSectionProps) {
  return (
    <div className="space-y-6">
      {/* Hero: the reversed assumption */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-12">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Odwrócona konwencja
        </p>
        <p className="text-sm text-white/50 leading-relaxed mb-4">
          Cała kategoria zakłada:
        </p>
        <p className="font-heading text-xl md:text-2xl leading-snug mb-8 text-white/90">
          {finale.odwroconaKonwencja.zalozenie}
        </p>
        <div className="border-t border-white/10 pt-6">
          <p className="text-sm text-dk-teal font-medium mb-2">A co gdyby to było błędne?</p>
          <p className="text-white/80 leading-[1.8] text-[15px]">
            {finale.odwroconaKonwencja.odwrocenie}
          </p>
        </div>
      </div>

      {/* The ignored group */}
      <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-amber-400">
        <p className="text-xs text-amber-600 uppercase tracking-widest font-medium mb-3">
          Kogo kategoria systematycznie omija
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

      {/* Provocation — the big question */}
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
          Ten skan pokazuje konwencję i jej pęknięcia. Ale nie odpowiada na kluczowe pytanie: które pragnienia pomijanej grupy są uniwersalne &mdash; i jak zbudować narrację, która je przyciągnie.
        </p>
        <p className="text-sm text-white/50 mb-10 max-w-xl mx-auto">
          Pogłębiony skan + wywiady z klientami = konkretna strategia komunikacji, która łamie konwencję z premedytacją.
        </p>
        <a
          href="https://danielkotlinski.pl/kontakt"
          className="inline-flex items-center px-8 py-3.5 bg-dk-orange text-white rounded-pill font-medium text-lg hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
        >
          Porozmawiajmy o pogłębionym skanie
        </a>
      </div>
    </div>
  );
}
