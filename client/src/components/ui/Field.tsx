import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-2xl border border-line bg-surface px-4 text-ink placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-60';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
}

function Wrap({ id, label, hint, error, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block px-1 text-sm font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="px-1 text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap id={fieldId} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(control, 'h-12', error && 'border-danger', className)}
        {...rest}
      />
    </Wrap>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea(
  { label, hint, error, className, id, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        className={cn(control, 'resize-none py-3 leading-relaxed', error && 'border-danger', className)}
        {...rest}
      />
    </Wrap>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap id={fieldId} label={label} hint={hint} error={error}>
      <select ref={ref} id={fieldId} className={cn(control, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
    </Wrap>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex rounded-full bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 flex-1 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
