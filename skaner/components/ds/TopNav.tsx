'use client';

import { ReactNode } from 'react';

interface TopNavProps {
  brand?: string;
  links?: { label: string; href: string; active?: boolean }[];
  actions?: ReactNode;
  className?: string;
}

export default function TopNav({ brand = 'CATSCAN', links = [], actions, className = '' }: TopNavProps) {
  return (
    <header
      className={[
        'w-full bg-cs-bg-card border-b border-cs-border',
        'flex items-center justify-between px-8 py-4',
        'font-mono',
        className,
      ].join(' ')}
    >
      {/* Brand */}
      <span className="text-cs-lg font-bold uppercase tracking-wider">{brand}</span>

      {/* Links */}
      {links.length > 0 && (
        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={[
                'text-cs-sm uppercase tracking-widest font-medium transition-colors duration-150',
                link.active
                  ? 'text-cs-fg border-b-2 border-cs-fg pb-0.5'
                  : 'text-cs-fg-muted hover:text-cs-fg',
              ].join(' ')}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      {/* Actions */}
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
