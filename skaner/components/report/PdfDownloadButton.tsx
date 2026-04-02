'use client';

import { useState, useCallback } from 'react';
import type { ScannerReport } from '@/types/scanner';

interface PdfDownloadButtonProps {
  report: ScannerReport;
  fileName: string;
}

export default function PdfDownloadButton({ report, fileName }: PdfDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const { generateReportPdf } = await import('@/lib/pdf-generator');
      const blob = await generateReportPdf(report);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [report, fileName]);

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-gray border border-beige-dark/30 rounded-pill hover:bg-white hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generating ? (
        <>
          <span className="inline-block w-3.5 h-3.5 border-2 border-text-gray border-t-transparent rounded-full animate-spin" />
          Generuję PDF...
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Pobierz PDF
        </>
      )}
    </button>
  );
}
