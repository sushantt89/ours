import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line/70 bg-surface shadow-card', className)} {...rest} />;
}

/** A tappable card that navigates somewhere. */
export function LinkCard({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'block rounded-card border border-line/70 bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-float active:translate-y-0 active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SectionTitle({ children, to, action }: { children: ReactNode; to?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {to ? (
        <Link to={to} className="flex items-center text-sm font-medium text-accent">
          See all <ChevronRight className="size-4" />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

export function Chip({ active, className, ...rest }: HTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition active:scale-95',
        active ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
        className,
      )}
      {...rest}
    />
  );
}

export function StorageBadge({ storage, className }: { storage: 'app' | 'drive'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted', className)}>
      ☁️ {storage === 'drive' ? 'Google Drive' : 'App storage'}
    </span>
  );
}
