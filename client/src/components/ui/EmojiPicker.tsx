import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { EMOJI_GROUPS } from '@/lib/constants';

export function EmojiGrid({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  return (
    <div className={cn('max-h-64 overflow-y-auto overscroll-contain pr-1', className)}>
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="mb-2">
          <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{group.label}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
                aria-label={`Insert ${emoji}`}
                className="grid aspect-square place-items-center rounded-lg text-xl transition hover:bg-surface-2 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A small button showing the chosen emoji that opens a picker popover. */
export function EmojiButton({ value, onChange, label = 'Choose an emoji' }: { value: string; onChange: (emoji: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-12 place-items-center rounded-2xl border border-line bg-surface text-2xl transition hover:bg-surface-2 active:scale-95"
      >
        {value}
      </button>
      {open && (
        <div className="absolute left-0 top-14 z-30 w-72 animate-fade-up rounded-2xl border border-line bg-surface p-3 shadow-float">
          <EmojiGrid
            onPick={(emoji) => {
              onChange(emoji);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
