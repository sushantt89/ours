import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { errorMessage, post, del } from '@/lib/api';
import { MOODS, STATUSES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import type { Mood } from '@/lib/types';
import { useAuth, useMe, usePartner } from '@/store/auth';
import { useChat } from '@/store/chat';
import { toast } from '@/store/ui';
import { Button, Input, Sheet } from '@/components/ui';

function Action({ emoji, label, onClick, disabled }: { emoji: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-[84px] min-w-0 flex-1 flex-col items-center gap-1.5 rounded-3xl border border-line/70 bg-surface px-1 py-3.5 shadow-card transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
    >
      <span className="text-[26px] leading-none transition-transform group-active:scale-125">{emoji}</span>
      <span className="line-clamp-2 w-full px-1 text-center text-[11.5px] font-medium leading-tight text-muted">{label}</span>
    </button>
  );
}

export function MoodSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: Mood | null }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<{ emoji: string; label: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!picked) return;
    setBusy(true);
    try {
      await post('/moods', { ...picked, note });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(me.privacy.shareMood ? 'Mood shared' : 'Mood saved, just for you', picked.emoji);
      setPicked(null);
      setNote('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="How are you feeling?">
      <p className="mb-4 text-sm text-muted">
        {me.privacy.shareMood ? 'Your partner will see this for the next 24 hours.' : 'Mood sharing is off, so only you will see this.'}
        {current && ` Right now: ${current.emoji} ${current.label}.`}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {MOODS.map((m) => (
          <button
            key={m.label}
            onClick={() => setPicked(m)}
            aria-pressed={picked?.label === m.label}
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl border py-3 transition active:scale-95',
              picked?.label === m.label ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            <span className="text-3xl">{m.emoji}</span>
            <span className="text-xs font-medium text-muted">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Input label="Add a few words" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
      </div>
      <Button block size="lg" className="mt-5" disabled={!picked} loading={busy} onClick={save}>
        {me.privacy.shareMood ? 'Share mood' : 'Save mood'}
      </Button>
    </Sheet>
  );
}

export function StatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(emoji: string, text: string) {
    setBusy(true);
    try {
      await post('/nudges/status', { emoji, text });
      await useAuth.getState().reload();
      toast.success('Sent', emoji);
      setCustom('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await del('/nudges/status').catch(() => undefined);
    await useAuth.getState().reload();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Let them know">
      <p className="mb-4 text-sm text-muted">Your partner gets a notification, and it stays on their home screen until you change it.</p>
      <div className="space-y-2">
        {STATUSES.map((s) => (
          <button
            key={s.text}
            disabled={busy}
            onClick={() => send(s.emoji, s.text)}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left font-medium transition hover:bg-surface-2 active:scale-[0.98]"
          >
            <span className="text-2xl">{s.emoji}</span> {s.text}
          </button>
        ))}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) void send('💭', custom.trim());
        }}
      >
        <div className="flex-1">
          <Input aria-label="Your own words" placeholder="Or say it your way…" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} />
        </div>
        <Button type="submit" className="h-12" disabled={!custom.trim()} loading={busy}>
          Send
        </Button>
      </form>
      {me.status && (
        <Button variant="ghost" block className="mt-3" onClick={clear}>
          Clear my current status
        </Button>
      )}
    </Sheet>
  );
}

/** One-tap ways to reach your partner from the home screen. */
export function QuickActions({ mood }: { mood: Mood | null }) {
  const me = useMe();
  const partner = usePartner();
  const navigate = useNavigate();
  const send = useChat((s) => s.send);
  const [moodOpen, setMoodOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [burst, setBurst] = useState(0);

  async function loveYou() {
    setBurst((b) => b + 1);
    navigator.vibrate?.(30);
    await send({ type: 'text', text: 'I love you ❤️' }, me.id);
    toast.success(`Sent to ${partner?.name ?? 'your partner'}`, '❤️');
  }

  return (
    <>
      <div className="relative flex gap-2.5">
        <div className="relative flex min-w-0 flex-1">
          <Action emoji="❤️" label="I love you" onClick={loveYou} disabled={!partner} />
          {burst > 0 && (
            <motion.span
              key={burst}
              className="pointer-events-none absolute left-1/2 top-2 text-3xl"
              initial={{ opacity: 1, y: 0, x: '-50%', scale: 0.6 }}
              animate={{ opacity: 0, y: -70, scale: 1.8 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              aria-hidden
            >
              ❤️
            </motion.span>
          )}
        </div>
        <Action emoji="💕" label="Nudge" onClick={() => navigate('/nudges')} disabled={!partner} />
        <Action emoji={me.status?.emoji ?? '💭'} label="Thinking of you" onClick={() => setStatusOpen(true)} disabled={!partner} />
        <Action emoji={mood?.emoji ?? '😊'} label={mood ? mood.label : 'My mood'} onClick={() => setMoodOpen(true)} />
      </div>
      <MoodSheet open={moodOpen} onClose={() => setMoodOpen(false)} current={mood} />
      <StatusSheet open={statusOpen} onClose={() => setStatusOpen(false)} />
    </>
  );
}
