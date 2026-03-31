'use client';

import type { ClientPosition } from '@/types/scanner';

interface ClientPositionSectionProps {
  position: ClientPosition;
  brandName: string;
}

export default function ClientPositionSection({
  position,
  brandName,
}: ClientPositionSectionProps) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">
        Twoja marka: {brandName}
      </h2>

      {/* Zgodność z konwencją */}
      <div className="border border-gray-200 rounded-xl p-6 mb-4">
        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Zgodność z konwencją
        </h4>
        <span className="inline-block text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full font-medium mb-3">
          {position.zgodnosc.ocena}
        </span>
        <ul className="space-y-1.5">
          {position.zgodnosc.elementy.map((el, i) => (
            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-gray-300 mt-0.5 shrink-0">&#8226;</span>
              {el}
            </li>
          ))}
        </ul>
      </div>

      {/* Odchylenia */}
      <div className="border border-gray-200 rounded-xl p-6 mb-6">
        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Gdzie wychodzisz poza konwencję
        </h4>
        <ul className="space-y-1.5 mb-3">
          {position.odchylenia.elementy.map((el, i) => (
            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-gray-300 mt-0.5 shrink-0">&#8226;</span>
              {el}
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500 italic">
          {position.odchylenia.znaczenieStrategiczne}
        </p>
      </div>

      {/* Pytanie otwarte — hero */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Pytanie otwarte
        </p>
        <p className="text-xl md:text-2xl font-medium text-gray-900 leading-relaxed">
          {position.pytanieOtwarte}
        </p>
      </div>
    </section>
  );
}
