'use client';

import { useState } from 'react';
import type { ScannerReport } from '@/types/scanner';

interface Props {
  websiteScreenshots: NonNullable<ScannerReport['websiteScreenshots']>;
}

export default function WebsiteScreenshotsSection({ websiteScreenshots }: Props) {
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  if (websiteScreenshots.length === 0) return null;

  return (
    <div className="space-y-6">
      {websiteScreenshots.map(({ brandName, pages }) => (
        <div key={brandName} className="bg-white rounded-card overflow-hidden">
          <div className="p-6 md:p-8">
            <h3 className="font-heading text-xl text-text-primary mb-1">
              {brandName}
            </h3>
            <p className="text-xs text-text-gray mb-5">
              {pages.length} {pages.length === 1 ? 'strona' : pages.length < 5 ? 'strony' : 'stron'} &middot;{' '}
              {pages.map((p) => {
                try {
                  const pathname = new URL(p.url).pathname;
                  return pathname === '/' ? 'Strona główna' : pathname;
                } catch {
                  return p.url;
                }
              }).join(', ')}
            </p>

            {/* Screenshot grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pages.slice(0, expandedBrand === brandName ? undefined : 2).map((page, i) => (
                <div
                  key={i}
                  className="group relative rounded-xl overflow-hidden border border-beige-dark/15 bg-beige-light"
                >
                  {/* Page label */}
                  <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-medium text-text-secondary shadow-sm">
                    {i === 0 ? 'Strona główna' : (() => {
                      try { return new URL(page.url).pathname; } catch { return page.title || `Podstrona ${i}`; }
                    })()}
                  </div>

                  {/* Screenshot */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/${page.screenshotBase64.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${page.screenshotBase64}`}
                    alt={`${brandName} — ${page.title || page.url}`}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            {/* Show more button */}
            {pages.length > 2 && (
              <button
                onClick={() => setExpandedBrand(expandedBrand === brandName ? null : brandName)}
                className="mt-4 text-sm text-dk-teal hover:text-dk-teal/80 transition-colors font-medium"
              >
                {expandedBrand === brandName
                  ? 'Zwiń'
                  : `Pokaż wszystkie ${pages.length} strony`}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
