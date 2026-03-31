'use client';

import type { ComparativeGaps } from '@/types/scanner';

interface ComparativeGapsSectionProps {
  gaps: ComparativeGaps;
}

export default function ComparativeGapsSection({ gaps }: ComparativeGapsSectionProps) {
  if (!gaps.tematy || gaps.tematy.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-10">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Analiza porównawcza
        </p>
        <p className="font-heading text-2xl md:text-3xl leading-snug">
          Kto o czym mówi — a kto milczy?
        </p>
      </div>

      {/* Gap cards */}
      {gaps.tematy.map((temat, i) => (
        <div key={i} className="bg-white rounded-card p-6 md:p-8">
          <p className="font-heading text-lg text-text-primary mb-4">
            {temat.temat}
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-beige-light rounded-xl p-4">
              <p className="text-xs text-dk-teal uppercase tracking-wider mb-2">Kto mówi</p>
              <div className="flex flex-wrap gap-1.5">
                {temat.ktoMowi.map((m, j) => (
                  <span key={j} className="text-xs px-2.5 py-1 bg-dk-teal/10 text-dk-teal rounded-pill font-medium">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-beige-light rounded-xl p-4">
              <p className="text-xs text-dk-orange uppercase tracking-wider mb-2">Kto milczy</p>
              <div className="flex flex-wrap gap-1.5">
                {temat.ktoMilczy.map((m, j) => (
                  <span key={j} className="text-xs px-2.5 py-1 bg-dk-orange/10 text-dk-orange rounded-pill font-medium">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed">
            {temat.znaczenie}
          </p>
        </div>
      ))}
    </div>
  );
}
