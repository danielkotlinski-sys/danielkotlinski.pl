'use client';

import { useRef } from 'react';
import type { ScannerReport, BrandAdsData } from '@/types/scanner';

interface BrandProfileCardProps {
  profile: ScannerReport['brandProfiles'][number];
  brandAdsData?: BrandAdsData;
}

function HorizontalSlider({ children, itemCount }: { children: React.ReactNode; itemCount: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
      {itemCount > 2 && (
        <>
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center text-text-gray hover:text-text-primary transition-all opacity-0 group-hover:opacity-100"
            aria-label="Przewiń w lewo"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center text-text-gray hover:text-text-primary transition-all opacity-0 group-hover:opacity-100"
            aria-label="Przewiń w prawo"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </>
      )}
    </div>
  );
}

function imgSrc(base64: string) {
  return `data:image/${base64.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${base64}`;
}

export default function BrandProfileCard({ profile, brandAdsData }: BrandProfileCardProps) {
  const logika = profile.logikaSprzedazy;
  const klient = profile.implikowanyKlient;
  const dowody = profile.kluczoweDowody || [];
  const adsAnalysis = profile.adsAnalysis;
  const adsScreenshots = profile.adsScreenshots?.filter(Boolean) || [];
  const websitePages = profile.websitePages || [];
  const websiteAnalysis = profile.websiteAnalysis;
  const ads = brandAdsData?.ads || [];

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

        {/* Evidence with citations */}
        {dowody.length > 0 && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-3">
              Kluczowe dowody
            </p>
            <div className="space-y-4">
              {dowody.map((dowod, i) => (
                <div key={i} className="bg-beige-light/50 rounded-xl p-4">
                  <p className="text-sm text-text-muted leading-relaxed mb-1">{dowod.obserwacja}</p>
                  {dowod.cytat && (
                    <blockquote className="border-l-2 border-dk-teal/30 pl-3 text-sm text-text-secondary italic my-2">
                      {dowod.cytat}
                    </blockquote>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 bg-beige text-text-gray rounded-pill uppercase tracking-wider">
                      {dowod.zrodlo}
                    </span>
                    <span className="text-xs text-text-gray">{dowod.znaczenie}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Website screenshots + analysis */}
        {(websitePages.length > 0 || websiteAnalysis) && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-1">
              Strona internetowa
            </p>
            <p className="text-[11px] text-text-gray mb-4">
              Jak marka prezentuje się odwiedzającym stronę
            </p>

            {/* Website pages horizontal slider */}
            {websitePages.length > 0 && (
              <div className="mb-5">
                <HorizontalSlider itemCount={websitePages.length}>
                  {websitePages.map((page, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-72 md:w-80 snap-start rounded-xl overflow-hidden bg-beige-light border border-beige-dark/10"
                    >
                      <div className="relative">
                        {/* Page label */}
                        <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-medium text-text-secondary shadow-sm">
                          {i === 0 ? 'Strona główna' : (() => {
                            try { return new URL(page.url).pathname; } catch { return page.title || `Podstrona ${i}`; }
                          })()}
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgSrc(page.screenshotBase64)}
                          alt={`${profile.brandName} — ${page.title || page.url}`}
                          className="w-full h-auto"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ))}
                </HorizontalSlider>
              </div>
            )}

            {/* Website AI analysis */}
            {websiteAnalysis && (
              <div className="grid md:grid-cols-3 gap-3">
                <div className="bg-beige-light rounded-xl p-4">
                  <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Ton komunikacji</p>
                  <p className="text-sm text-text-muted leading-relaxed">{websiteAnalysis.toneOfVoice}</p>
                </div>
                <div className="bg-beige-light rounded-xl p-4">
                  <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Główny przekaz</p>
                  <p className="text-sm text-text-muted leading-relaxed">{websiteAnalysis.przekaz}</p>
                </div>
                <div className="bg-beige-light rounded-xl p-4">
                  <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Konwencja vs wyróżnienie</p>
                  <p className="text-sm text-text-muted leading-relaxed">{websiteAnalysis.wpisujeSeWKonwencje}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Social media posts — horizontal slider */}
        {profile.samplePostScreenshots?.length > 0 && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-1">
              Posty z social media
            </p>
            <p className="text-[11px] text-text-gray mb-4">
              Jak marka komunikuje się na co dzień
            </p>
            <HorizontalSlider itemCount={profile.samplePostScreenshots.length}>
              {profile.samplePostScreenshots.map((screenshot, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-48 md:w-56 snap-start rounded-xl overflow-hidden bg-beige-light border border-beige-dark/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc(screenshot)}
                    alt={`Post ${i + 1} - ${profile.brandName}`}
                    className="w-full h-auto"
                  />
                </div>
              ))}
            </HorizontalSlider>
          </div>
        )}

        {/* Ads analysis section — inside brand profile */}
        {(adsAnalysis || ads.length > 0) && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-1">
              Reklamy w Meta
            </p>
            <p className="text-[11px] text-text-gray mb-4">
              {adsAnalysis ? 'Analiza płatnej komunikacji vs organicznej' : `${ads.length} reklam w Meta Ad Library`}
            </p>

            {/* Ad screenshots/cards horizontal slider */}
            {ads.length > 0 ? (
              <div className="mb-5">
                <HorizontalSlider itemCount={ads.length}>
                  {ads.map((ad, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-56 md:w-64 snap-start rounded-xl overflow-hidden bg-beige-light border border-beige-dark/10"
                    >
                      {ad.imageBase64 && (
                        <div className="aspect-video bg-beige-light overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imgSrc(ad.imageBase64)}
                            alt={`Reklama ${i + 1} - ${profile.brandName}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="p-3">
                        {ad.linkTitle && (
                          <p className="font-medium text-xs text-text-primary mb-1 line-clamp-2">
                            {ad.linkTitle}
                          </p>
                        )}
                        {ad.bodyText && (
                          <p className="text-[11px] text-text-muted line-clamp-3 mb-2">
                            {ad.bodyText}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {ad.startDate && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-beige text-text-gray rounded-pill">
                              od {new Date(ad.startDate).toLocaleDateString('pl-PL')}
                            </span>
                          )}
                          {ad.spendRange && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-beige text-text-gray rounded-pill">
                              {ad.spendRange}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </HorizontalSlider>
              </div>
            ) : adsScreenshots.length > 0 ? (
              <div className="mb-5">
                <HorizontalSlider itemCount={adsScreenshots.length}>
                  {adsScreenshots.map((img, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-48 md:w-56 snap-start rounded-xl overflow-hidden bg-beige-light border border-beige-dark/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgSrc(img)}
                        alt={`Reklama ${i + 1} - ${profile.brandName}`}
                        className="w-full h-auto"
                      />
                    </div>
                  ))}
                </HorizontalSlider>
              </div>
            ) : null}

            {/* Ads AI analysis */}
            {adsAnalysis && (
              <>
                {/* Dominant message */}
                <p className="text-text-muted leading-[1.8] text-[15px] mb-4">
                  {adsAnalysis.dominujacyPrzekaz}
                </p>

                {/* Consistency assessment */}
                <div className="bg-beige-light rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs text-text-gray uppercase tracking-wider">Spójność paid vs organic</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-pill font-medium ${
                      adsAnalysis.spojnosc.ocena === 'spójna'
                        ? 'bg-green-100 text-green-700'
                        : adsAnalysis.spojnosc.ocena === 'częściowo rozbieżna'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {adsAnalysis.spojnosc.ocena}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed">
                    {adsAnalysis.spojnosc.opis}
                  </p>
                </div>

                {/* Hidden priorities */}
                {adsAnalysis.ukrytePriorytety && (
                  <div className="bg-beige-light/50 rounded-xl p-4 mb-4">
                    <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Ukryte priorytety sprzedażowe</p>
                    <p className="text-sm text-text-muted leading-relaxed">{adsAnalysis.ukrytePriorytety}</p>
                  </div>
                )}

                {/* Visual conventions in ads */}
                {adsAnalysis.konwencjeWizualneReklam && (
                  <div className="bg-beige-light/50 rounded-xl p-4">
                    <p className="text-xs text-text-gray uppercase tracking-wider mb-1.5">Konwencje wizualne reklam</p>
                    <p className="text-sm text-text-muted leading-relaxed">{adsAnalysis.konwencjeWizualneReklam}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Website quotes */}
        {profile.sampleWebsiteQuotes?.length > 0 && (
          <div className="mb-6 pb-6 border-b border-beige">
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

        {/* External sources */}
        {profile.zrodlaZewnetrzne && profile.zrodlaZewnetrzne.length > 0 && (
          <div className="mt-5 pt-5 border-t border-beige">
            <p className="text-xs text-text-gray uppercase tracking-wider mb-2">Źródła zewnętrzne</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {profile.zrodlaZewnetrzne.slice(0, 6).map((url, i) => {
                let domain = url;
                try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* keep raw */ }
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-dk-teal hover:text-dk-teal-hover transition-colors truncate max-w-[200px]"
                    title={url}
                  >
                    {domain}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
