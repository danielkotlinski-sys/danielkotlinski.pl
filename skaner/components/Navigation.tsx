'use client';

export default function Navigation() {
  return (
    <nav
      className="sticky top-0 z-50 bg-beige"
    >
      <div className="max-w-container mx-auto px-6 flex items-center justify-between h-16">
        <a href="https://danielkotlinski.pl" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://danielkotlinski.pl/img/logo.png"
            alt="Kotliński Brand Consultancy"
            className="h-8"
          />
        </a>
        <span className="text-sm text-text-muted tracking-wide">
          Skaner Kategorii
        </span>
      </div>
    </nav>
  );
}
