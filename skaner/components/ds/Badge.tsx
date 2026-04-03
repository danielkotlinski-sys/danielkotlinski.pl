import { HTMLAttributes, forwardRef } from 'react';

type Variant = 'default' | 'active' | 'pending' | 'complete' | 'error';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  default:  'bg-cs-bg-alt text-cs-fg border-cs-border',
  active:   'bg-cs-green/10 text-cs-green border-cs-green/30',
  pending:  'bg-cs-red/10 text-cs-red border-cs-red/30',
  complete: 'bg-cs-fg text-cs-fg-inv border-cs-fg',
  error:    'bg-cs-red text-white border-cs-red',
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={[
          'inline-flex items-center gap-1.5',
          'font-mono text-cs-xs uppercase tracking-widest font-medium',
          'px-2.5 py-1 border rounded-cs-none',
          variantStyles[variant],
          className,
        ].join(' ')}
        {...props}
      >
        <span className="w-1.5 h-1.5 bg-current inline-block" />
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
export default Badge;
