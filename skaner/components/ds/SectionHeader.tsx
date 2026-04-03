import { ReactNode } from 'react';

interface SectionHeaderProps {
  prefix?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export default function SectionHeader({ prefix, title, subtitle, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {prefix && <span className="cs-prefix">// {prefix}</span>}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-mono text-cs-2xl font-bold uppercase tracking-wide">
            {title}
          </h2>
          {subtitle && (
            <p className="font-mono text-cs-sm text-cs-fg-muted mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
