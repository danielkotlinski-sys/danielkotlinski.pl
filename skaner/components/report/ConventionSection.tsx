'use client';

import type { CategoryConventions } from '@/types/scanner';

interface ConventionSectionProps {
  conventions: CategoryConventions;
}

export default function ConventionSection({ conventions }: ConventionSectionProps) {
  const ocenaColors: Record<string, string> = {
    'zgodna z konwencją': 'bg-gray-100 text-gray-600',
    'częściowo odchylona': 'bg-amber-50 text-amber-700',
    'wyraźnie łamiąca': 'bg-red-50 text-red-700',
  };

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">
        Konwencja kategorii
      </h2>

      {/* Mechanizm kategorii — hero */}
      <div className="bg-gray-900 text-white rounded-xl p-8 mb-6">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Mechanizm kategorii
        </p>
        <p className="text-xl leading-relaxed font-medium mb-4">
          {conventions.mechanizmKategorii.regula}
        </p>
        <p className="text-sm text-gray-400 leading-relaxed">
          {conventions.mechanizmKategorii.uzasadnienie}
        </p>
      </div>

      {/* Implikowany klient kategorii */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-200 rounded-xl p-6">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            Implikowany klient kategorii
          </h4>
          <p className="text-gray-700 leading-relaxed">
            {conventions.implikowanyKlientKategorii.tosazmosc}
          </p>
        </div>
        <div className="border border-gray-200 rounded-xl p-6">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            Systematycznie pomijani
          </h4>
          <p className="text-gray-700 leading-relaxed">
            {conventions.implikowanyKlientKategorii.systematyczniePomijani}
          </p>
        </div>
      </div>

      {/* Dowody konwencji */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Dowody konwencji
        </h4>
        <div className="space-y-3">
          {conventions.dowodyKonwencji.map((dowod, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-900 mb-2">
                {dowod.wzorzec}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {dowod.marki.map((marka, j) => (
                  <span
                    key={j}
                    className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded"
                  >
                    {marka}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500">{dowod.znaczenie}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mapa wyróżnialności */}
      <div>
        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Mapa wyróżnialności
        </h4>
        <div className="space-y-2">
          {conventions.mapaWyroznialnosci.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-3 rounded-lg border border-gray-100"
            >
              <span className="font-medium text-gray-900 w-36 shrink-0">
                {item.marka}
              </span>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                  ocenaColors[item.ocena] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.ocena}
              </span>
              <span className="text-sm text-gray-500">{item.uzasadnienie}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
