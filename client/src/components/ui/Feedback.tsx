import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUI } from '@/store/ui';
import { Button } from './Button';
import { Input } from './Field';
import { Sheet } from './Sheet';

/** Toast notifications. Announced politely to screen readers. */
export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-float"
          >
            <span className="shrink-0 text-lg" aria-hidden>
              {t.emoji ??
                (t.kind === 'error' ? (
                  <AlertCircle className="size-5 text-danger" />
                ) : t.kind === 'success' ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  '💌'
                ))}
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink">{t.message}</p>
            {t.action && (
              <button
                className="shrink-0 text-sm font-semibold text-accent"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="shrink-0 text-faint hover:text-ink" onClick={() => dismiss(t.id)}>
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/** App-wide confirmation dialog, driven by `confirm({...})` from the UI store. */
export function ConfirmHost() {
  const request = useUI((s) => s.confirm);
  const answer = useUI((s) => s.answer);
  const [typed, setTyped] = useState('');
  const needsTyping = request?.typeToConfirm;
  const close = (ok: boolean) => {
    setTyped('');
    answer(ok);
  };
  return (
    <Sheet open={Boolean(request)} onClose={() => close(false)} variant="center" title={request?.title}>
      {request?.body && <p className="text-muted">{request.body}</p>}
      {needsTyping && (
        <div className="mt-4">
          <Input
            label={`Type ${needsTyping} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            data-autofocus
          />
        </div>
      )}
      <div className="mt-6 flex gap-3">
        <Button variant="outline" block onClick={() => close(false)}>
          {request?.cancelLabel ?? 'Cancel'}
        </Button>
        <Button
          variant={request?.danger ? 'danger' : 'primary'}
          block
          disabled={Boolean(needsTyping) && typed.trim().toUpperCase() !== needsTyping}
          onClick={() => close(true)}
        >
          {request?.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </Sheet>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-2xl', className)} aria-hidden />;
}

export function SkeletonList({ rows = 4, className = 'h-20' }: { rows?: number; className?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-20 place-items-center rounded-full bg-accent-soft text-4xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="text-xl">{title}</h3>
      {body && <p className="mt-1.5 max-w-xs text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="🌧️"
      title="That didn't load"
      body={message ?? 'Please check your connection and try again.'}
      action={onRetry && <Button variant="soft" onClick={onRetry}>Try again</Button>}
    />
  );
}
