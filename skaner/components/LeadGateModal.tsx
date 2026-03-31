'use client';

import { useState } from 'react';
import type { LeadInfo } from '@/types/scanner';

interface LeadGateModalProps {
  onSubmit: (lead: LeadInfo) => void;
  onBack: () => void;
}

const inputStyles = "w-full px-4 py-3 bg-beige border border-beige-dark/50 rounded-card text-text-primary placeholder:text-text-gray focus:outline-none focus:border-dk-teal focus:ring-1 focus:ring-dk-teal/20 transition-colors";

export default function LeadGateModal({ onSubmit, onBack }: LeadGateModalProps) {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'Imię jest wymagane';
    if (!email.trim()) newErrors.email = 'Email jest wymagany';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Podaj poprawny adres email';
    }
    if (!gdprConsent) newErrors.gdpr = 'Zgoda jest wymagana';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({ firstName, email, company: company || undefined, gdprConsent });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card max-w-md w-full p-8 md:p-10 shadow-xl animate-in">
        <h2 className="font-heading text-3xl text-text-primary mb-2">
          Prawie gotowe.
        </h2>
        <p className="text-text-secondary mb-8 leading-relaxed">
          Analiza zajmie 3-5 minut. Wyślę Ci raport na email — zostanie też
          wyświetlony w przeglądarce.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Imię</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputStyles}
            />
            {errors.firstName && <p className="text-dk-orange text-sm mt-1.5">{errors.firstName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Email służbowy</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputStyles}
            />
            {errors.email && <p className="text-dk-orange text-sm mt-1.5">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Firma
              <span className="text-text-gray font-normal ml-1">(opcjonalnie)</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div className="pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={gdprConsent}
                onChange={(e) => setGdprConsent(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-beige-dark text-dk-teal focus:ring-dk-teal"
              />
              <span className="text-sm text-text-secondary leading-snug">
                Wyrażam zgodę na przetwarzanie danych osobowych w celu
                przesłania raportu i kontaktu w sprawie usług danielkotlinski.pl
              </span>
            </label>
            {errors.gdpr && <p className="text-dk-orange text-sm mt-1.5">{errors.gdpr}</p>}
          </div>

          <div className="pt-4 space-y-3">
            <button
              type="submit"
              className="w-full py-4 bg-dk-orange text-white rounded-pill font-medium text-lg hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
            >
              Uruchom analizę
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2 text-text-gray hover:text-text-muted text-sm transition-colors"
            >
              Wróć do formularza
            </button>
          </div>

          <p className="text-xs text-text-gray text-center pt-1">
            Nie wysyłam spamu. Jeden email z raportem, ewentualnie kontakt
            jeśli coś Cię zainteresuje.
          </p>
        </form>
      </div>
    </div>
  );
}
