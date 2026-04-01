import { NextRequest } from 'next/server';
import { runCategoryScanner } from '@/lib/pipeline';
import type { ScanRequest, ProgressEvent } from '@/types/scanner';

export const maxDuration = 600; // 10 minutes

export async function POST(request: NextRequest) {
  const body: ScanRequest = await request.json();
  const { input, lead } = body;

  // Validation
  if (!input.clientBrand?.name || !input.clientBrand?.url) {
    return Response.json({ error: 'Brak danych marki klienta' }, { status: 400 });
  }
  if (!input.category || input.category.length < 20) {
    return Response.json({ error: 'Opis kategorii musi mieć min. 20 znaków' }, { status: 400 });
  }
  if (!input.competitors || input.competitors.length < 2 || input.competitors.length > 4) {
    return Response.json({ error: 'Wymagane 2-4 konkurentów' }, { status: 400 });
  }
  if (!lead?.firstName || !lead?.email || !lead?.gdprConsent) {
    return Response.json({ error: 'Brak wymaganych danych kontaktowych' }, { status: 400 });
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendEvent = (event: ProgressEvent | { type: string; scanId?: string; report?: any; error?: string }) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Keep-alive: send a comment every 25s to prevent Railway proxy timeout
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // stream already closed
          clearInterval(keepAlive);
        }
      }, 25_000);

      try {
        const { scanId } = await runCategoryScanner(
          input,
          lead,
          (progressEvent) => sendEvent(progressEvent)
        );

        // Don't send full report over SSE — just the scanId for redirect
        sendEvent({ type: 'complete', scanId });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Pipeline error:', error);
        sendEvent({
          type: 'error',
          error: error instanceof Error ? error.message : 'Nieznany błąd',
        });
      } finally {
        clearInterval(keepAlive);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
