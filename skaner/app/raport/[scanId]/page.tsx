import Navigation from '@/components/Navigation';
import ReportContainer from '@/components/report/ReportContainer';
import ReportDisclaimer from '@/components/report/ReportDisclaimer';
import { getReport } from '@/lib/redis';
import { notFound } from 'next/navigation';

interface ReportPageProps {
  params: { scanId: string };
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { scanId } = params;
  const report = await getReport(scanId);

  if (!report) {
    notFound();
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen py-12 px-6">
        <ReportDisclaimer>
          <ReportContainer report={report} />
        </ReportDisclaimer>
      </main>
    </>
  );
}
