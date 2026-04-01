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
  categoryPurpose: 'Klient szuka skutecznej pielęgnacji opartej na naturalnych składnikach — chce czuć że robi coś dobrego dla siebie i świadomie wybiera.',
  categoryType: 'b2c' as const,
  clientDescription: '',
  competitors: [
    { name: 'Resibo', url: 'https://resibo.pl', socialHandle: 'resibobynature' },
    { name: 'Mokosh', url: 'https://mokosh.pl', socialHandle: 'mokoshcosmetics' },
    { name: 'BasicLab', url: 'https://basiclab.pl', socialHandle: 'basiclabdermocosmetics' },
  ],
};

const inputStyles = "w-full px-4 py-3 bg-white border border-beige-dark/50 rounded-card text-text-primary placeholder:text-text-gray focus:outline-none focus:border-dk-teal focus:ring-1 focus:ring-dk-teal/20 transition-colors";
const labelStyles = "block text-sm font-medium text-text-muted mb-1.5";

function normalizeHandle(raw: string): string {
  let val = raw.trim();
  // Strip full URLs: https://instagram.com/handle, linkedin.com/company/handle, etc.
  val = val.replace(/^https?:\/\/(www\.)?/i, '');
  val = val.replace(/^(instagram\.com|facebook\.com|linkedin\.com)\/(company\/|in\/)?/i, '');
  // Strip leading @ and trailing /
  val = val.replace(/^@/, '').replace(/\/+$/, '');
  // If there's still a slash (e.g. leftover path), take the last segment
  if (val.includes('/')) {
    const parts = val.split('/').filter(Boolean);
    val = parts[parts.length - 1] || val;
  }
  return val;
}

function normalizeUrl(raw: string): string {
  let val = raw.trim();
  if (!val) return val;
  // Add https:// if missing protocol
  if (!/^https?:\/\//i.test(val)) {
    val = 'https://' + val;
  }
  return val;
}

export default function InputForm({ onSubmit }: InputFormProps) {
  const [brandName, setBrandName] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [socialPlatform, setSocialPlatform] = useState<'instagram' | 'facebook' | 'linkedin'>('instagram');
  const [category, setCategory] = useState('');
  const [categoryPurpose, setCategoryPurpose] = useState('');
  const [categoryType, setCategoryType] = useState<'b2c' | 'b2b'>('b2c');
  const [clientDescription, setClientDescription] = useState('');
  const [competitors, setCompetitors] = useState<Competitor[]>([
    { name: '', url: '', socialHandle: '' },
    { name: '', url: '', socialHandle: '' },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDev, setIsDev] = useState(false);

  // JTBD suggestion state
  const [jtbdLoading, setJtbdLoading] = useState(false);

  // Competitor suggestion state
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [competitorsSuggested, setCompetitorsSuggested] = useState(false);
  const [competitorsSuggestFailed, setCompetitorsSuggestFailed] = useState(false);

  useEffect(() => {
    if (window.location.hostname === 'localhost') setIsDev(true);

    // Restore form data from sessionStorage
    try {
      const saved = sessionStorage.getItem('skaner_form');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.brandName) setBrandName(d.brandName);
        if (d.brandUrl) setBrandUrl(d.brandUrl);
        if (d.socialHandle) setSocialHandle(d.socialHandle);
        if (d.socialPlatform) setSocialPlatform(d.socialPlatform);
        if (d.category) setCategory(d.category);
        if (d.categoryPurpose) setCategoryPurpose(d.categoryPurpose);
        if (d.categoryType) setCategoryType(d.categoryType);
        if (d.clientDescription) setClientDescription(d.clientDescription);
        if (d.competitors?.length) setCompetitors(d.competitors);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist form data to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem('skaner_form', JSON.stringify({
        brandName, brandUrl, socialHandle, socialPlatform,
        category, categoryPurpose, categoryType, clientDescription, competitors,
      }));
    } catch { /* ignore */ }
  }, [brandName, brandUrl, socialHandle, socialPlatform, category, categoryPurpose, categoryType, clientDescription, competitors]);

  const fillTestData = () => {
    setBrandName(DEV_DEFAULTS.brandName);
    setBrandUrl(DEV_DEFAULTS.brandUrl);
    setSocialHandle(DEV_DEFAULTS.socialHandle);
    setSocialPlatform(DEV_DEFAULTS.socialPlatform);
    setCategory(DEV_DEFAULTS.category);
    setCategoryPurpose(DEV_DEFAULTS.categoryPurpose);
    setCategoryType(DEV_DEFAULTS.categoryType);
    setClientDescription(DEV_DEFAULTS.clientDescription);
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

  const requestCompetitors = async () => {
    if (!brandName.trim() || !category || category.length < 20) return;
    setCompetitorsLoading(true);
    try {
      const response = await fetch('/api/scan/suggest-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: brandName.trim(),
          brandUrl: normalizeUrl(brandUrl),
          category,
          categoryType,
          socialPlatform,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        console.log('[suggest] API response:', JSON.stringify(data));
        const suggested = (data.competitors || []) as Competitor[];
        if (suggested.length > 0) {
          // Fill in competitor slots, padding to at least 2
          while (suggested.length < 2) suggested.push({ name: '', url: '', socialHandle: '' });
          setCompetitors(suggested);
          setCompetitorsSuggested(true);
        } else {
          setCompetitorsSuggestFailed(true);
        }
      } else {
        setCompetitorsSuggestFailed(true);
      }
    } catch {
      setCompetitorsSuggestFailed(true);
    } finally {
      setCompetitorsLoading(false);
    }
  };

  const suggestCategoryPurpose = async () => {
    if (!category || category.length < 20) return;
    setJtbdLoading(true);
    try {
      const response = await fetch('/api/scan/suggest-jtbd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, categoryType, brandName }),
      });
      if (response.ok) {
        const data = await response.json();
        const jobs: string[] = data.jobs || [];
        if (jobs.length > 0) {
          setCategoryPurpose(jobs.join('. '));
        }
      }
    } catch {
      // silently fail
    } finally {
      setJtbdLoading(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!brandName.trim()) newErrors.brandName = 'Nazwa marki jest wymagana';
    if (!brandUrl.trim()) newErrors.brandUrl = 'URL strony jest wymagany';
    if (category.length < 20) newErrors.category = 'Opis kategorii musi mieć min. 20 znaków';
    if (!categoryPurpose.trim()) newErrors.categoryPurpose = 'Opisz po co klient przychodzi do tej kategorii';
    const validCompetitors = competitors.filter((c) => c.name.trim() && c.url.trim());
    if (validCompetitors.length < 2) {
      newErrors.competitors = 'Minimum 2 konkurentów z nazwą i URL';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll to first error
      setTimeout(() => {
        const firstError = document.querySelector('.text-dk-orange');
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    const validCompetitors = competitors.filter((c) => c.name.trim() && c.url.trim());

    onSubmit({
      clientBrand: {
        name: brandName.trim(),
        url: normalizeUrl(brandUrl),
        socialHandle: normalizeHandle(socialHandle),
        socialPlatform,
      },
      category,
      categoryPurpose,
      categoryType,
      clientDescription: clientDescription.trim() || undefined,
      competitors: validCompetitors.map((c) => ({
        name: c.name.trim(),
        url: normalizeUrl(c.url),
        socialHandle: normalizeHandle(c.socialHandle),
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
              type="text"
              value={brandUrl}
              onChange={(e) => setBrandUrl(e.target.value)}
              onBlur={(e) => setBrandUrl(normalizeUrl(e.target.value))}
              className={inputStyles}
              placeholder="twojastrona.pl"
            />
            {errors.brandUrl && <p className="text-dk-orange text-sm mt-1.5">{errors.brandUrl}</p>}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelStyles}>
                Profil w social media
                <span className="text-text-gray font-normal ml-1">(opcjonalnie)</span>
              </label>
              <input
                type="text"
                value={socialHandle}
                onChange={(e) => setSocialHandle(e.target.value)}
                onBlur={(e) => setSocialHandle(normalizeHandle(e.target.value))}
                className={inputStyles}
                placeholder="nazwa profilu lub link"
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
            Wklej link do profilu lub wpisz samą nazwę — format nie ma znaczenia, ogarniemy.
            Bez social media analiza opiera się na stronie WWW i dyskursie zewnętrznym.
          </p>
        </div>
      </section>

      {/* Your client — optional */}
      <section className="bg-white rounded-card p-6 md:p-8 mb-6">
        <h2 className="font-heading text-2xl text-text-primary mb-2">
          Twój klient
        </h2>
        <p className="text-sm text-text-gray mb-5">
          Opcjonalne — ale pozwala porównać kogo opisujesz z kim naprawdę mówi Twoja komunikacja.
        </p>
        <div>
          <label className={labelStyles}>
            Kim jest Twój klient? Opisz w 1-2 zdaniach.
          </label>
          <textarea
            value={clientDescription}
            onChange={(e) => setClientDescription(e.target.value)}
            rows={2}
            className={inputStyles + ' resize-none'}
            placeholder="np. Właściciele małych firm technologicznych którzy szukają rebrandingu po pierwszej rundzie finansowania"
          />
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
              placeholder="np. Teatry dramatyczne w Warszawie z własnym zespołem aktorskim"
            />
            {errors.category && <p className="text-dk-orange text-sm mt-1.5">{errors.category}</p>}
          </div>

          <div>
            <label className={labelStyles}>Po co klient przychodzi do tej kategorii?</label>
            <textarea
              value={categoryPurpose}
              onChange={(e) => setCategoryPurpose(e.target.value)}
              rows={2}
              className={inputStyles + ' resize-none'}
              placeholder="np. Szuka intensywnego przeżycia — chce zobaczyć coś co poruszy, da do myślenia, wyrwie z codzienności"
            />
            {errors.categoryPurpose && <p className="text-dk-orange text-sm mt-1.5">{errors.categoryPurpose}</p>}
            <div className="flex items-center gap-3 mt-1.5">
              <p className="text-xs text-text-gray">Nie &ldquo;co kupują&rdquo; ale &ldquo;po co przychodzą&rdquo;.</p>
              {category.length >= 20 && !jtbdLoading && (
                <button
                  type="button"
                  onClick={suggestCategoryPurpose}
                  className="text-xs text-dk-teal hover:text-dk-teal/80 transition-colors whitespace-nowrap flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 6h3m2 0h3M6 2v3m0 2v3" strokeLinecap="round"/>
                  </svg>
                  Zasugeruj
                </button>
              )}
              {jtbdLoading && (
                <span className="flex items-center gap-1.5 text-xs text-text-gray">
                  <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-dk-teal border-t-transparent rounded-full animate-spin" />
                  Myślę...
                </span>
              )}
            </div>
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
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-heading text-2xl text-text-primary">Konkurenci</h2>
          <span className="text-sm text-text-gray">min. 2, maks. 4</span>
        </div>
        <p className="text-sm text-text-gray mb-5">
          Podaj ręcznie lub pozwól AI zasugerować na podstawie Twojej marki i kategorii.
        </p>

        {/* Suggest competitors button */}
        {!competitorsSuggested && !competitorsLoading && brandName.trim() && category.length >= 20 && (
          <button
            type="button"
            onClick={requestCompetitors}
            className="mb-5 w-full py-3 text-sm font-medium text-dk-teal border border-dk-teal/30 rounded-card hover:bg-dk-teal/5 transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
            </svg>
            Zasugeruj konkurentów
          </button>
        )}

        {competitorsLoading && (
          <div className="mb-5 flex items-center justify-center gap-2 py-3 text-sm text-text-gray">
            <span className="inline-block w-3 h-3 border-2 border-dk-teal border-t-transparent rounded-full animate-spin" />
            Szukam konkurentów...
          </div>
        )}

        {competitorsSuggested && (
          <div className="mb-5 flex items-center gap-2 text-xs text-dk-teal">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 7.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Uzupełnione — możesz dowolnie zmienić lub dodać kolejnych
          </div>
        )}

        {competitorsSuggestFailed && (
          <div className="mb-5 flex items-center gap-2 text-xs text-dk-orange">
            Nie udało się znaleźć konkurentów — wpisz ręcznie
          </div>
        )}

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
                  placeholder="Nazwa marki"
                />
                <input
                  type="text"
                  value={competitor.url}
                  onChange={(e) => updateCompetitor(index, 'url', e.target.value)}
                  onBlur={(e) => updateCompetitor(index, 'url', normalizeUrl(e.target.value))}
                  className={inputStyles}
                  placeholder="strona.pl"
                />
                <input
                  type="text"
                  value={competitor.socialHandle}
                  onChange={(e) => updateCompetitor(index, 'socialHandle', e.target.value)}
                  onBlur={(e) => updateCompetitor(index, 'socialHandle', normalizeHandle(e.target.value))}
                  className={inputStyles}
                  placeholder="profil (opcja)"
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
