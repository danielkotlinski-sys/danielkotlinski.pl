import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-cs-fg text-cs-fg-inv border border-cs-fg hover:bg-transparent hover:text-cs-fg',
  secondary:
    'bg-cs-bg-card text-cs-fg border border-cs-border-bold hover:bg-cs-bg-alt',
  ghost:
    'bg-transparent text-cs-fg border border-transparent hover:border-cs-border',
  danger:
    'bg-cs-red text-white border border-cs-red hover:bg-cs-red-hover',
};

const sizeStyles: Record<Size, string> = {
  sm: 'text-cs-xs px-3 py-1.5',
  md: 'text-cs-sm px-5 py-2.5',
  lg: 'text-cs-base px-8 py-3.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'font-mono uppercase tracking-widest font-semibold',
          'transition-all duration-200 cursor-pointer',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'rounded-cs-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 border border-current border-t-transparent animate-spin" />
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
