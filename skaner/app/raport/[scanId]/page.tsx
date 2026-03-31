import ReportContainer from '@/components/report/ReportContainer';
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
    <main className="min-h-screen py-16 px-6">
      <ReportContainer report={report} />
    </main>
  );
}
