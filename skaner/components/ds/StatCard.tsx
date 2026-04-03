import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  action?: ReactNode;
  className?: string;
}

export default function StatCard({ label, value, change, action, className = '' }: StatCardProps) {
  return (
    <div
      className={[
        'bg-cs-bg-card border border-cs-border rounded-cs-none',
        'p-5 flex flex-col gap-2 font-mono',
        className,
      ].join(' ')}
    >
      <span className="cs-stat-label">{label}</span>
      <div className="flex items-end gap-3">
        <span className="cs-stat">{value}</span>
        {change && (
          <span className="text-cs-xs font-medium text-cs-red mb-1">{change}</span>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
