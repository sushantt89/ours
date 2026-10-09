import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useRealtime } from '@/store/realtime';
import { Button } from '@/components/ui';

/** The little celebration that plays when your partner nudges you. */
export function NudgeOverlay() {
  const nudge = useRealtime((s) => s.nudge);
  const clear = useRealtime((s) => s.clearNudge);
  const navigate = useNavigate();

  useEffect(() => {
    if (!nudge) return;
    navigator.vibrate?.([70, 50, 70]);
    const timer = setTimeout(clear, 5200);
    return () => clearTimeout(timer);
  }, [nudge, clear]);

  const floaters = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: 4 + ((i * 53) % 92),
        delay: (i % 8) * 0.14,
        size: 22 + ((i * 7) % 26),
        tilt: ((i * 37) % 50) - 25,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nudge?.key],
  );

  return createPortal(
    <AnimatePresence>
      {nudge && (
        <motion.div
          key={nudge.key}
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={clear}
        >
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" aria-hidden />
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {floaters.map((f) => (
              <span
                key={f.id}
                className="absolute bottom-[-10%] animate-float"
                style={{ left: `${f.left}%`, fontSize: f.size, animationDelay: `${f.delay}s`, ['--tilt' as string]: `${f.tilt}deg` }}
              >
                {nudge.emoji}
              </span>
            ))}
          </div>
          <motion.div
            role="alertdialog"
            aria-label={`${nudge.fromName}: ${nudge.text}`}
            initial={{ scale: 0.6, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220 }}
            className="relative w-full max-w-xs rounded-[32px] bg-surface p-7 text-center shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="text-7xl"
              animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.9, delay: 0.15 }}
              aria-hidden
            >
              {nudge.emoji}
            </motion.div>
            <p className="mt-4 text-sm font-medium uppercase tracking-[0.12em] text-muted">{nudge.fromName}</p>
            <p className="mt-1 font-display text-2xl leading-snug">{nudge.text}</p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" block onClick={clear}>
                Aww
              </Button>
              <Button
                block
                onClick={() => {
                  clear();
                  navigate('/nudges');
                }}
              >
                Send one back
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
