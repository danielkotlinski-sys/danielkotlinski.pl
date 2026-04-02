'use client';

import { useRef } from 'react';
import type { ScannerReport } from '@/types/scanner';

interface BrandProfileCardProps {
  profile: ScannerReport['brandProfiles'][number];
}

function AdsSlider({ screenshots, brandName }: { screenshots: string[]; brandName: string }) {
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
        {screenshots.map((img, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-48 md:w-56 snap-start rounded-xl overflow-hidden bg-beige-light border border-beige-dark/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/${img.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${img}`}
              alt={`Reklama ${i + 1} - ${brandName}`}
              className="w-full h-auto"
            />
          </div>
        ))}
      </div>
      {screenshots.length > 3 && (
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

export default function BrandProfileCard({ profile }: BrandProfileCardProps) {
  const logika = profile.logikaSprzedazy;
  const klient = profile.implikowanyKlient;
  const dowody = profile.kluczoweDowody || [];
  const adsAnalysis = profile.adsAnalysis;
  const adsScreenshots = profile.adsScreenshots?.filter(Boolean) || [];

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

        {/* Ads analysis section — inside brand profile */}
        {adsAnalysis && (
          <div className="mb-6 pb-6 border-b border-beige">
            <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-1">
              Co mówią nam reklamy w Meta
            </p>
            <p className="text-[11px] text-text-gray mb-4">
              Analiza płatnej komunikacji vs organicznej
            </p>

            {/* Horizontal ad screenshots slider */}
            {adsScreenshots.length > 0 && (
              <div className="mb-5">
                <AdsSlider screenshots={adsScreenshots} brandName={profile.brandName} />
              </div>
            )}

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
