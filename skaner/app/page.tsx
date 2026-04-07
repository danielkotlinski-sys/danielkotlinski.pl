'use client';

import { useState, useCallback, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import AuthGate from '@/components/AuthGate';
import InputForm from '@/components/InputForm';
import ProgressTracker from '@/components/ProgressTracker';
import ReportContainer from '@/components/report/ReportContainer';
import ReportDisclaimer from '@/components/report/ReportDisclaimer';
import type { ScannerInput, ScannerReport } from '@/types/scanner';

type Screen = 'loading' | 'auth' | 'input' | 'progress' | 'report';

interface AuthUser {
  email: string;
  firstName: string;
  company?: string;
  role?: 'owner' | 'member';
  orgId?: string;
}

export default function SkanerPage() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scansRemaining, setScansRemaining] = useState(0);
  const [scannerInput, setScannerInput] = useState<ScannerInput | null>(null);
  const [scanRequestBody, setScanRequestBody] = useState('');
  const [report, setReport] = useState<ScannerReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check session on mount
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user.approved) {
          setUser(data.user);
          setScansRemaining(data.scansRemaining ?? 0);
          setScreen('input');
        } else {
          setScreen('auth');
        }
      })
      .catch(() => setScreen('auth'));
  }, []);

  const handleAuthenticated = (authedUser: AuthUser, remaining: number) => {
    setUser(authedUser);
    setScansRemaining(remaining);
    setScreen('input');
  };

  const handleInputSubmit = (input: ScannerInput) => {
    if (scansRemaining <= 0) {
      setError('Wykorzystałeś limit 3 skanów w tym miesiącu. Limit odnawia się z początkiem kolejnego miesiąca.');
      return;
    }
    setScannerInput(input);
    // Build scan request with user data as lead (for pipeline compatibility)
    const body = {
      input,
      lead: {
        firstName: user!.firstName,
        email: user!.email,
        company: user?.company,
        gdprConsent: true,
      },
    };
    setScanRequestBody(JSON.stringify(body));
    setScreen('progress');
  };

  const handleComplete = useCallback(
    (completedScanId: string, reportFromStream?: unknown) => {
      setScansRemaining((prev) => Math.max(0, prev - 1));
      if (reportFromStream) {
        setReport(reportFromStream as ScannerReport);
        setScreen('report');
        window.history.pushState(null, '', `/raport/${completedScanId}`);
      } else {
        fetch(`/api/scan/${completedScanId}/result`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((data) => {
            setReport(data);
            setScreen('report');
            window.history.pushState(null, '', `/raport/${completedScanId}`);
          })
          .catch(() => setError('Nie udało się pobrać raportu'));
      }
    },
    []
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setScreen('auth');
  };

  if (screen === 'loading') {
    return (
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="flex justify-center">
            <span className="inline-block w-6 h-6 border-2 border-dk-teal border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      </>
    );
  }

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
        {screen === 'auth' && <AuthGate onAuthenticated={handleAuthenticated} />}

        {screen === 'input' && user && (
          <div>
            {/* User bar */}
            <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-muted">
                  {user.firstName}{user.company ? ` · ${user.company}` : ''}
                </span>
                <span className="text-xs px-2.5 py-0.5 bg-dk-teal/10 text-dk-teal rounded-pill font-medium">
                  Pozostało skanów: {scansRemaining} z 3
                </span>
              </div>
              <div className="flex items-center gap-2">
                {user.orgId && (
                  <a
                    href="/zespol"
                    className="text-xs px-4 py-1.5 bg-dk-teal text-white rounded-pill font-medium hover:bg-dk-teal-hover transition-all"
                  >
                    Zespół
                  </a>
                )}
                <button
                  onClick={handleLogout}
                  className="text-xs px-4 py-1.5 bg-white border border-beige-dark/30 text-text-muted rounded-pill font-medium hover:text-text-primary hover:border-beige-dark/50 transition-all"
                >
                  Wyloguj
                </button>
              </div>
            </div>
            <InputForm onSubmit={handleInputSubmit} />
          </div>
        )}

        {screen === 'progress' && scannerInput && user && (
          <ProgressTracker
            scanRequestBody={scanRequestBody}
            category={scannerInput.category}
            brands={[
              scannerInput.clientBrand.name,
              ...scannerInput.competitors.map((c) => c.name),
            ]}
            email={user.email}
            onComplete={handleComplete}
            onError={handleError}
          />
        )}

        {screen === 'report' && report && (
          <ReportDisclaimer>
            <ReportContainer report={report} firstName={user?.firstName} />
          </ReportDisclaimer>
        )}
      </main>
    </>
  );
}
