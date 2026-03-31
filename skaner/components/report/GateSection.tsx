'use client';

interface GateSectionProps {
  notaKoncowa: string;
}

export default function GateSection({ notaKoncowa }: GateSectionProps) {
  return (
    <div className="bg-text-dark text-white rounded-card p-8 md:p-12 text-center">
      <p className="text-lg md:text-xl leading-relaxed max-w-xl mx-auto mb-10 text-white/80">
        {notaKoncowa}
      </p>
      <a
        href="https://danielkotlinski.pl/kontakt"
        className="inline-flex items-center px-8 py-3.5 bg-dk-orange text-white rounded-pill font-medium text-lg hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
      >
        Umów bezpłatną rozmowę
      </a>
    </div>
  );
}
