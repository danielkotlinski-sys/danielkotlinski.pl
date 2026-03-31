'use client';

import { useState, useCallback } from 'react';
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
    async (scanId: string) => {
      try {
        const response = await fetch(`/api/scan/${scanId}/result`);
        if (response.ok) {
          const reportData = await response.json();
          setReport(reportData);
          setScreen('report');
          window.history.pushState(null, '', `/raport/${scanId}`);
        } else {
          setError('Nie udało się pobrać raportu');
        }
      } catch {
        setError('Nie udało się pobrać raportu');
      }
    },
    []
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  if (error) {
    return (
      <main className="min-h-screen py-16 px-6">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Wystąpił błąd
          </h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setScreen('input');
            }}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Spróbuj ponownie
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-16 px-6">
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
  );
}
