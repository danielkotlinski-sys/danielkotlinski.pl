'use client';

import { useState } from 'react';
import type { ScannerInput } from '@/types/scanner';

interface Competitor {
  name: string;
  url: string;
  socialHandle: string;
}

interface InputFormProps {
  onSubmit: (input: ScannerInput) => void;
}

export default function InputForm({ onSubmit }: InputFormProps) {
  const [brandName, setBrandName] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [socialPlatform, setSocialPlatform] = useState<'instagram' | 'facebook' | 'linkedin'>('instagram');
  const [category, setCategory] = useState('');
  const [categoryType, setCategoryType] = useState<'b2c' | 'b2b'>('b2c');
  const [competitors, setCompetitors] = useState<Competitor[]>([
    { name: '', url: '', socialHandle: '' },
    { name: '', url: '', socialHandle: '' },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addCompetitor = () => {
    if (competitors.length < 4) {
      setCompetitors([...competitors, { name: '', url: '', socialHandle: '' }]);
    }
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length > 2) {
      setCompetitors(competitors.filter((_, i) => i !== index));
    }
  };

  const updateCompetitor = (index: number, field: keyof Competitor, value: string) => {
    const updated = [...competitors];
    updated[index] = { ...updated[index], [field]: value };
    setCompetitors(updated);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!brandName.trim()) newErrors.brandName = 'Nazwa marki jest wymagana';
    if (!brandUrl.trim()) newErrors.brandUrl = 'URL strony jest wymagany';
    if (category.length < 20) newErrors.category = 'Opis kategorii musi mieć min. 20 znaków';

    const validCompetitors = competitors.filter((c) => c.name.trim() && c.url.trim());
    if (validCompetitors.length < 2) {
      newErrors.competitors = 'Minimum 2 konkurentów z nazwą i URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const validCompetitors = competitors.filter((c) => c.name.trim() && c.url.trim());

    onSubmit({
      clientBrand: {
        name: brandName,
        url: brandUrl,
        socialHandle: socialHandle.replace('@', ''),
        socialPlatform,
      },
      category,
      categoryType,
      competitors: validCompetitors.map((c) => ({
        name: c.name,
        url: c.url,
        socialHandle: c.socialHandle.replace('@', ''),
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          Skaner Kategorii
        </h1>
        <p className="text-lg text-gray-500">
          Bezpłatna analiza konwencji komunikacyjnych w Twojej branży
        </p>
      </div>

      {/* Client brand */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Twoja marka
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa marki
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="np. Twoja Marka"
            />
            {errors.brandName && (
              <p className="text-red-500 text-sm mt-1">{errors.brandName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adres strony
            </label>
            <input
              type="url"
              value={brandUrl}
              onChange={(e) => setBrandUrl(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="https://twojastrona.pl"
            />
            {errors.brandUrl && (
              <p className="text-red-500 text-sm mt-1">{errors.brandUrl}</p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Social media
                <span className="text-gray-400 font-normal ml-1">(opcjonalnie)</span>
              </label>
              <input
                type="text"
                value={socialHandle}
                onChange={(e) => setSocialHandle(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="@handle"
              />
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platforma
              </label>
              <select
                value={socialPlatform}
                onChange={(e) => setSocialPlatform(e.target.value as typeof socialPlatform)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Social media to opcja — bez nich analiza opiera się na stronie WWW i dyskursie zewnętrznym
          </p>
        </div>
      </section>

      {/* Category */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Kategoria
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opisz kategorię w 1-2 zdaniach
            </label>
            <textarea
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
              placeholder="np. Agencje brandingowe pracujące z firmami technologicznymi w Polsce"
            />
            {errors.category && (
              <p className="text-red-500 text-sm mt-1">{errors.category}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Typ kategorii
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setCategoryType('b2c')}
                className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  categoryType === 'b2c'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                B2C
              </button>
              <button
                type="button"
                onClick={() => setCategoryType('b2b')}
                className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  categoryType === 'b2b'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                B2B
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Competitors */}
      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Konkurenci
          <span className="text-gray-300 font-normal ml-2">minimum 2, maksimum 4</span>
        </h2>
        {errors.competitors && (
          <p className="text-red-500 text-sm mb-3">{errors.competitors}</p>
        )}

        <div className="space-y-4">
          {competitors.map((competitor, index) => (
            <div key={index} className="flex gap-3 items-start">
              <span className="text-sm text-gray-300 font-medium mt-3 w-5">
                {index + 1}.
              </span>
              <div className="flex-1 grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={competitor.name}
                  onChange={(e) => updateCompetitor(index, 'name', e.target.value)}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Nazwa"
                />
                <input
                  type="text"
                  value={competitor.url}
                  onChange={(e) => updateCompetitor(index, 'url', e.target.value)}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="URL"
                />
                <input
                  type="text"
                  value={competitor.socialHandle}
                  onChange={(e) => updateCompetitor(index, 'socialHandle', e.target.value)}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="@handle (opcja)"
                />
              </div>
              {competitors.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeCompetitor(index)}
                  className="mt-2.5 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {competitors.length < 4 && (
            <button
              type="button"
              onClick={addCompetitor}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors ml-8"
            >
              + Dodaj kolejnego konkurenta
            </button>
          )}
        </div>
      </section>

      {/* Submit */}
      <button
        type="submit"
        className="w-full py-3.5 bg-gray-900 text-white rounded-lg font-medium text-lg hover:bg-gray-800 transition-colors"
      >
        Uruchom Skan
      </button>
    </form>
  );
}
