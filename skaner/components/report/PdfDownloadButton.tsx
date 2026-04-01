'use client';

import { useState, useCallback } from 'react';

interface PdfDownloadButtonProps {
  reportElementId: string;
  fileName: string;
}

export default function PdfDownloadButton({ reportElementId, fileName }: PdfDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const element = document.getElementById(reportElementId);
      if (!element) return;

      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      // Capture at 2x scale for quality
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#F5F4EF',
        logging: false,
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        0,
        position,
        imgWidth,
        imgHeight
      );
      heightLeft -= pageHeight;

      // Additional pages
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(
          canvas.toDataURL('image/jpeg', 0.92),
          'JPEG',
          0,
          position,
          imgWidth,
          imgHeight
        );
        heightLeft -= pageHeight;
      }

      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [reportElementId, fileName]);

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
