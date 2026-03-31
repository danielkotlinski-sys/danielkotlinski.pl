import { NextRequest } from 'next/server';
import { runCategoryScanner } from '@/lib/pipeline';
import { checkRateLimit, setRateLimit } from '@/lib/redis';
import type { ScanRequest, ProgressEvent } from '@/types/scanner';

export const maxDuration = 300; // 5 minutes

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

  // Rate limiting: 1 scan per 30 days per email
  const rateCheck = await checkRateLimit(lead.email);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: `Jeden skan na 30 dni. Następny będzie dostępny za ${rateCheck.daysLeft} dni.` },
      { status: 429 }
    );
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

      try {
        const { scanId, report } = await runCategoryScanner(
          input,
          lead,
          (progressEvent) => sendEvent(progressEvent)
        );

        // Set rate limit only AFTER successful scan
        await setRateLimit(lead.email);

        sendEvent({ type: 'complete', scanId, report });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Pipeline error:', error);
        sendEvent({
          type: 'error',
          error: error instanceof Error ? error.message : 'Nieznany błąd',
        });
      } finally {
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
