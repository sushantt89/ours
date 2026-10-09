import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'accent-gradient text-on-accent shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-105',
  soft: 'bg-accent-soft text-accent hover:brightness-[0.97] dark:hover:brightness-110',
  ghost: 'text-ink hover:bg-surface-2',
  outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-105',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-13 px-6 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        block ? 'w-full min-w-0' : 'shrink-0',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

/** A round, icon-only button. `label` is required so screen readers can name it. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40',
        size === 'md' ? 'size-10' : 'size-8',
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
