'use client';

import type { ClientPosition } from '@/types/scanner';

interface ClientPositionSectionProps {
  position: ClientPosition;
  brandName: string;
}

export default function ClientPositionSection({
  position,
}: ClientPositionSectionProps) {
  return (
    <div className="space-y-6">
      {/* Convention alignment */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Zgodność z konwencją
        </p>
        <span className="inline-block text-xs px-3 py-1 bg-beige-light text-text-muted rounded-pill font-medium mb-4">
          {position.zgodnosc.ocena}
        </span>
        <ul className="space-y-2.5">
          {position.zgodnosc.elementy.map((el, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-muted leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-dk-teal mt-2 shrink-0" />
              {el}
            </li>
          ))}
        </ul>
      </div>

      {/* Deviations */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Gdzie wychodzisz poza konwencję
        </p>
        <ul className="space-y-2.5 mb-4">
          {position.odchylenia.elementy.map((el, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-muted leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-dk-orange mt-2 shrink-0" />
              {el}
            </li>
          ))}
        </ul>
        <div className="bg-beige-light rounded-xl p-4">
          <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Znaczenie strategiczne</p>
          <p className="text-sm text-text-muted italic leading-relaxed">
            {position.odchylenia.znaczenieStrategiczne}
          </p>
        </div>
      </div>

      {/* Threat */}
      <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-red-400">
        <p className="text-xs text-red-600 uppercase tracking-widest font-medium mb-3">
          Co się stanie jeśli zostaniesz w konwencji
        </p>
        <p className="text-text-muted leading-[1.8] text-[15px]">
          {position.zagrozenie}
        </p>
      </div>

      {/* Open question — hero */}
      <div className="bg-dk-teal/5 border border-dk-teal/20 rounded-card p-8 md:p-12 text-center">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-6">
          Pytanie otwarte
        </p>
        <p className="font-heading text-2xl md:text-3xl text-text-primary leading-snug">
          {position.pytanieOtwarte}
        </p>
      </div>
    </div>
  );
}
