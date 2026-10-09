import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `sheet` slides up from the bottom on phones; `center` is always a dialog. */
  variant?: 'sheet' | 'center';
  wide?: boolean;
}

/** Bottom sheet on phones, centred dialog on larger screens. Traps focus and closes on Escape. */
export function Sheet({ open, onClose, title, children, footer, variant = 'sheet', wide }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(
        (el) => !el.hasAttribute('disabled'),
      );
    const timer = setTimeout(() => (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current)?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex justify-center', variant === 'sheet' ? 'items-end sm:items-center' : 'items-center p-4')}>
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: variant === 'sheet' ? 60 : 12, scale: variant === 'sheet' ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: variant === 'sheet' ? 60 : 12 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col bg-surface shadow-float outline-none',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
              variant === 'sheet' ? 'rounded-t-[28px] sm:rounded-[28px]' : 'rounded-[28px]',
            )}
          >
            {variant === 'sheet' && <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />}
            {title && (
              <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4">
                <h2 className="text-xl">{title}</h2>
                <IconButton label="Close" onClick={onClose} className="-mr-2">
                  <X className="size-5" />
                </IconButton>
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
            {footer && <footer className="safe-bottom shrink-0 border-t border-line/70 px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
