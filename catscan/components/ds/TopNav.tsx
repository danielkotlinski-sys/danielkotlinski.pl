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
        'w-full bg-cs-white border-b border-cs-border',
        'flex items-center justify-between px-8 h-12',
        className,
      ].join(' ')}
    >
      <span className="font-display text-sm font-bold uppercase tracking-[0.04em]">{brand}</span>

      {links.length > 0 && (
        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={[
                'font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition-colors duration-100 pb-0.5',
                link.active
                  ? 'text-cs-black border-b-[1.5px] border-cs-black'
                  : 'text-cs-gray hover:text-cs-black',
              ].join(' ')}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      {actions && <div className="flex items-center gap-4">{actions}</div>}
    </header>
  );
}
