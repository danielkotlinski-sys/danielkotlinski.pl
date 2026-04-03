import { HTMLAttributes, forwardRef } from 'react';

type Variant = 'default' | 'bordered' | 'dark' | 'stat';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles: Record<Variant, string> = {
  default:  'bg-cs-bg-card border border-cs-border',
  bordered: 'bg-cs-bg-card border-2 border-cs-border-bold',
  dark:     'bg-cs-bg-dark text-cs-fg-inv border border-cs-bg-dark',
  stat:     'bg-cs-bg-card border border-cs-border',
};

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: 'p-0',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'rounded-cs-none font-mono',
          variantStyles[variant],
          paddingStyles[padding],
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
export default Card;
