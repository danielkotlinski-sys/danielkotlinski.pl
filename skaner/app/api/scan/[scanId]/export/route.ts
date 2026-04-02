import { NextRequest } from 'next/server';
import { getReport } from '@/lib/redis';
import { reportToMarkdown, reportSourcesToTxt } from '@/lib/export';

export async function GET(
  request: NextRequest,
  { params }: { params: { scanId: string } }
) {
  const { scanId } = params;
  const format = request.nextUrl.searchParams.get('format') || 'markdown';

  const report = await getReport(scanId);
  if (!report) {
    return Response.json({ error: 'Raport nie znaleziony' }, { status: 404 });
  }

  if (format === 'sources') {
    const txt = reportSourcesToTxt(report);
    return new Response(txt, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="zrodla-${scanId}.txt"`,
      },
    });
  }

  // Default: markdown
  const md = reportToMarkdown(report);
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="raport-${scanId}.md"`,
    },
  });
}
