import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { motion } from 'motion/react';
import { del, errorMessage, get, post } from '@/lib/api';
import { NUDGES } from '@/lib/constants';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Couple, Nudge } from '@/lib/types';
import { useAuth, useCouple, useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, EmojiButton, EmptyState, Input, SectionTitle, Sheet, SkeletonList } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

/** Sends a nudge and reports back for the button's little animation. */
export function useSendNudge() {
  const partner = usePartner();
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<{ key: number; text: string } | null>(null);

  async function send(emoji: string, text: string) {
    if (!partner) return toast.error("Your partner hasn't joined yet");
    setSending(text);
    navigator.vibrate?.(25);
    try {
      await post('/nudges', { emoji, text });
      setSent({ key: Date.now(), text });
      toast.success(`Sent to ${partner.name}`, emoji);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(null);
    }
  }
  return { send, sending, sent };
}

export function NudgeButton({
  emoji,
  text,
  onSend,
  busy,
  justSent,
  onRemove,
}: {
  emoji: string;
  text: string;
  onSend: () => void;
  busy: boolean;
  justSent: number | null;
  onRemove?: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onSend}
        disabled={busy}
        className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[26px] border border-line/70 bg-surface p-2 shadow-card transition hover:-translate-y-0.5 hover:shadow-float active:scale-90 disabled:opacity-60"
      >
        <motion.span
          key={justSent ?? 'idle'}
          className="text-[40px] leading-none"
          animate={justSent ? { scale: [1, 1.6, 0.9, 1], rotate: [0, -14, 14, 0] } : {}}
          transition={{ duration: 0.6 }}
        >
          {emoji}
        </motion.span>
        <span className="line-clamp-2 text-center text-[13px] font-medium leading-tight text-muted">{text}</span>
      </button>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove "${text}"`} className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-danger">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export default function Nudges() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const { send, sending, sent } = useSendNudge();
  const { data, isLoading } = useQuery({ queryKey: ['nudges'], queryFn: () => get<{ recent: Nudge[] }>('/nudges') });
  const [adding, setAdding] = useState(false);
  const [emoji, setEmoji] = useState('🍟');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function addCustom(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { couple: updated } = await post<{ couple: Couple }>('/nudges/custom', { emoji, text: text.trim() });
      useAuth.setState({ couple: updated });
      setText('');
      setAdding(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeCustom(id: string, label: string) {
    if (!(await confirm({ title: `Remove "${label}"?`, body: 'It will disappear for both of you.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      const { couple: updated } = await del<{ couple: Couple }>(`/nudges/custom/${id}`);
      useAuth.setState({ couple: updated });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Page title="Nudges" subtitle={partner ? `One tap, and ${partner.name} knows` : 'One tap to say it'} back={<BackButton />}>
      {!partner ? (
        <EmptyState emoji="💕" title="Almost there" body="Nudges switch on as soon as your partner joins your space." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {NUDGES.map((n) => (
              <NudgeButton key={n.text} {...n} busy={sending === n.text} justSent={sent?.text === n.text ? sent.key : null} onSend={() => send(n.emoji, n.text)} />
            ))}
          </div>

          <div className="mt-8">
            <SectionTitle>Yours</SectionTitle>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {couple.customNudges.map((n) => (
                <NudgeButton
                  key={n.id}
                  emoji={n.emoji}
                  text={n.text}
                  busy={sending === n.text}
                  justSent={sent?.text === n.text ? sent.key : null}
                  onSend={() => send(n.emoji, n.text)}
                  onRemove={() => removeCustom(n.id, n.text)}
                />
              ))}
              <button
                onClick={() => setAdding(true)}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[26px] border-2 border-dashed border-line text-muted transition hover:border-accent hover:text-accent active:scale-95"
              >
                <Plus className="size-7" />
                <span className="text-[13px] font-medium">Make your own</span>
              </button>
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle>Recent</SectionTitle>
            {isLoading ? (
              <SkeletonList rows={3} className="h-14" />
            ) : !data?.recent.length ? (
              <p className="px-1 text-muted">No nudges yet. Go on, send the first one.</p>
            ) : (
              <Card className="divide-y divide-line/70">
                {data.recent.slice(0, 15).map((n) => {
                  const mine = n.fromId === me.id;
                  return (
                    <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-2xl" aria-hidden>
                        {n.emoji}
                      </span>
                      <p className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{n.text}</span>
                        <span className={cn('ml-2 text-sm', mine ? 'text-muted' : 'text-accent')}>{mine ? 'from you' : `from ${partner.name}`}</span>
                      </p>
                      <time className="shrink-0 text-xs text-muted" dateTime={n.createdAt}>
                        {timeAgo(n.createdAt)}
                      </time>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Make your own nudge">
        <form onSubmit={addCustom} className="space-y-4">
          <p className="text-sm text-muted">Something only the two of you would send. It's saved for both of you.</p>
          <div className="flex items-end gap-3">
            <EmojiButton value={emoji} onChange={setEmoji} />
            <div className="flex-1">
              <Input aria-label="Nudge text" placeholder="Bring me fries" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} data-autofocus />
            </div>
          </div>
          <Button type="submit" block size="lg" loading={busy} disabled={!text.trim()}>
            Save nudge
          </Button>
        </form>
      </Sheet>
    </Page>
  );
}
