'use client';

interface GateSectionProps {
  notaKoncowa: string;
}

export default function GateSection({ notaKoncowa }: GateSectionProps) {
  return (
    <section className="bg-gray-900 text-white rounded-xl p-8 md:p-12 text-center">
      <p className="text-lg md:text-xl leading-relaxed max-w-xl mx-auto mb-8">
        {notaKoncowa}
      </p>
      <a
        href="https://danielkotlinski.pl/kontakt"
        className="inline-block bg-white text-gray-900 px-8 py-3.5 rounded-lg font-medium text-lg hover:bg-gray-100 transition-colors"
      >
        Umów bezpłatną rozmowę
      </a>
    </section>
  );
}
