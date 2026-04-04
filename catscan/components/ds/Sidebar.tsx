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

export default function Sidebar({ brand = 'CATSCAN_OS', version, items, footer, className = '' }: SidebarProps) {
  return (
    <aside
      className={[
        'fixed top-0 left-0 h-screen w-[200px]',
        'bg-cs-white border-r border-cs-border',
        'flex flex-col font-mono',
        className,
      ].join(' ')}
    >
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-[0.8125rem] font-bold uppercase tracking-[0.06em]">{brand}</h1>
        {version && (
          <span className="text-[0.5rem] text-cs-silver uppercase tracking-[0.14em]">
            {version}
          </span>
        )}
      </div>

      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {items.map((item, i) => {
          const Tag = item.href ? 'a' : 'button';
          return (
            <Tag
              key={i}
              href={item.href}
              onClick={item.onClick}
              className={[
                'w-full flex items-center gap-2 px-2 py-[7px]',
                'text-[0.625rem] uppercase tracking-[0.08em]',
                'transition-all duration-100',
                item.active
                  ? 'bg-cs-black text-cs-white font-semibold'
                  : 'text-cs-gray hover:text-cs-black',
              ].join(' ')}
            >
              {item.icon && <span className="w-[14px] h-[14px] flex items-center justify-center">{item.icon}</span>}
              {item.label}
            </Tag>
          );
        })}
      </nav>

      {footer && (
        <div className="mx-3 mb-4 border border-cs-border p-2.5">
          {footer}
        </div>
      )}
    </aside>
  );
}
