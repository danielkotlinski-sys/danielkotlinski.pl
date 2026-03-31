'use client';

import { useEffect, useState, useRef } from 'react';
import type { ProgressEvent, ProgressStep, StepId } from '@/types/scanner';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'collect_websites', label: 'Pobrano strony WWW' },
  { id: 'collect_social', label: 'Zebrano posty social media' },
  { id: 'collect_external', label: 'Zebrano dyskurs zewnętrzny' },
  { id: 'analyze_atomic', label: 'Analizuję komunikację marek' },
  { id: 'synthesize_brands', label: 'Buduję profile marek' },
  { id: 'synthesize_category', label: 'Synteza konwencji kategorii' },
  { id: 'client_position', label: 'Pozycja Twojej marki' },
];

interface ProgressTrackerProps {
  scanRequestBody: string;
  category: string;
  brands: string[];
  email: string;
  onComplete: (scanId: string, report?: unknown) => void;
  onError: (error: string) => void;
}

export default function ProgressTracker({
  scanRequestBody,
  category,
  brands,
  email,
  onComplete,
  onError,
}: ProgressTrackerProps) {
  const [steps, setSteps] = useState<ProgressStep[]>(
    STEPS.map((s) => ({ ...s, status: 'pending' }))
  );
  const [progress, setProgress] = useState(0);
  const eventSourceRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    eventSourceRef.current = abortController;

    const runScan = async () => {
      try {
        const response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: scanRequestBody,
          signal: abortController.signal,
        });

        if (!response.ok) {
          const error = await response.json();
          onError(error.error || 'Wystąpił błąd');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          onError('Brak strumienia danych');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data);

              if (event.type === 'complete') {
                setProgress(100);
                onComplete(event.scanId, event.report);
                return;
              }

              if (event.type === 'error') {
                onError(event.error);
                return;
              }

              const progressEvent = event as ProgressEvent;
              setSteps((prev) =>
                prev.map((step) =>
                  step.id === progressEvent.stepId
                    ? { ...step, status: progressEvent.status, detail: progressEvent.detail }
                    : step
                )
              );

              if (progressEvent.progress) {
                setProgress(progressEvent.progress);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch {
        if (!abortController.signal.aborted) {
          onError('Połączenie przerwane');
        }
      }
    };

    runScan();
    return () => { abortController.abort(); };
  }, [scanRequestBody, onComplete, onError]);

  const maskedEmail = email.replace(/^(.{3})[^@]*(@.*)$/, '$1***$2');

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-card p-8 md:p-10 mb-6">
        <h2 className="font-heading text-3xl text-text-primary mb-2">
          Analizuję kategorię
        </h2>
        <p className="text-text-secondary">{category}</p>
        <p className="text-sm text-text-gray mt-1">
          Marki: {brands.join(', ')}
        </p>

        {/* Progress bar */}
        <div className="mt-8 mb-8">
          <div className="h-1.5 bg-beige rounded-full overflow-hidden">
            <div
              className="h-full bg-dk-teal rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-sm text-text-gray mt-2">{progress}%</p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3">
              <span className="w-6 h-6 flex items-center justify-center shrink-0">
                {step.status === 'done' && (
                  <span className="w-6 h-6 rounded-full bg-dk-teal/10 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-dk-teal">
                      <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
                {step.status === 'running' && (
                  <span className="inline-block w-4 h-4 border-2 border-dk-orange border-t-transparent rounded-full animate-spin" />
                )}
                {step.status === 'pending' && (
                  <span className="w-2 h-2 rounded-full bg-beige-dark" />
                )}
                {step.status === 'error' && (
                  <span className="text-dk-orange text-lg">&#10007;</span>
                )}
              </span>
              <span
                className={`text-sm ${
                  step.status === 'done'
                    ? 'text-text-primary'
                    : step.status === 'running'
                      ? 'text-text-primary font-medium'
                      : 'text-text-gray'
                }`}
              >
                {step.label}
                {step.detail && (
                  <span className="text-text-gray ml-1">({step.detail})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-sm text-text-gray space-y-1 text-center">
        <p>Szacowany czas: ok. 3-5 minut</p>
        <p>Raport zostanie też wysłany na: {maskedEmail}</p>
      </div>
    </div>
  );
}
