'use client';

import { useState } from 'react';
import type { LeadInfo } from '@/types/scanner';

interface LeadGateModalProps {
  onSubmit: (lead: LeadInfo) => void;
  onBack: () => void;
}

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-xl">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Prawie gotowe.
        </h2>
        <p className="text-gray-500 mb-8">
          Analiza zajmie 3-5 minut. Wyślę Ci raport na email — zostanie też
          wyświetlony w przeglądarce.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Imię
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            {errors.firstName && (
              <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email służbowy
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Firma
              <span className="text-gray-400 font-normal ml-1">(opcjonalnie)</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={gdprConsent}
                onChange={(e) => setGdprConsent(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span className="text-sm text-gray-500 leading-snug">
                Wyrażam zgodę na przetwarzanie danych osobowych w celu
                przesłania raportu i kontaktu w sprawie usług
                danielkotlinski.pl
              </span>
            </label>
            {errors.gdpr && (
              <p className="text-red-500 text-sm mt-1">{errors.gdpr}</p>
            )}
          </div>

          <div className="pt-4 space-y-3">
            <button
              type="submit"
              className="w-full py-3.5 bg-gray-900 text-white rounded-lg font-medium text-lg hover:bg-gray-800 transition-colors"
            >
              Uruchom analizę
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              Wróć do formularza
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center pt-2">
            Nie wysyłam spamu. Jeden email z raportem, ewentualnie kontakt
            jeśli coś Cię zainteresuje.
          </p>
        </form>
      </div>
    </div>
  );
}
