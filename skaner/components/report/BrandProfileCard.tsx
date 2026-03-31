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
    <div className="border border-gray-200 rounded-xl p-6 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <h3 className="text-xl font-semibold text-gray-900">
          {profile.brandName}
        </h3>
        {profile.isClient && (
          <span className="text-xs px-2 py-0.5 bg-gray-900 text-white rounded-full">
            Twoja marka
          </span>
        )}
      </div>

      {/* Logika sprzedaży */}
      {logika && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            Logika sprzedaży
          </h4>
          <p className="text-gray-700 leading-relaxed">
            {logika.tresc}
          </p>
          {logika.kluczoweMechanizmy?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {logika.kluczoweMechanizmy.map((m, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Implikowany klient */}
      {klient && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            Implikowany klient
          </h4>
          <p className="text-gray-700 leading-relaxed mb-2">
            {klient.tosazmosc}
          </p>
          <p className="text-gray-600 text-sm">
            <span className="font-medium">Co ważne:</span>{' '}
            {klient.coWazne}
          </p>
        </div>
      )}

      {/* Kto wykluczony */}
      {klient?.ktoWykluczony && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            Kto wykluczony
          </h4>
          <p className="text-gray-600 text-sm">
            {klient.ktoWykluczony}
          </p>
        </div>
      )}

      {/* Kluczowe dowody */}
      {dowody.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Kluczowe dowody
          </h4>
          <div className="space-y-3">
            {dowody.map((dowod, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-1">{dowod.obserwacja}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">
                    {dowod.zrodlo}
                  </span>
                  <span className="text-xs text-gray-400">{dowod.znaczenie}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample post screenshots */}
      {profile.samplePostScreenshots?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Przykładowe posty
          </h4>
          <div className="flex gap-3">
            {profile.samplePostScreenshots.map((screenshot, i) => (
              <div key={i} className="w-1/2 rounded-lg overflow-hidden border border-gray-100">
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
      {profile.sampleWebsiteQuotes.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            Cytaty ze strony
          </h4>
          {profile.sampleWebsiteQuotes.map((quote, i) => (
            <blockquote
              key={i}
              className="border-l-2 border-gray-200 pl-3 text-sm text-gray-500 italic mb-2"
            >
              {quote}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}
