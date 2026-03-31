'use client';

import { useState, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import InputForm from '@/components/InputForm';
import LeadGateModal from '@/components/LeadGateModal';
import ProgressTracker from '@/components/ProgressTracker';
import ReportContainer from '@/components/report/ReportContainer';
import type { ScannerInput, LeadInfo, ScannerReport, ScanRequest } from '@/types/scanner';

type Screen = 'input' | 'gate' | 'progress' | 'report';

export default function SkanerPage() {
  const [screen, setScreen] = useState<Screen>('input');
  const [scannerInput, setScannerInput] = useState<ScannerInput | null>(null);
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [scanRequestBody, setScanRequestBody] = useState('');
  const [report, setReport] = useState<ScannerReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInputSubmit = (input: ScannerInput) => {
    setScannerInput(input);
    setScreen('gate');
  };

  const handleLeadSubmit = (lead: LeadInfo) => {
    setLeadInfo(lead);
    const body: ScanRequest = { input: scannerInput!, lead };
    setScanRequestBody(JSON.stringify(body));
    setScreen('progress');
  };

  const handleComplete = useCallback(
    (scanId: string, reportFromStream?: unknown) => {
      if (reportFromStream) {
        setReport(reportFromStream as ScannerReport);
        setScreen('report');
        window.history.pushState(null, '', `/raport/${scanId}`);
      } else {
        fetch(`/api/scan/${scanId}/result`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((data) => {
            setReport(data);
            setScreen('report');
            window.history.pushState(null, '', `/raport/${scanId}`);
          })
          .catch(() => setError('Nie udało się pobrać raportu'));
      }
    },
    []
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  if (error) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="font-heading text-3xl text-text-primary mb-4">
              Wystąpił błąd
            </h2>
            <p className="text-text-secondary mb-8">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setScreen('input');
              }}
              className="px-8 py-3 bg-dk-orange text-white rounded-pill font-medium hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
            >
              Spróbuj ponownie
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className={`min-h-screen ${screen === 'report' ? 'py-12' : 'py-24'} px-6`}>
        {screen === 'input' && <InputForm onSubmit={handleInputSubmit} />}

        {screen === 'gate' && (
          <LeadGateModal
            onSubmit={handleLeadSubmit}
            onBack={() => setScreen('input')}
          />
        )}

        {screen === 'progress' && scannerInput && leadInfo && (
          <ProgressTracker
            scanRequestBody={scanRequestBody}
            category={scannerInput.category}
            brands={[
              scannerInput.clientBrand.name,
              ...scannerInput.competitors.map((c) => c.name),
            ]}
            email={leadInfo.email}
            onComplete={handleComplete}
            onError={handleError}
          />
        )}

        {screen === 'report' && report && (
          <ReportContainer report={report} firstName={leadInfo?.firstName} />
        )}
      </main>
    </>
  );
}
