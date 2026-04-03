'use client';

import type { BrandAdsData } from '@/types/scanner';

interface AdsSectionProps {
  adsData: BrandAdsData[];
  clientBrandName: string;
}

export default function AdsSection({ adsData, clientBrandName }: AdsSectionProps) {
  return (
    <div className="space-y-8">
      {adsData.map((brand) => (
        <div key={brand.brandName} className="bg-white rounded-card p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-heading text-xl text-text-primary">
              {brand.brandName}
              {brand.brandName === clientBrandName && (
                <span className="ml-2 text-xs px-2 py-0.5 bg-dk-teal/10 text-dk-teal rounded-pill font-medium">
                  Twoja marka
                </span>
              )}
            </h3>
            <span className="text-xs text-text-gray">
              {brand.activeCount} aktywnych / {brand.adCount} reklam
            </span>
          </div>

          {brand.ads.length === 0 ? (
            <p className="text-sm text-text-muted">Brak aktywnych reklam w Meta Ad Library.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {brand.ads.map((ad, i) => (
                <div key={i} className="border border-beige-dark/20 rounded-xl overflow-hidden">
                  {/* Ad image */}
                  {ad.imageBase64 && (
                    <div className="aspect-video bg-beige-light overflow-hidden">
                      <img
                        src={`data:image/${ad.imageBase64?.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${ad.imageBase64}`}
                        alt={`Reklama ${brand.brandName}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-4">
                    {/* Ad title */}
                    {ad.linkTitle && (
                      <p className="font-medium text-sm text-text-primary mb-1 line-clamp-2">
                        {ad.linkTitle}
                      </p>
                    )}

                    {/* Ad body */}
                    {ad.bodyText && (
                      <p className="text-xs text-text-muted line-clamp-4 mb-2">
                        {ad.bodyText}
                      </p>
                    )}

                    {/* Meta info */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ad.startDate && (
                        <span className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill">
                          od {new Date(ad.startDate).toLocaleDateString('pl-PL')}
                        </span>
                      )}
                      {ad.spendRange && (
                        <span className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill">
                          {ad.spendRange}
                        </span>
                      )}
                      {ad.impressionsRange && (
                        <span className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill">
                          {ad.impressionsRange} wyświetleń
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
