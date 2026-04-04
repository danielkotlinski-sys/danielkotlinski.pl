import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="font-display text-cs-hero font-bold tracking-[-0.03em] mb-4">
          CATSCAN
        </div>
        <div className="font-mono text-cs-xs uppercase tracking-[0.14em] text-cs-gray mb-12">
          MARKET_INTELLIGENCE_ENGINE // V0.1
        </div>
        <div className="flex gap-6 justify-center font-mono text-cs-sm uppercase tracking-[0.1em]">
          <Link href="/ds" className="border-b border-cs-black pb-1 hover:text-cs-gray">
            Design_System
          </Link>
          <Link href="/scan" className="border-b border-cs-border pb-1 hover:border-cs-black">
            Scan_Engine
          </Link>
          <Link href="/chat" className="border-b border-cs-border pb-1 hover:border-cs-black">
            Query_Interface
          </Link>
        </div>
      </div>
    </div>
  );
}
