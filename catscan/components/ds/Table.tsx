import { ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  className?: string;
}

export default function Table<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  className = '',
}: TableProps<T>) {
  return (
    <div className={`border border-cs-border overflow-hidden ${className}`}>
      <table className="w-full font-mono border-collapse">
        <thead>
          <tr className="border-b border-cs-border bg-cs-canvas">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  'text-[0.5625rem] font-semibold uppercase tracking-[0.12em]',
                  'text-cs-gray px-5 py-3',
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={[
                'border-b border-cs-border last:border-b-0',
                'bg-cs-white hover:bg-cs-canvas transition-colors duration-100',
                onRowClick ? 'cursor-pointer' : '',
              ].join(' ')}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    'text-[0.75rem] px-5 py-4',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  ].join(' ')}
                >
                  {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
