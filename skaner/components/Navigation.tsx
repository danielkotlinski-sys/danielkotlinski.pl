'use client';

export default function Navigation() {
  return (
    <nav
      className="sticky top-0 z-50"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="max-w-container mx-auto px-6 flex items-center justify-between h-16">
        <a href="https://danielkotlinski.pl" className="flex items-center gap-2">
          <span className="font-heading text-xl text-text-primary">
            danielkotlinski<span className="text-dk-orange">.pl</span>
          </span>
        </a>
        <span className="text-sm text-dk-teal font-medium">
          Skaner Kategorii
        </span>
      </div>
    </nav>
  );
}
