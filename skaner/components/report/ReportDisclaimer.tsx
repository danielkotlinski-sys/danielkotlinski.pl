'use client';

import { useState } from 'react';

export default function ReportDisclaimer({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="relative">
      {/* Disclaimer overlay */}
      {!accepted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-text-dark/40 backdrop-blur-sm">
          <div className="bg-white rounded-card p-8 md:p-12 max-w-xl w-full shadow-xl">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
              Zanim przejdziesz do raportu
            </p>
            <h2 className="font-heading text-2xl md:text-3xl text-text-primary mb-6">
              Informacja o charakterze raportu
            </h2>
            <div className="text-sm text-text-muted leading-[1.8] space-y-4 mb-8">
              <p>
                Niniejszy raport został wygenerowany automatycznie z wykorzystaniem modeli AI,
                na podstawie publicznie dostępnych informacji. Analiza ma charakter poglądowy
                i orientacyjny.
              </p>
              <p>
                Pomimo staranności w doborze źródeł i metodologii, raport może zawierać
                nieścisłości, luki informacyjne lub interpretacje nieodzwierciedlające
                pełnego obrazu rynku. Dane finansowe, pozycje rynkowe i oceny marek
                opierają się na fragmentarycznych źródłach publicznych i nie zastępują
                profesjonalnej analizy rynkowej.
              </p>
              <p>
                Raport nie stanowi rekomendacji strategicznej ani podstawy do podejmowania
                decyzji biznesowych. Wszelkie wnioski i kierunki wskazane w raporcie wymagają
                weryfikacji i pogłębienia w ramach konsultacji ze strategiem.
              </p>
            </div>
            <button
              onClick={() => setAccepted(true)}
              className="w-full px-8 py-3.5 bg-dk-orange text-white rounded-pill font-medium text-lg hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
            >
              Rozumiem, pokaż raport
            </button>
          </div>
        </div>
      )}

      {/* Report — blurred when disclaimer is showing */}
      <div className={!accepted ? 'blur-md pointer-events-none select-none' : ''}>
        {children}
      </div>
    </div>
  );
}
