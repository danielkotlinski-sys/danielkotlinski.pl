'use client';

import { useState, useEffect } from 'react';
import type { ScannerReport } from '@/types/scanner';
import BrandProfileCard from './BrandProfileCard';
import ConventionSection from './ConventionSection';
import ClientPositionSection from './ClientPositionSection';
import VisualConventionsSection from './VisualConventionsSection';
import GateSection from './GateSection';

interface ReportContainerProps {
  report: ScannerReport;
  firstName?: string;
}

const TOC_ITEMS = [
  { id: 'profiles', label: 'Profile marek' },
  { id: 'visual', label: 'Konwencje wizualne' },
  { id: 'convention', label: 'Konwencja kategorii' },
  { id: 'position', label: 'Twoja pozycja' },
  { id: 'cta', label: 'Co dalej' },
];

export default function ReportContainer({ report, firstName }: ReportContainerProps) {
  const [activeSection, setActiveSection] = useState('profiles');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    TOC_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="max-w-report mx-auto relative">
      {/* Sticky TOC - desktop only */}
      <nav className="hidden lg:block fixed left-8 top-1/2 -translate-y-1/2 z-40">
        <div className="space-y-3">
          {TOC_ITEMS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`block text-xs transition-all duration-300 ${
                activeSection === id
                  ? 'text-dk-teal font-medium translate-x-1'
                  : 'text-text-gray/50 hover:text-text-gray'
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* Report header */}
      <header className="mb-16">
        <div className="bg-white rounded-card p-8 md:p-12">
          {firstName && (
            <p className="text-text-gray text-sm mb-3">
              Raport przygotowany dla: {firstName}
            </p>
          )}
          <h1 className="font-heading text-4xl md:text-5xl text-text-primary mb-4 text-balance">
            Skan kategorii
          </h1>
          <p className="font-heading text-2xl text-text-muted italic mb-8">
            {report.meta.category}
          </p>
          <div className="flex flex-wrap gap-6 text-sm text-text-secondary">
            <div>
              <span className="text-text-gray text-xs uppercase tracking-wider block mb-1">Marki</span>
              <span>{report.meta.brandsAnalyzed.join(', ')}</span>
            </div>
            <div>
              <span className="text-text-gray text-xs uppercase tracking-wider block mb-1">Źródła</span>
              <span>strona WWW, social media, dyskurs zewnętrzny</span>
            </div>
          </div>
        </div>
      </header>

      {/* Section 1: Brand profiles */}
      <section id="profiles" className="mb-20">
        <div className="mb-8">
          <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">Część 1</p>
          <h2 className="font-heading text-3xl md:text-4xl text-text-primary">
            Profile marek
          </h2>
        </div>
        <div className="space-y-6">
          {report.brandProfiles.map((profile) => (
            <BrandProfileCard key={profile.brandName} profile={profile} />
          ))}
        </div>
      </section>

      {/* Section 2: Visual conventions */}
      <section id="visual" className="mb-20">
        <div className="mb-8">
          <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">Część 2</p>
          <h2 className="font-heading text-3xl md:text-4xl text-text-primary">
            Konwencje wizualne
          </h2>
        </div>
        <VisualConventionsSection report={report} />
      </section>

      {/* Section 3: Category conventions */}
      <section id="convention" className="mb-20">
        <div className="mb-8">
          <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">Część 3</p>
          <h2 className="font-heading text-3xl md:text-4xl text-text-primary">
            Konwencja kategorii
          </h2>
        </div>
        <ConventionSection conventions={report.konwencjaKategorii} />
      </section>

      {/* Section 4: Client position */}
      <section id="position" className="mb-20">
        <div className="mb-8">
          <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">Część 4</p>
          <h2 className="font-heading text-3xl md:text-4xl text-text-primary">
            Twoja marka: {report.meta.clientBrand}
          </h2>
        </div>
        <ClientPositionSection
          position={report.pozycjaKlienta}
          brandName={report.meta.clientBrand}
        />
      </section>

      {/* Section 5: Gate CTA */}
      <section id="cta" className="mb-16">
        <GateSection notaKoncowa={report.notaKoncowa} />
      </section>

      {/* Footer */}
      <footer className="pt-8 border-t border-beige-dark/30 text-center text-sm text-text-gray pb-12">
        <p>danielkotlinski.pl &middot; Skan wygenerowany {new Date(report.meta.generatedAt).toLocaleDateString('pl-PL')}</p>
      </footer>
    </div>
  );
}
