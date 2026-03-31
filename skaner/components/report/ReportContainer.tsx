'use client';

import type { ScannerReport } from '@/types/scanner';
import BrandProfileCard from './BrandProfileCard';
import ConventionSection from './ConventionSection';
import ClientPositionSection from './ClientPositionSection';
import GateSection from './GateSection';

interface ReportContainerProps {
  report: ScannerReport;
  firstName?: string;
}

export default function ReportContainer({ report, firstName }: ReportContainerProps) {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Section 1: Intro */}
      <header className="mb-12">
        {firstName && (
          <p className="text-gray-400 mb-2">
            Raport przygotowany dla: {firstName}
          </p>
        )}
        <h1 className="text-3xl font-semibold text-gray-900 mb-4">
          Skan kategorii: {report.meta.category}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          <p>
            <span className="font-medium">Marki:</span>{' '}
            {report.meta.brandsAnalyzed.join(', ')}
          </p>
          <p>
            <span className="font-medium">Źródła:</span> strona WWW, social
            media, dyskurs zewnętrzny
          </p>
        </div>
      </header>

      {/* Section 2: Brand profiles */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">
          Profile marek
        </h2>
        {report.brandProfiles.map((profile) => (
          <BrandProfileCard key={profile.brandName} profile={profile} />
        ))}
      </section>

      {/* Section 3: Category conventions */}
      <ConventionSection conventions={report.konwencjaKategorii} />

      {/* Section 4: Client position */}
      <ClientPositionSection
        position={report.pozycjaKlienta}
        brandName={report.meta.clientBrand}
      />

      {/* Section 5: Gate CTA */}
      <GateSection notaKoncowa={report.notaKoncowa} />

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
        <p>danielkotlinski.pl &middot; Skan wygenerowany {new Date(report.meta.generatedAt).toLocaleDateString('pl-PL')}</p>
      </footer>
    </div>
  );
}
