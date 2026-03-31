'use client';

import type { ScannerReport } from '@/types/scanner';

interface BrandProfileCardProps {
  profile: ScannerReport['brandProfiles'][number];
}

export default function BrandProfileCard({ profile }: BrandProfileCardProps) {
  const logika = profile.logikaSprzedazy;
  const klient = profile.implikowanyKlient;
  const dowody = profile.kluczoweDowody || [];

  return (
    <div className="bg-white rounded-card overflow-hidden">
      {/* Brand header */}
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 flex items-center gap-3">
        <h3 className="font-heading text-2xl text-text-primary">
          {profile.brandName}
        </h3>
        {profile.isClient && (
          <span className="text-xs px-3 py-1 bg-dk-teal text-white rounded-pill">
            Twoja marka
          </span>
        )}
      </div>

      {/* Content grid */}
      <div className="px-6 md:px-8 pb-6 md:pb-8">
        {/* Sales logic */}
        {logika && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
              Logika sprzedaży
            </p>
            <p className="text-text-muted leading-[1.8] text-[15px]">
              {logika.tresc}
            </p>
            {logika.kluczoweMechanizmy?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {logika.kluczoweMechanizmy.map((m, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 bg-beige-light text-text-muted rounded-pill"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Implied client */}
        {klient && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
              Marka rozumie klienta jako
            </p>
            <p className="text-text-muted leading-[1.8] text-[15px] mb-3">
              {klient.tosazmosc}
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-beige-light rounded-xl p-4">
                <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Co ważne</p>
                <p className="text-sm text-text-muted leading-relaxed">{klient.coWazne}</p>
              </div>
              {klient.ktoWykluczony && (
                <div className="bg-beige-light rounded-xl p-4">
                  <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Kto wykluczony</p>
                  <p className="text-sm text-text-muted leading-relaxed">{klient.ktoWykluczony}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Evidence */}
        {dowody.length > 0 && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
              Kluczowe dowody
            </p>
            <div className="space-y-3">
              {dowody.map((dowod, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-dk-teal mt-2 shrink-0" />
                  <div>
                    <p className="text-sm text-text-muted leading-relaxed">{dowod.obserwacja}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill uppercase tracking-wider">
                        {dowod.zrodlo}
                      </span>
                      <span className="text-xs text-text-gray italic">{dowod.znaczenie}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Post screenshots + website quotes side by side */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Screenshots */}
          {profile.samplePostScreenshots?.length > 0 && (
            <div>
              <p className="text-xs text-text-gray uppercase tracking-wider mb-3">Posty</p>
              <div className="grid grid-cols-2 gap-2">
                {profile.samplePostScreenshots.map((screenshot, i) => (
                  <div key={i} className="rounded-xl overflow-hidden bg-beige-light">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/${screenshot.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${screenshot}`}
                      alt={`Post ${i + 1} - ${profile.brandName}`}
                      className="w-full h-auto"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Website quotes */}
          {profile.sampleWebsiteQuotes?.length > 0 && (
            <div>
              <p className="text-xs text-text-gray uppercase tracking-wider mb-3">Cytaty ze strony</p>
              <div className="space-y-3">
                {profile.sampleWebsiteQuotes.map((quote, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-dk-teal/30 pl-4 text-sm text-text-secondary italic leading-relaxed"
                  >
                    {quote}
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
