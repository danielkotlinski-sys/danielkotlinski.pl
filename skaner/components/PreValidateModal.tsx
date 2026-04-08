'use client';

import { useMemo } from 'react';
import type {
  PreValidateResult,
  ValidationFinding,
  ValidationSeverity,
} from '@/types/scanner';

interface PreValidateModalProps {
  /** null = loading state, PreValidateResult = wyniki walidacji */
  result: PreValidateResult | null;
  /** true gdy pre-validate jeszcze trwa */
  validating: boolean;
  /** Zastosuj pojedynczą sugestię — podmienia pole w formularzu */
  onApply: (finding: ValidationFinding) => void;
  /** Zastosuj wszystkie sugestie z listy na raz */
  onApplyAll: (findings: ValidationFinding[]) => void;
  /** Mimo ostrzeżeń — uruchom skan */
  onProceed: () => void;
  /** Zamknij modal i wróć do edycji */
  onCancel: () => void;
}

const severityConfig: Record<ValidationSeverity, {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
  icon: string;
}> = {
  error: {
    label: 'Błąd',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-l-4 border-l-red-500 border-red-200',
    dot: 'bg-red-500',
    icon: '!',
  },
  warning: {
    label: 'Ostrzeżenie',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-l-4 border-l-amber-500 border-amber-200',
    dot: 'bg-amber-500',
    icon: '!',
  },
  info: {
    label: 'Info',
    color: 'text-dk-teal',
    bg: 'bg-dk-teal/5',
    border: 'border-l-4 border-l-dk-teal border-dk-teal/20',
    dot: 'bg-dk-teal',
    icon: 'i',
  },
};

/** Readable summary of finding counts for the modal header. */
function buildSummary(findings: ValidationFinding[]): string {
  const counts = {
    error: findings.filter((f) => f.severity === 'error').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
  const parts: string[] = [];
  if (counts.error > 0) parts.push(`${counts.error} ${counts.error === 1 ? 'błąd' : 'błędy'}`);
  if (counts.warning > 0) parts.push(`${counts.warning} ${counts.warning === 1 ? 'ostrzeżenie' : 'ostrzeżenia'}`);
  if (counts.info > 0) parts.push(`${counts.info} ${counts.info === 1 ? 'informacja' : 'informacje'}`);
  return parts.join(' · ');
}

function fieldLabel(field: ValidationFinding['field']): string {
  if (field === 'url') return 'Adres strony';
  if (field === 'socialHandle') return 'Profil social media';
  return 'Nazwa marki';
}

function brandLabel(f: ValidationFinding): string {
  if (f.role === 'client') return `${f.brand} (Twoja marka)`;
  const n = (f.competitorIndex ?? 0) + 1;
  return `${f.brand} (konkurent ${n})`;
}

export default function PreValidateModal({
  result,
  validating,
  onApply,
  onApplyAll,
  onProceed,
  onCancel,
}: PreValidateModalProps) {
  const findings = useMemo(() => result?.findings ?? [], [result]);
  const hasErrors = findings.some((f) => f.severity === 'error');
  const hasWarnings = findings.some((f) => f.severity === 'warning');
  const applicableFindings = useMemo(
    () => findings.filter((f) => f.suggestion != null),
    [findings]
  );
  const summary = useMemo(() => buildSummary(findings), [findings]);

  // Gdy nie ma czego pokazać i nie walidujemy — modal nieaktywny
  if (!validating && !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-card shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 md:px-8 pt-6 pb-4 border-b border-beige-dark/30">
          <h2 className="font-heading text-2xl text-text-primary">
            {validating
              ? 'Weryfikuję dane…'
              : hasErrors
                ? 'Znaleziono problemy do poprawienia'
                : findings.length > 0
                  ? 'Czy na pewno te dane są poprawne?'
                  : 'Wszystko wygląda dobrze'}
          </h2>
          {!validating && findings.length > 0 && (
            <>
              <p className="text-sm text-text-gray mt-1.5">
                System wykrył potencjalne niespójności.
                {hasErrors
                  ? ' Popraw błędy, aby uruchomić skan.'
                  : ' Możesz zastosować sugestie lub uruchomić skan z obecnymi danymi.'}
              </p>
              {summary && (
                <p className="text-xs text-text-muted mt-1 font-medium">
                  {summary}
                </p>
              )}
            </>
          )}
          {validating && (
            <p className="text-sm text-text-gray mt-1.5">
              Sprawdzam adresy stron, formaty profili social i spójność z kategorią.
              Zajmie to kilka sekund.
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-5">
          {validating && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <span className="inline-block w-8 h-8 border-[3px] border-dk-teal border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-gray">
                Pobieram strony i weryfikuję z kategorią…
              </p>
            </div>
          )}

          {!validating && findings.length === 0 && result && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-12 h-12 rounded-full bg-dk-teal/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dk-teal">
                  <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-text-muted">Nie znaleziono problemów — scan rusza.</p>
            </div>
          )}

          {!validating && findings.length > 0 && (
            <div className="space-y-3">
              {findings.map((finding, idx) => {
                const cfg = severityConfig[finding.severity];
                return (
                  <div
                    key={idx}
                    className={`rounded-card p-4 ${cfg.bg} ${cfg.border}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Severity dot */}
                      <div className={`mt-1 w-5 h-5 rounded-full ${cfg.dot} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {cfg.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Meta line */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-text-gray">•</span>
                          <span className="text-xs text-text-muted">
                            {brandLabel(finding)} — {fieldLabel(finding.field)}
                          </span>
                        </div>

                        {/* Issue */}
                        <p className="text-sm text-text-primary leading-snug mb-1">
                          {finding.issue}
                        </p>

                        {/* Rationale */}
                        {finding.rationale && (
                          <p className="text-xs text-text-gray italic mb-2">
                            {finding.rationale}
                          </p>
                        )}

                        {/* Suggestion + apply button */}
                        {finding.suggestion && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-text-gray">Sugestia:</span>
                            <code className="text-xs bg-white/70 px-2 py-1 rounded border border-beige-dark/40 text-text-primary">
                              {finding.suggestion}
                            </code>
                            <button
                              type="button"
                              onClick={() => onApply(finding)}
                              className="text-xs font-medium text-dk-teal hover:text-dk-teal-hover transition-colors px-3 py-1 rounded-pill border border-dk-teal/30 hover:bg-dk-teal/5"
                            >
                              Zastosuj
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Apply all button — tylko gdy >= 2 sugestie z propozycją */}
              {applicableFindings.length >= 2 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onApplyAll(applicableFindings)}
                    className="w-full py-2.5 text-sm font-medium text-dk-teal border border-dk-teal/30 rounded-card hover:bg-dk-teal/5 transition-colors"
                  >
                    Zastosuj wszystkie sugestie ({applicableFindings.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!validating && result && (
          <div className="px-6 md:px-8 py-4 border-t border-beige-dark/30 flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 text-sm font-medium text-text-muted hover:text-text-primary border border-beige-dark/60 rounded-pill transition-colors"
            >
              Wróć i popraw
            </button>
            {hasErrors ? (
              // Hard block — scan zablokowany dopóki błędy nie są poprawione
              <button
                type="button"
                disabled
                className="px-5 py-2.5 text-sm font-medium text-text-gray/60 bg-beige-light rounded-pill cursor-not-allowed"
                title="Popraw błędy żeby uruchomić skan"
              >
                Uruchom skan
              </button>
            ) : hasWarnings ? (
              // Są ostrzeżenia — pomarańczowy CTA sygnalizuje "jedziesz na własną odpowiedzialność"
              <button
                type="button"
                onClick={onProceed}
                className="px-5 py-2.5 text-sm font-medium text-white bg-dk-orange hover:bg-dk-orange-hover rounded-pill transition-colors"
              >
                Jestem pewien — uruchom skan
              </button>
            ) : (
              // Tylko info / nic — neutralny teal CTA, żadnego alarmu
              <button
                type="button"
                onClick={onProceed}
                className="px-5 py-2.5 text-sm font-medium text-white bg-dk-teal hover:bg-dk-teal-hover rounded-pill transition-colors"
              >
                Uruchom skan
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
