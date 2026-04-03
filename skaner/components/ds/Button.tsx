import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'disabled';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-cs-black text-cs-white border-cs-black hover:bg-cs-white hover:text-cs-black',
  secondary:
    'bg-cs-white text-cs-black border-cs-black hover:bg-cs-black hover:text-cs-white',
  disabled:
    'bg-cs-white text-cs-silver border-cs-border cursor-not-allowed',
};

const sizeStyles: Record<Size, string> = {
  sm: 'text-[0.5625rem] px-3 py-1.5 tracking-[0.12em]',
  md: 'text-[0.6875rem] px-5 py-2.5 tracking-[0.1em]',
  lg: 'text-[0.75rem] px-8 py-3.5 tracking-[0.1em]',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className = '', children, ...props }, ref) => {
    const isDisabled = disabled || variant === 'disabled';
    return (
      <button
        ref={ref}
        disabled={isDisabled || loading}
        className={[
          'font-mono uppercase font-semibold',
          'border-2 transition-all duration-150',
          variantStyles[isDisabled ? 'disabled' : variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent animate-spin" />
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
