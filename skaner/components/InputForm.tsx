'use client';

import { useState, useEffect } from 'react';
import type { ScannerInput } from '@/types/scanner';

interface Competitor {
  name: string;
  url: string;
  socialHandle: string;
}

interface InputFormProps {
  onSubmit: (input: ScannerInput) => void;
}

const DEV_DEFAULTS = {
  brandName: 'Veoli Botanica',
  brandUrl: 'https://veolibotanica.pl',
  socialHandle: 'veoli_botanica',
  socialPlatform: 'instagram' as const,
  category: 'Polskie marki kosmetyków naturalnych sprzedające online, pozycjonujące się na naturalne składniki i świadomą pielęgnację',
  categoryType: 'b2c' as const,
  competitors: [
    { name: 'Resibo', url: 'https://resibo.pl', socialHandle: 'resibobynature' },
    { name: 'Mokosh', url: 'https://mokosh.pl', socialHandle: 'mokoshcosmetics' },
    { name: 'BasicLab', url: 'https://basiclab.pl', socialHandle: 'basiclabdermocosmetics' },
  ],
};

const inputStyles = "w-full px-4 py-3 bg-white border border-beige-dark/50 rounded-card text-text-primary placeholder:text-text-gray focus:outline-none focus:border-dk-teal focus:ring-1 focus:ring-dk-teal/20 transition-colors";
const labelStyles = "block text-sm font-medium text-text-muted mb-1.5";

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
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    if (window.location.hostname === 'localhost') setIsDev(true);
  }, []);

  const fillTestData = () => {
    setBrandName(DEV_DEFAULTS.brandName);
    setBrandUrl(DEV_DEFAULTS.brandUrl);
    setSocialHandle(DEV_DEFAULTS.socialHandle);
    setSocialPlatform(DEV_DEFAULTS.socialPlatform);
    setCategory(DEV_DEFAULTS.category);
    setCategoryType(DEV_DEFAULTS.categoryType);
    setCompetitors(DEV_DEFAULTS.competitors);
  };

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
      {/* Hero */}
      <div className="mb-12">
        <h1 className="font-heading text-4xl md:text-5xl text-text-primary mb-3 text-balance">
          Skaner Kategorii
        </h1>
        <p className="text-lg text-text-secondary leading-relaxed">
          Bezpłatna analiza konwencji komunikacyjnych w Twojej branży
        </p>
      </div>

      {/* Client brand */}
      <section className="bg-white rounded-card p-6 md:p-8 mb-6">
        <h2 className="font-heading text-2xl text-text-primary mb-6">
          Twoja marka
        </h2>
        <div className="space-y-5">
          <div>
            <label className={labelStyles}>Nazwa marki</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className={inputStyles}
              placeholder="np. Twoja Marka"
            />
            {errors.brandName && <p className="text-dk-orange text-sm mt-1.5">{errors.brandName}</p>}
          </div>
          <div>
            <label className={labelStyles}>Adres strony</label>
            <input
              type="url"
              value={brandUrl}
              onChange={(e) => setBrandUrl(e.target.value)}
              className={inputStyles}
              placeholder="https://twojastrona.pl"
            />
            {errors.brandUrl && <p className="text-dk-orange text-sm mt-1.5">{errors.brandUrl}</p>}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelStyles}>
                Social media
                <span className="text-text-gray font-normal ml-1">(opcjonalnie)</span>
              </label>
              <input
                type="text"
                value={socialHandle}
                onChange={(e) => setSocialHandle(e.target.value)}
                className={inputStyles}
                placeholder="@handle"
              />
            </div>
            <div className="w-40">
              <label className={labelStyles}>Platforma</label>
              <select
                value={socialPlatform}
                onChange={(e) => setSocialPlatform(e.target.value as typeof socialPlatform)}
                className={inputStyles + ' bg-white'}
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-text-gray">
            Bez social media analiza opiera się na stronie WWW i dyskursie zewnętrznym
          </p>
        </div>
      </section>

      {/* Category */}
      <section className="bg-white rounded-card p-6 md:p-8 mb-6">
        <h2 className="font-heading text-2xl text-text-primary mb-6">
          Kategoria
        </h2>
        <div className="space-y-5">
          <div>
            <label className={labelStyles}>Opisz kategorię w 1-2 zdaniach</label>
            <textarea
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              rows={3}
              className={inputStyles + ' resize-none'}
              placeholder="np. Agencje brandingowe pracujące z firmami technologicznymi w Polsce"
            />
            {errors.category && <p className="text-dk-orange text-sm mt-1.5">{errors.category}</p>}
          </div>
          <div>
            <label className={labelStyles}>Typ kategorii</label>
            <div className="flex gap-3 mt-1">
              {(['b2c', 'b2b'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCategoryType(type)}
                  className={`px-6 py-2.5 rounded-pill text-sm font-medium transition-all duration-300 ${
                    categoryType === type
                      ? 'bg-dk-teal text-white'
                      : 'bg-beige-light text-text-muted hover:bg-beige-dark/50'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Competitors */}
      <section className="bg-white rounded-card p-6 md:p-8 mb-8">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-heading text-2xl text-text-primary">
            Konkurenci
          </h2>
          <span className="text-sm text-text-gray">min. 2, maks. 4</span>
        </div>
        {errors.competitors && <p className="text-dk-orange text-sm mb-4">{errors.competitors}</p>}

        <div className="space-y-4">
          {competitors.map((competitor, index) => (
            <div key={index} className="flex gap-3 items-start">
              <span className="text-sm text-text-gray font-medium mt-3.5 w-5 shrink-0">
                {index + 1}.
              </span>
              <div className="flex-1 grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={competitor.name}
                  onChange={(e) => updateCompetitor(index, 'name', e.target.value)}
                  className={inputStyles}
                  placeholder="Nazwa"
                />
                <input
                  type="text"
                  value={competitor.url}
                  onChange={(e) => updateCompetitor(index, 'url', e.target.value)}
                  className={inputStyles}
                  placeholder="URL"
                />
                <input
                  type="text"
                  value={competitor.socialHandle}
                  onChange={(e) => updateCompetitor(index, 'socialHandle', e.target.value)}
                  className={inputStyles}
                  placeholder="@handle (opcja)"
                />
              </div>
              {competitors.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeCompetitor(index)}
                  className="mt-3 text-text-gray/50 hover:text-dk-orange transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {competitors.length < 4 && (
            <button
              type="button"
              onClick={addCompetitor}
              className="text-sm text-dk-teal hover:text-dk-teal-hover transition-colors ml-8"
            >
              + Dodaj kolejnego konkurenta
            </button>
          )}
        </div>
      </section>

      {/* Submit */}
      <div className="space-y-3">
        <button
          type="submit"
          className="w-full py-4 bg-dk-orange text-white rounded-pill font-medium text-lg hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
        >
          Uruchom Skan
        </button>
        {isDev && (
          <button
            type="button"
            onClick={fillTestData}
            className="w-full py-2.5 text-sm text-text-gray hover:text-text-muted border border-dashed border-beige-dark rounded-card transition-colors"
          >
            Wypełnij danymi testowymi (dev)
          </button>
        )}
      </div>
    </form>
  );
}
