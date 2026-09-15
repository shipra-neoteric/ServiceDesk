import { type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface WrapperProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  children: ReactNode;
}

export function FieldWrapper({ label, htmlFor, required, hint, error, hideLabel, children }: WrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-content dark:text-content-dark'}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-content-muted dark:text-content-dark-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const controlClass = (error?: string) =>
  clsx(
    'h-10 w-full rounded-md border bg-surface px-3 text-sm text-content transition-colors duration-fast dark:bg-surface-dark dark:text-content-dark',
    'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30',
    error ? 'border-danger' : 'border-border dark:border-border-dark',
  );

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; hideLabel?: boolean };
export const TextField = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, id, required, hideLabel, className, ...rest }, ref) => {
  const fieldId = id ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} hint={hint} error={error} hideLabel={hideLabel}>
      <input ref={ref} id={fieldId} aria-required={required} aria-invalid={!!error} className={clsx(controlClass(error), className)} {...rest} />
    </FieldWrapper>
  );
});
TextField.displayName = 'TextField';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, hint, id, required, className, ...rest }, ref) => {
  const fieldId = id ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-required={required}
        aria-invalid={!!error}
        className={clsx(controlClass(error), 'min-h-24 py-2', className)}
        {...rest}
      />
    </FieldWrapper>
  );
});
TextareaField.displayName = 'TextareaField';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; children: ReactNode };
export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, hint, id, required, className, children, ...rest }, ref) => {
  const fieldId = id ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} hint={hint} error={error}>
      <select ref={ref} id={fieldId} aria-required={required} aria-invalid={!!error} className={clsx(controlClass(error), className)} {...rest}>
        {children}
      </select>
    </FieldWrapper>
  );
});
SelectField.displayName = 'SelectField';
