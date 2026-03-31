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
  onComplete: (scanId: string) => void;
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
                onComplete(event.scanId);
                return;
              }

              if (event.type === 'error') {
                onError(event.error);
                return;
              }

              // Progress event
              const progressEvent = event as ProgressEvent;
              setSteps((prev) =>
                prev.map((step) =>
                  step.id === progressEvent.stepId
                    ? {
                        ...step,
                        status: progressEvent.status,
                        detail: progressEvent.detail,
                      }
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

    return () => {
      abortController.abort();
    };
  }, [scanRequestBody, onComplete, onError]);

  const maskedEmail = email.replace(
    /^(.{3})[^@]*(@.*)$/,
    '$1***$2'
  );

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">
          Analizuję kategorię
        </h2>
        <p className="text-gray-500">{category}</p>
        <p className="text-sm text-gray-400 mt-1">
          Marki: {brands.join(', ')}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-right text-sm text-gray-400 mt-2">{progress}%</p>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-8">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <span className="w-5 text-center">
              {step.status === 'done' && (
                <span className="text-green-500">&#10003;</span>
              )}
              {step.status === 'running' && (
                <span className="inline-block w-3 h-3 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              )}
              {step.status === 'pending' && (
                <span className="text-gray-300">&#9675;</span>
              )}
              {step.status === 'error' && (
                <span className="text-red-500">&#10007;</span>
              )}
            </span>
            <span
              className={`text-sm ${
                step.status === 'done'
                  ? 'text-gray-900'
                  : step.status === 'running'
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-400'
              }`}
            >
              {step.label}
              {step.detail && (
                <span className="text-gray-400 ml-1">({step.detail})</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="text-sm text-gray-400 space-y-1">
        <p>Szacowany czas: ok. 3-5 minut</p>
        <p>Raport zostanie też wysłany na: {maskedEmail}</p>
      </div>
    </div>
  );
}
