'use client';

import type { CategoryMap } from '@/types/scanner';

interface CategoryMapSectionProps {
  map: CategoryMap;
}

export default function CategoryMapSection({ map }: CategoryMapSectionProps) {
  return (
    <div className="space-y-6">
      {/* Hero: hierarchy overview */}
      <div className="bg-text-dark text-white rounded-card p-8 md:p-10">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-4">
          Hierarchia kategorii
        </p>
        <p className="font-heading text-2xl md:text-3xl leading-snug mb-6">
          {map.hierarchia}
        </p>
        <p className="text-sm text-white/60 leading-relaxed">
          {map.obozy}
        </p>
      </div>

      {/* Players */}
      <div className="bg-white rounded-card p-6 md:p-8">
        <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-5">
          Gracze w kategorii
        </p>
        <div className="space-y-4">
          {map.gracze.map((gracz, i) => (
            <div key={i} className="pb-4 border-b border-beige last:border-0 last:pb-0">
              <div className="flex items-baseline gap-3 mb-1.5">
                <span className="font-heading text-lg text-text-primary">
                  {gracz.nazwa}
                </span>
                <span className="text-xs px-2.5 py-0.5 bg-beige text-text-gray rounded-pill">
                  {gracz.pozycja}
                </span>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                {gracz.charakter}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tensions */}
      <div className="bg-white rounded-card p-6 md:p-8 border-l-4 border-dk-orange">
        <p className="text-xs text-dk-orange uppercase tracking-widest font-medium mb-3">
          Napięcia w kategorii
        </p>
        <p className="text-text-muted leading-[1.8] text-[15px]">
          {map.napiecia}
        </p>
      </div>
    </div>
  );
}
