'use client';

import { useState, useEffect } from 'react';
import type { ScannerReport } from '@/types/scanner';
import BrandProfileCard from './BrandProfileCard';
import CategoryMapSection from './CategoryMapSection';
import ConventionSection from './ConventionSection';
import ComparativeGapsSection from './ComparativeGapsSection';
import VisualConventionsSection from './VisualConventionsSection';
import FinaleSection from './FinaleSection';
import GateSection from './GateSection';
import PdfDownloadButton from './PdfDownloadButton';

interface ReportContainerProps {
  report: ScannerReport;
  firstName?: string;
}

const SECTION_EXPLAINERS: Record<string, { heading: string; explainer: string }> = {
  profiles: {
    heading: 'Profile marek',
    explainer: 'Zaczynamy od obserwacji. Każda marka opowiada historię o swoim kliencie — przez język, obietnicę, mechanizm sprzedaży. Te historie ujawniają założenia, z których marki nawet nie zdają sobie sprawy.',
  },
  visual: {
    heading: 'Konwencje wizualne',
    explainer: 'Komunikacja wizualna zdradza więcej niż tekst. Powtarzające się kolory, kadry, nastroje — to nie przypadek. To wizualny język kategorii, który mówi klientowi: jesteś tu u siebie (albo nie).',
  },
  map: {
    heading: 'Krajobraz kategorii',
    explainer: 'Kim są gracze i jakie pozycje zajmują? Zanim szukamy wzorców, potrzebujemy krajobrazu — kto jest liderem, kto challengerem, kto gra w inną grę.',
  },
  gaps: {
    heading: 'Luki komunikacyjne',
    explainer: 'Kto mówi o czym — a kto milczy? Milczenie jest strategiczną informacją. Pokazuje jakie tematy kategoria uznaje za zbyt ryzykowne lub zbyt oczywiste żeby je artykułować.',
  },
  convention: {
    heading: 'Konwencja kategorii',
    explainer: 'Tu wyłania się wzorzec. Wszystkie marki — choć konkurują — grają tę samą grę, według tych samych niepisanych reguł. Oto mechanizm, który trzyma kategorię w pułapce jednomyślności — i miejsce Twojej marki w tym układzie.',
  },
  finale: {
    heading: 'Pęknięcie strategiczne',
    explainer: 'Konwencja opisuje jak kategoria generuje wartość dziś. Ale każda logika opiera się na założeniach — a założenia mają koszty i ślepe punkty. Pytanie brzmi: co się otwiera, kiedy zaczynasz myśleć poza tą logiką?',
  },
};

function ExportButton({ format, label }: { format: string; label: string }) {
  const handleExport = () => {
    // Extract scanId from URL path: /raport/[scanId]
    const match = window.location.pathname.match(/\/raport\/([^/]+)/);
    if (!match) return;
    window.open(`/api/scan/${match[1]}/export?format=${format}`, '_blank');
  };

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-gray border border-beige-dark/30 rounded-pill hover:bg-white hover:text-text-primary transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label}
    </button>
  );
}

export default function ReportContainer({ report, firstName }: ReportContainerProps) {
  const [activeSection, setActiveSection] = useState('profiles');

  // Build TOC dynamically based on available data
  const tocItems = [
    { id: 'profiles', label: 'Profile marek' },
    { id: 'visual', label: 'Konwencje wizualne' },
    ...(report.mapaKategorii ? [{ id: 'map', label: 'Krajobraz kategorii' }] : []),
    ...(report.lukiKomunikacyjne ? [{ id: 'gaps', label: 'Luki komunikacyjne' }] : []),
    { id: 'convention', label: 'Konwencja i Twoja marka' },
    ...(report.blueOceanFinale ? [{ id: 'finale', label: 'Pęknięcie strategiczne' }] : []),
    { id: 'cta', label: 'Co dalej' },
  ];

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

    tocItems.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic section numbering
  let sectionCounter = 0;
  const nextSection = () => {
    sectionCounter++;
    return sectionCounter;
  };

  return (
    <div id="report-content" className="max-w-report mx-auto relative">
      {/* Sticky TOC - desktop only */}
      <nav className="hidden lg:block fixed left-8 top-1/2 -translate-y-1/2 z-40">
        <div className="space-y-3">
          {tocItems.map(({ id, label }) => (
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
          <p className="text-sm text-text-gray mt-8 leading-relaxed max-w-2xl">
            Ten raport to podróż przez odkrycie. Zaczynamy od obserwacji poszczególnych marek, budujemy mapę kategorii, odkrywamy milczącą konwencję — i na końcu zadajemy pytanie, które może zmienić sposób w jaki myślisz o swoim rynku.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PdfDownloadButton
              report={report}
              fileName={`skan-kategorii-${report.meta.clientBrand.toLowerCase().replace(/\s+/g, '-')}`}
            />
            <ExportButton format="markdown" label="Markdown" />
            <ExportButton format="sources" label="Źródła (TXT)" />
          </div>
        </div>
      </header>

      {/* Section: Brand profiles — observation layer */}
      <section id="profiles" className="mb-20">
        <SectionHeader num={nextSection()} sectionId="profiles" />
        <div className="space-y-6">
          {report.brandProfiles.map((profile) => (
            <BrandProfileCard
              key={profile.brandName}
              profile={profile}
              brandAdsData={report.adsData?.find((a) => a.brandName === profile.brandName)}
            />
          ))}
        </div>
      </section>

      {/* Section 2: Visual conventions — pattern stacking */}
      <section id="visual" className="mb-20">
        <SectionHeader num={nextSection()} sectionId="visual" />
        <VisualConventionsSection report={report} />
      </section>

      {/* Section 3: Category map — landscape */}
      {report.mapaKategorii && (
        <section id="map" className="mb-20">
          <SectionHeader num={nextSection()} sectionId="map" />
          <CategoryMapSection map={report.mapaKategorii} clientBrandName={report.meta.clientBrand} />
        </section>
      )}

      {/* Section 4: Communication gaps — what's unsaid */}
      {report.lukiKomunikacyjne && (
        <section id="gaps" className="mb-20">
          <SectionHeader num={nextSection()} sectionId="gaps" />
          <ComparativeGapsSection gaps={report.lukiKomunikacyjne} />
        </section>
      )}

      {/* Section: Category conventions + client position */}
      <section id="convention" className="mb-20">
        <SectionHeader num={nextSection()} sectionId="convention" />
        <ConventionSection
          conventions={report.konwencjaKategorii}
          clientPosition={report.pozycjaKlienta}
          clientBrandName={report.meta.clientBrand}
        />
      </section>

      {/* Section 6: Odwrócona perspektywa */}
      {report.blueOceanFinale ? (
        <section id="finale" className="mb-20">
          <SectionHeader num={nextSection()} sectionId="finale" />
          <FinaleSection
            finale={report.blueOceanFinale}
            brandName={report.meta.clientBrand}
          />
        </section>
      ) : (
        <section id="cta" className="mb-16">
          <GateSection notaKoncowa={report.notaKoncowa} />
        </section>
      )}

      {/* Footer */}
      <footer className="pt-8 border-t border-beige-dark/30 text-center text-sm text-text-gray pb-12">
        <p>danielkotlinski.pl &middot; Skan wygenerowany {new Date(report.meta.generatedAt).toLocaleDateString('pl-PL')}</p>
      </footer>
    </div>
  );
}

function SectionHeader({
  num,
  sectionId,
  headingOverride,
}: {
  num: number;
  sectionId: string;
  headingOverride?: string;
}) {
  const meta = SECTION_EXPLAINERS[sectionId];
  if (!meta) return null;

  return (
    <div className="mb-8">
      <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-2">
        Część {num}
      </p>
      <h2 className="font-heading text-3xl md:text-4xl text-text-primary mb-3">
        {headingOverride || meta.heading}
      </h2>
      <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
        {meta.explainer}
      </p>
    </div>
  );
}
