import { NextRequest } from 'next/server';
import { runCategoryScanner } from '@/lib/pipeline';
import { getSession, getUser, checkScanLimit, incrementScanCount, notifyScanComplete } from '@/lib/auth';
import type { ScanRequest, ProgressEvent } from '@/types/scanner';

export const maxDuration = 600; // 10 minutes

export async function POST(request: NextRequest) {
  // Verify authentication
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Musisz być zalogowany' }, { status: 401 });
  }

  const user = await getUser(session.email);
  if (!user || !user.approved) {
    return Response.json({ error: 'Konto nie jest aktywne' }, { status: 403 });
  }

  // Check scan limit
  const { allowed, remaining } = await checkScanLimit(session.email);
  if (!allowed) {
    return Response.json({
      error: `Wykorzystałeś limit 3 skanów w tym miesiącu (pozostało: ${remaining}). Limit odnawia się z początkiem kolejnego miesiąca.`,
    }, { status: 429 });
  }

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
  // Lead data comes from auth session — ensure it exists for pipeline compatibility
  if (!lead?.firstName || !lead?.email) {
    return Response.json({ error: 'Brak danych użytkownika' }, { status: 400 });
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendEvent = (event: ProgressEvent | { type: string; scanId?: string; report?: any; error?: string }) => {
        if (streamClosed) return;
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Client disconnected — stop writing to stream
          streamClosed = true;
        }
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

        // Increment scan count for the user
        await incrementScanCount(session.email);

        // Notify user by email
        const reportUrl = `https://skaner.danielkotlinski.pl/raport/${scanId}`;
        notifyScanComplete(session.email, input.category, input.clientBrand.name, reportUrl).catch(() => {});

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
