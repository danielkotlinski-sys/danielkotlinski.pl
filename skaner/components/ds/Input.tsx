import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '_');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="cs-label">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cs-fg-dim">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full font-mono text-cs-base text-cs-fg',
              'bg-cs-bg-input border border-cs-border rounded-cs-none',
              'px-4 py-3',
              'placeholder:text-cs-fg-dim placeholder:uppercase placeholder:tracking-wider',
              'focus:outline-none focus:border-cs-border-bold',
              'transition-colors duration-200',
              icon ? 'pl-10' : '',
              className,
            ].join(' ')}
            {...props}
          />
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
