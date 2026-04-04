import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  action?: ReactNode;
  className?: string;
}

export default function StatCard({ label, value, action, className = '' }: StatCardProps) {
  return (
    <div className={`bg-cs-white border border-cs-border p-5 flex flex-col gap-2 ${className}`}>
      <span className="font-mono text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-cs-silver">
        {label}
      </span>
      <span className="font-display text-[2.25rem] font-bold leading-none">{value}</span>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
