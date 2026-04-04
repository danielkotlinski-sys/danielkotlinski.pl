import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '_');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="inline-block self-start font-mono text-[0.5rem] font-semibold uppercase tracking-[0.12em] bg-cs-canvas border border-cs-border px-1.5 py-0.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full font-mono text-[0.75rem] tracking-[0.04em]',
            'bg-cs-white border border-cs-border',
            'px-3 py-2',
            'placeholder:text-cs-silver placeholder:uppercase placeholder:tracking-[0.08em] placeholder:text-[0.625rem]',
            'focus:outline-none focus:border-cs-black',
            'transition-colors duration-150',
            className,
          ].join(' ')}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
