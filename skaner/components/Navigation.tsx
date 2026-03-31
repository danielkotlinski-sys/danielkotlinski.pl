'use client';

import { useState, useEffect } from 'react';

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'shadow-[0_2px_20px_rgba(0,0,0,0.06)]' : ''
      }`}
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="max-w-container mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <a href="https://danielkotlinski.pl" className="flex items-center gap-2">
          <span className="font-heading text-xl text-text-primary">
            danielkotlinski<span className="text-dk-orange">.pl</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          <a href="https://danielkotlinski.pl/#oferta" className="text-sm text-text-muted hover:text-text-primary transition-colors">
            Oferta
          </a>
          <a href="https://danielkotlinski.pl/blog" className="text-sm text-text-muted hover:text-text-primary transition-colors">
            Blog
          </a>
          <a href="https://danielkotlinski.pl/kontakt" className="text-sm text-text-muted hover:text-text-primary transition-colors">
            Kontakt
          </a>
          <span className="text-sm text-dk-teal font-medium border-b border-dk-teal pb-0.5">
            Skaner
          </span>
        </div>

        {/* CTA desktop */}
        <a
          href="https://danielkotlinski.pl/kontakt"
          className="hidden md:inline-flex items-center px-5 py-2 bg-dk-orange text-white text-xs font-medium rounded-pill hover:bg-dk-orange-hover hover:-translate-y-0.5 transition-all duration-300"
        >
          Umów rozmowę
        </a>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 text-text-muted"
          aria-label="Menu"
        >
          {menuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden px-6 pb-6 space-y-4">
          <a href="https://danielkotlinski.pl/#oferta" className="block font-heading text-2xl text-text-muted hover:text-text-primary">
            Oferta
          </a>
          <a href="https://danielkotlinski.pl/blog" className="block font-heading text-2xl text-text-muted hover:text-text-primary">
            Blog
          </a>
          <a href="https://danielkotlinski.pl/kontakt" className="block font-heading text-2xl text-text-muted hover:text-text-primary">
            Kontakt
          </a>
          <span className="block font-heading text-2xl text-dk-teal">
            Skaner
          </span>
          <a
            href="https://danielkotlinski.pl/kontakt"
            className="inline-flex items-center px-6 py-3 bg-dk-orange text-white text-sm font-medium rounded-pill mt-4"
          >
            Umów rozmowę
          </a>
        </div>
      )}
    </nav>
  );
}
