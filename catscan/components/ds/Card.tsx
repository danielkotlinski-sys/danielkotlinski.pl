import { HTMLAttributes, forwardRef } from 'react';

type Variant = 'default' | 'bordered' | 'dark';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles: Record<Variant, string> = {
  default:  'bg-cs-white border border-cs-border',
  bordered: 'bg-cs-white border-2 border-cs-black',
  dark:     'bg-cs-black text-cs-white border-2 border-cs-black',
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
