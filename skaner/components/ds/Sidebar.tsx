'use client';

import { ReactNode } from 'react';

interface NavItem {
  label: string;
  icon?: ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

interface SidebarProps {
  brand?: string;
  version?: string;
  items: NavItem[];
  footer?: ReactNode;
  className?: string;
}

export default function Sidebar({ brand = 'CATSCAN', version, items, footer, className = '' }: SidebarProps) {
  return (
    <aside
      className={[
        'fixed top-0 left-0 h-screen w-[var(--cs-sidebar-w)]',
        'bg-cs-bg-card border-r border-cs-border',
        'flex flex-col font-mono',
        className,
      ].join(' ')}
    >
      {/* Brand */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-cs-xl font-bold uppercase tracking-wider">{brand}</h1>
        {version && (
          <span className="text-cs-xs text-cs-fg-dim uppercase tracking-widest">
            {version}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {items.map((item, i) => {
          const Tag = item.href ? 'a' : 'button';
          return (
            <Tag
              key={i}
              href={item.href}
              onClick={item.onClick}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 text-cs-sm uppercase tracking-wider',
                'transition-all duration-150 rounded-cs-none',
                item.active
                  ? 'bg-cs-fg text-cs-fg-inv font-semibold'
                  : 'text-cs-fg-muted hover:text-cs-fg hover:bg-cs-bg-alt',
              ].join(' ')}
            >
              {item.icon && <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>}
              {item.label}
            </Tag>
          );
        })}
      </nav>

      {/* Footer */}
      {footer && (
        <div className="px-4 py-4 border-t border-cs-border">
          {footer}
        </div>
      )}
    </aside>
  );
}
