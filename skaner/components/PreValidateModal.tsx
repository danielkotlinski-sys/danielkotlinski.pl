'use client';

import type { ValidationFinding } from '@/types/scanner';

interface PreValidateModalProps {
  /** Findings from the synchronous handle-format check (may be empty) */
  findings: ValidationFinding[];
  /** Apply a single suggestion — writes the value into the form field */
  onApply: (finding: ValidationFinding) => void;
  /** Apply all suggestions that have a non-null suggestion value */
  onApplyAll: (findings: ValidationFinding[]) => void;
  /** Proceed with the scan */
  onProceed: () => void;
  /** Close the modal and return to editing */
  onCancel: () => void;
}

function fieldLabel(field: ValidationFinding['field']): string {
  if (field === 'socialHandle') return 'Profil social media';
  return field;
}

function brandLabel(f: ValidationFinding): string {
  if (f.role === 'client') return `${f.brand} (Twoja marka)`;
  const n = (f.competitorIndex ?? 0) + 1;
  return `${f.brand} (konkurent ${n})`;
}

export default function PreValidateModal({
  findings,
  onApply,
  onApplyAll,
  onProceed,
  onCancel,
}: PreValidateModalProps) {
  const applicableFindings = findings.filter((f) => f.suggestion != null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-card shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 md:px-8 pt-6 pb-4 border-b border-beige-dark/30">
          <h2 className="font-heading text-2xl text-text-primary">
            Potwierdź dane przed uruchomieniem skanu
          </h2>
          <p className="text-sm text-text-gray mt-2 leading-relaxed">
            Za moment Skaner wykona analizę źródeł. <strong className="text-text-primary">Upewnij się, że podajesz poprawne adresy stron WWW i nazwy marek w social media</strong> — w innym wypadku wyniki będą błędne, a skan zużyje budżet na złe dane.
          </p>
        </div>

        {/* Body — handle-format warnings (if any) */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-5">
          {findings.length === 0 ? (
            <div className="flex items-start gap-3 rounded-card p-4 bg-dk-teal/5 border-l-4 border-l-dk-teal border-dk-teal/20 border">
              <div className="mt-0.5 w-5 h-5 rounded-full bg-dk-teal flex items-center justify-center text-white text-xs font-bold shrink-0">
                i
              </div>
              <div className="text-sm text-text-primary leading-snug">
                Wszystkie handle social media wyglądają poprawnie. Jeśli jesteś pewien adresów stron i nazw marek — możesz uruchomić skan.
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3">
                {findings.length === 1
                  ? 'Znaleźliśmy 1 potencjalny problem z handle social media'
                  : `Znaleźliśmy ${findings.length} potencjalne problemy z handle social media`}
              </p>
              <div className="space-y-3">
                {findings.map((finding, idx) => (
                  <div
                    key={idx}
                    className="rounded-card p-4 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        !
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Meta line: brand + field */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                            Ostrzeżenie
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
                ))}

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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 md:px-8 py-4 border-t border-beige-dark/30 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-text-muted hover:text-text-primary border border-beige-dark/60 rounded-pill transition-colors"
          >
            Wróć i popraw
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="px-5 py-2.5 text-sm font-medium text-white bg-dk-orange hover:bg-dk-orange-hover rounded-pill transition-colors"
          >
            Uruchom skan
          </button>
        </div>
      </div>
    </div>
  );
}
