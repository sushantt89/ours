import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { errorMessage, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { GameRound } from '@/lib/types';
import { usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Sheet, Textarea } from '@/components/ui';

export const GAMES_KEY = ['games'];

function verdict(game: GameRound) {
  const pct = game.total ? (game.score ?? 0) / game.total : 0;
  if (game.game === 'two_truths') return game.score ? 'Spotted it. No secrets here.' : 'Fooled! What a poker face.';
  if (game.kind === 'quiz') return pct === 1 ? 'Perfect score. They really know you.' : pct >= 0.6 ? 'They know you well.' : 'Time for a few more deep talks.';
  if (game.kind === 'opposite') return pct >= 0.8 ? 'You see each other clearly.' : pct >= 0.5 ? 'Mostly on the same page.' : 'Lots to argue about over dinner.';
  if (game.kind === 'close') return pct >= 0.8 ? 'Same taste, practically twins.' : pct >= 0.5 ? 'Close enough to share a night in.' : 'You’ll never agree on the remote.';
  return pct >= 0.8 ? 'Basically the same person.' : pct >= 0.5 ? 'A good mix of alike and different.' : 'Opposites attract.';
}

/** Plays a round one question at a time, then shows both answers side by side. */
export function Player({ game, onClose }: { game: GameRound | null; onClose: () => void }) {
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [picks, setPicks] = useState<number[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GameRound | null>(null);

  useEffect(() => {
    setPicks([]);
    setTexts([]);
    setDraft('');
    setResult(null);
  }, [game?.id]);

  if (!game) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const shown = result ?? game;
  const isText = shown.kind === 'text';
  const answered = isText ? shown.myTexts : shown.myPicks;
  const playing = shown.youPlay && !answered;
  const index = isText ? texts.length : picks.length;
  const prompt = shown.prompts[index];
  const partnerName = partner?.name ?? 'Your partner';

  async function submit(body: { picks?: number[]; texts?: string[] }) {
    setBusy(true);
    try {
      const { game: updated } = await post<{ game: GameRound }>(`/games/${shown.id}/answer`, body);
      setResult(updated);
      await queryClient.invalidateQueries({ queryKey: GAMES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(errorMessage(err));
      setPicks([]);
      setTexts([]);
    } finally {
      setBusy(false);
    }
  }

  function choose(option: number) {
    const next = [...picks, option];
    setPicks(next);
    navigator.vibrate?.(10);
    if (next.length === shown.prompts.length) void submit({ picks: next });
  }

  function write() {
    if (!draft.trim()) return;
    const next = [...texts, draft.trim()];
    setTexts(next);
    setDraft('');
    if (next.length === shown.prompts.length) void submit({ texts: next });
  }

  /** "Me"/"You" are from each person's own point of view; show who they actually pointed at. */
  const pointed = (option: number, who: 'me' | 'partner') => ((who === 'me' && option === 0) || (who === 'partner' && option === 1) ? 'You' : partnerName);
  const optionLabel = (i: number, option: string) => (shown.game === 'most_likely' ? (i === 0 ? '🙋 Me' : `👉 ${partnerName}`) : option);
  const stacked = shown.kind === 'quiz' || shown.game === 'would_you_rather';

  return (
    <Sheet open onClose={onClose} title={shown.name} wide>
      {playing ? (
        <div className="py-2">
          <div className="mb-5 flex gap-1" aria-hidden>
            {shown.prompts.map((_, i) => (
              <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < index ? 'bg-accent' : i === index ? 'bg-accent/40' : 'bg-line')} />
            ))}
          </div>
          <p className="text-sm font-medium text-muted">
            {shown.prompts.length > 1 && `Question ${Math.min(index + 1, shown.prompts.length)} of ${shown.prompts.length}`}
            {shown.game === 'know_me' && ` · Which was ${partnerName}'s answer?`}
            {shown.game === 'two_truths' && `${partnerName} wrote these. Two are true.`}
          </p>
          <AnimatePresence mode="wait">
            {prompt ? (
              <motion.div key={index} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }}>
                <h2 className="mb-5 mt-2 text-[26px] leading-snug">{prompt.text}</h2>
                {isText ? (
                  <div>
                    <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your answer…" maxLength={1000} rows={4} aria-label="Your answer" data-autofocus />
                    <Button block className="mt-3" onClick={write} disabled={!draft.trim()} loading={busy}>
                      {index + 1 === shown.prompts.length ? 'Send my answers' : 'Next'}
                    </Button>
                  </div>
                ) : (
                  <div className={cn('grid gap-3', stacked ? 'grid-cols-1' : prompt.options.length === 5 ? 'grid-cols-5 gap-2' : 'grid-cols-2')}>
                    {prompt.options.map((option, i) => (
                      <button
                        key={i}
                        disabled={busy}
                        onClick={() => choose(i)}
                        className={cn(
                          'rounded-[22px] border border-line bg-surface px-3 font-semibold shadow-card transition hover:-translate-y-0.5 hover:border-accent active:scale-95',
                          stacked ? 'py-4 text-left text-[15px] font-medium leading-snug' : prompt.options.length === 5 ? 'py-5 text-base' : 'py-8 text-lg',
                        )}
                      >
                        {optionLabel(i, option)}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="grid place-items-center py-16 text-muted">Saving your answers…</div>
            )}
          </AnimatePresence>
        </div>
      ) : shown.status !== 'done' ? (
        <div className="py-10 text-center">
          <p className="text-5xl">⏳</p>
          <p className="mt-3 font-display text-2xl">{shown.youPlay ? 'Your answers are in' : 'Sent!'}</p>
          <p className="mt-1 text-muted">
            {shown.youPlay ? `Waiting for ${partnerName}. Their answers stay hidden until you've both played.` : `${partnerName} hasn't played yet. You'll get a notification when they do.`}
          </p>
          <Button className="mt-6" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div>
          {shown.kind !== 'text' && (
            <div className="rounded-[24px] p-6 text-center text-on-accent accent-gradient">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] opacity-90">
                {shown.kind === 'quiz' ? (shown.youPlay ? 'You scored' : `${partnerName} scored`) : shown.kind === 'close' ? 'You agreed on' : 'You matched on'}
              </p>
              <p className="mt-1 font-display text-6xl leading-none">
                {shown.score}
                <span className="text-2xl opacity-80">/{shown.total}</span>
              </p>
              <p className="mt-2 font-medium">{verdict(shown)}</p>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {shown.prompts.map((p, i) => {
              if (shown.kind === 'text') {
                return (
                  <li key={i} className="rounded-2xl bg-surface-2 p-3.5">
                    <p className="font-medium">{p.text}</p>
                    <p className="mt-2 text-sm">
                      <span className="text-muted">You: </span>
                      {shown.myTexts?.[i]}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-muted">{partnerName}: </span>
                      {shown.partnerTexts?.[i]}
                    </p>
                  </li>
                );
              }
              const mine = shown.myPicks?.[i];
              const theirs = shown.partnerPicks?.[i];
              if (shown.kind === 'quiz') {
                const guess = shown.youPlay ? mine : theirs;
                if (shown.game === 'two_truths') {
                  return p.options.map((statement, k) => (
                    <li key={`${i}-${k}`} className={cn('flex items-start gap-2 rounded-2xl p-3.5', k === p.correct ? 'bg-accent-soft' : 'bg-surface-2')}>
                      <span className="text-lg">{k === p.correct ? '🤥' : '✅'}</span>
                      <span className="flex-1">
                        {statement}
                        {k === guess && <span className="ml-2 text-xs font-semibold text-muted">← guessed</span>}
                      </span>
                    </li>
                  ));
                }
                const right = guess === p.correct;
                return (
                  <li key={i} className="rounded-2xl bg-surface-2 p-3.5">
                    <p className="font-medium">{p.text}</p>
                    <p className="mt-1 flex items-start gap-1.5 text-sm">
                      {right ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" />}
                      <span>{p.options[p.correct ?? 0]}</span>
                    </p>
                    {!right && guess !== undefined && <p className="ml-5 text-xs text-muted">Guessed: {p.options[guess]}</p>}
                  </li>
                );
              }
              const agree = shown.kind === 'opposite' ? mine !== theirs : shown.kind === 'close' ? Math.abs((mine ?? 0) - (theirs ?? 0)) <= 1 : mine === theirs;
              const label = (pick: number | undefined, who: 'me' | 'partner') => (pick === undefined ? '–' : shown.kind === 'opposite' ? pointed(pick, who) : p.options[pick]);
              return (
                <li key={i} className={cn('rounded-2xl p-3.5', agree ? 'bg-accent-soft' : 'bg-surface-2')}>
                  <p className="font-medium">
                    {agree ? '💞 ' : ''}
                    {p.text}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    You: <span className="font-semibold text-ink">{label(mine, 'me')}</span>
                    <span className="mx-2">·</span>
                    {partnerName}: <span className="font-semibold text-ink">{label(theirs, 'partner')}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <Button block className="mt-5" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Write two truths and a lie for your partner to see through. */
export function TwoTruthsSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (game: GameRound) => void }) {
  const [statements, setStatements] = useState(['', '', '']);
  const [lie, setLie] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = statements.every((s) => s.trim()) && lie !== null;

  async function send() {
    if (!ready) return;
    setBusy(true);
    try {
      const { game } = await post<{ game: GameRound }>('/games', { game: 'two_truths', statements: statements.map((s) => s.trim()), lie });
      setStatements(['', '', '']);
      setLie(null);
      onCreated(game);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Two truths and a lie">
      <p className="mb-4 text-sm text-muted">Write three things about yourself. Two true, one made up. Tap the 🤥 next to the lie.</p>
      <div className="space-y-3">
        {statements.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <Textarea
              value={s}
              onChange={(e) => setStatements((all) => all.map((x, k) => (k === i ? e.target.value : x)))}
              placeholder={['I once met a celebrity', 'I can’t whistle', 'I’ve been to 12 countries'][i]}
              maxLength={200}
              rows={2}
              aria-label={`Statement ${i + 1}`}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setLie(i)}
              aria-pressed={lie === i}
              aria-label={`Statement ${i + 1} is the lie`}
              className={cn('grid size-12 shrink-0 place-items-center rounded-2xl text-2xl transition', lie === i ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2 opacity-60')}
            >
              🤥
            </button>
          </div>
        ))}
      </div>
      <Button block size="lg" className="mt-5" onClick={send} disabled={!ready} loading={busy}>
        Send to your partner
      </Button>
    </Sheet>
  );
}
