import { HTMLAttributes, forwardRef } from 'react';

type Variant = 'default' | 'active' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  default: 'bg-cs-canvas text-cs-black border-cs-border',
  active:  'bg-cs-black text-cs-white border-cs-black',
  muted:   'bg-cs-canvas text-cs-silver border-cs-border',
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={[
          'inline-block font-mono text-[0.5rem] uppercase tracking-[0.12em] font-semibold',
          'px-1.5 py-0.5 border',
          variantStyles[variant],
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
export default Badge;
