import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { errorMessage, post } from '@/lib/api';
import { NUDGES } from '@/lib/constants';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/store/auth';
import { useRealtime, type IncomingNudge } from '@/store/realtime';
import { toast } from '@/store/ui';
import { Button, randomGif } from '@/components/ui';

/** Sends a nudge straight from the pop-up. A GIF comes along when the original had one. */
async function reply(emoji: string, text: string, withGif: boolean) {
  const gifsEnabled = useAuth.getState().config?.gifsEnabled;
  const search = NUDGES.find((n) => n.text === text)?.gif ?? text;
  let gifProblem = '';
  const picked =
    withGif && gifsEnabled
      ? await randomGif(search).catch((err) => {
          gifProblem = errorMessage(err);
          return null;
        })
      : null;
  await post('/nudges', {
    emoji,
    text,
    gif: picked ? { url: picked.url, preview: picked.preview, width: picked.width, height: picked.height } : undefined,
  });
  void queryClient.invalidateQueries({ queryKey: ['nudges'] });
  return gifProblem;
}

/** The little celebration that plays when your partner nudges you. */
export function NudgeOverlay() {
  const nudge = useRealtime((s) => s.nudge);
  const clear = useRealtime((s) => s.clearNudge);
  const partnerName = useAuth((s) => s.partner?.name ?? 'your partner');
  const [sending, setSending] = useState<'aww' | 'back' | null>(null);

  useEffect(() => {
    if (!nudge) return;
    if (nudge.replay) return; // opened from the history or a notification: stays until closed
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only start the countdown once someone can actually see it: a nudge that arrives while the
    // app is in the background waits until you come back.
    const start = () => {
      if (timer || document.visibilityState !== 'visible') return;
      navigator.vibrate?.([70, 50, 70]);
      // GIFs get time to play through a few times before the pop-up closes itself.
      timer = setTimeout(clear, nudge.gif?.url ? 20_000 : 5200);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      document.removeEventListener('visibilitychange', start);
      clearTimeout(timer);
    };
  }, [nudge, clear]);

  async function respond(kind: 'aww' | 'back', current: IncomingNudge) {
    setSending(kind);
    try {
      const gifProblem = kind === 'aww' ? '' : await reply(current.emoji, current.text, Boolean(current.gif?.url));
      if (kind === 'aww') await reply('🥰', 'Aww', false);
      clear();
      if (gifProblem) toast.info(`Sent without a GIF. ${gifProblem}`, current.emoji);
      else toast.success(kind === 'aww' ? `Sent "Aww" to ${partnerName}` : `Sent "${current.text}" back to ${partnerName}`, kind === 'aww' ? '🥰' : current.emoji);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

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
            {nudge.gif?.url ? (
              <motion.img
                src={nudge.gif.url}
                alt=""
                className="mx-auto max-h-56 w-full rounded-3xl bg-surface-2 object-contain"
                style={nudge.gif.width && nudge.gif.height ? { aspectRatio: `${nudge.gif.width} / ${nudge.gif.height}` } : undefined}
                initial={{ scale: 0.85, rotate: -3 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10, stiffness: 180, delay: 0.1 }}
              />
            ) : (
              <motion.div
                className="text-7xl"
                animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 0.9, delay: 0.15 }}
                aria-hidden
              >
                {nudge.emoji}
              </motion.div>
            )}
            <p className="mt-4 text-sm font-medium uppercase tracking-[0.12em] text-muted">{nudge.fromName}</p>
            <p className="mt-1 font-display text-2xl leading-snug">{nudge.text}</p>
            <div className="mt-6 flex gap-2">
              {nudge.mine ? (
                <Button variant="outline" block onClick={clear}>
                  Close
                </Button>
              ) : (
                <Button variant="outline" block loading={sending === 'aww'} disabled={Boolean(sending)} onClick={() => void respond('aww', nudge)}>
                  🥰 Aww
                </Button>
              )}
              {!nudge.mine && (
                <Button block loading={sending === 'back'} disabled={Boolean(sending)} onClick={() => void respond('back', nudge)}>
                  Send one back
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
