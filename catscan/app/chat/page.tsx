'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    model: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    entitiesInContext: number;
  };
}

const EXAMPLE_QUERIES = [
  'Pokaż ranking firm po cenie dnia — od najtańszej',
  'Porównaj pozycjonowanie marek — kto celuje w jaką grupę?',
  'Która firma ma najszerszą ofertę diet?',
  'Jakie modele dostawy stosują te firmy?',
  'Podsumuj kluczowe różnice między tymi cateringami',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [entityCount, setEntityCount] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check how many entities we have
  useEffect(() => {
    fetch('/api/entities')
      .then((r) => r.json())
      .then((data) => setEntityCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setEntityCount(0));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const question = text || input;
    if (!question.trim()) return;

    const userMsg: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer,
        meta: data.meta,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-cs-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-cs-lg font-bold">CATSCAN</Link>
          <span className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-silver">
            // QUERY_INTERFACE
          </span>
        </div>
        <div className="flex items-center gap-4">
          {entityCount !== null && (
            <span className="font-mono text-cs-xs uppercase tracking-[0.12em] text-cs-gray">
              {entityCount} entities loaded
            </span>
          )}
          <Link
            href="/scan"
            className="font-mono text-cs-xs uppercase tracking-[0.1em] border border-cs-border px-3 py-1.5 hover:border-cs-black transition-colors"
          >
            SCAN
          </Link>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 max-w-[800px] mx-auto w-full">
        {messages.length === 0 && (
          <div className="mt-20">
            <div className="font-display text-cs-xl font-bold mb-2">Zapytaj o cokolwiek.</div>
            <div className="font-editorial text-cs-md text-cs-gray mb-8">
              Dane z przeskanowanych firm są w kontekście. Pytaj po polsku o porównania, rankingi, różnice.
            </div>

            {entityCount === 0 && (
              <div className="border border-yellow-400 bg-yellow-50 p-4 mb-8">
                <div className="font-mono text-cs-sm text-yellow-800">
                  Brak danych — najpierw <Link href="/scan" className="underline font-semibold">uruchom skan</Link>.
                </div>
              </div>
            )}

            <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-silver mb-3">
              EXAMPLE_QUERIES
            </div>
            <div className="grid gap-2">
              {EXAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left font-mono text-cs-sm border border-cs-border p-3 hover:border-cs-black hover:bg-cs-white transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-6 ${msg.role === 'user' ? 'ml-20' : ''}`}>
            <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-1">
              {msg.role === 'user' ? 'YOU' : 'CATSCAN'}
            </div>
            <div
              className={`${
                msg.role === 'user'
                  ? 'bg-cs-black text-cs-white p-4 font-mono text-cs-sm'
                  : 'bg-cs-white border border-cs-border p-4'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div
                  className="font-editorial text-cs-md leading-relaxed prose prose-sm max-w-none
                    [&_table]:font-mono [&_table]:text-cs-sm [&_table]:border-collapse
                    [&_th]:border [&_th]:border-cs-border [&_th]:p-2 [&_th]:bg-cs-canvas [&_th]:text-left [&_th]:text-cs-xs [&_th]:uppercase [&_th]:tracking-[0.1em]
                    [&_td]:border [&_td]:border-cs-border [&_td]:p-2
                    [&_strong]:font-semibold
                    [&_h3]:font-display [&_h3]:text-cs-md [&_h3]:font-bold [&_h3]:uppercase [&_h3]:mt-4 [&_h3]:mb-2
                    [&_ul]:list-disc [&_ul]:pl-5
                    [&_ol]:list-decimal [&_ol]:pl-5
                    [&_code]:font-mono [&_code]:text-cs-sm [&_code]:bg-cs-canvas [&_code]:px-1"
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(msg.content),
                  }}
                />
              ) : (
                msg.content
              )}
            </div>
            {msg.meta && (
              <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mt-1 flex gap-4">
                <span>{msg.meta.model}</span>
                <span>{msg.meta.inputTokens + msg.meta.outputTokens} tokens</span>
                <span>${msg.meta.costUsd.toFixed(4)}</span>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="mb-6">
            <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-1">CATSCAN</div>
            <div className="bg-cs-white border border-cs-border p-4 font-mono text-cs-sm text-cs-silver animate-pulse">
              Analyzing data...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-cs-border p-4">
        <div className="max-w-[800px] mx-auto flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Zapytaj o rynek cateringów..."
            disabled={loading}
            className="flex-1 font-mono text-cs-base border border-cs-border px-4 py-3 bg-cs-white focus:outline-none focus:border-cs-black disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="font-mono text-cs-sm uppercase tracking-[0.1em] bg-cs-black text-cs-white px-6 py-3 hover:bg-cs-ink transition-colors disabled:opacity-50"
          >
            QUERY
          </button>
        </div>
      </div>
    </div>
  );
}

/** Minimal markdown → HTML (tables, bold, lists, headers) */
function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML (but preserve markdown)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match
      .split('|')
      .filter((c) => c.trim())
      .map((c) => c.trim());
    return '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
  });
  html = html.replace(/<tr>(<td>-+<\/td>)+<\/tr>/g, '');
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');
  // First row → th
  html = html.replace(/<table><tr>(.*?)<\/tr>/, (_, row) => {
    return '<table><thead><tr>' + row.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>') + '</tr></thead><tbody>';
  });
  html = html.replace(/<\/table>/g, '</tbody></table>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h3>|<table>|<ul>|<ol>)/g, '$1');
  html = html.replace(/(<\/h3>|<\/table>|<\/ul>|<\/ol>)<\/p>/g, '$1');

  return html;
}
