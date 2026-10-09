import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FullPageLoader() {
  return (
    <div className="paper grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-accent">
        <span className="animate-heartbeat text-5xl" aria-hidden>
          ❤️
        </span>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
