import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight, Trash2, X } from 'lucide-react';
import { del, errorMessage, get, post } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { GameRound } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, EmptyState, IconButton, SectionTitle, Sheet, SkeletonList } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const KEY = ['games'];

const GAMES = [
  { id: 'this_or_that', emoji: '⚖️', name: 'This or that', hint: 'Ten quick choices. How many do you share?' },
  { id: 'most_likely', emoji: '👉', name: "Who's more likely to…", hint: 'Point at each other. Do you agree?' },
  { id: 'know_me', emoji: '🧠', name: 'How well do you know me?', hint: 'A quiz made from your daily-question answers.' },
] as const;

function verdict(game: GameRound) {
  const pct = game.total ? (game.score ?? 0) / game.total : 0;
  if (game.game === 'know_me') return pct === 1 ? 'Perfect score. They really know you.' : pct >= 0.6 ? 'They know you well.' : 'Time for a few more deep talks.';
  if (game.game === 'most_likely') return pct >= 0.8 ? 'You see each other clearly.' : pct >= 0.5 ? 'Mostly on the same page.' : 'Lots to argue about over dinner.';
  return pct >= 0.8 ? 'Basically the same person.' : pct >= 0.5 ? 'A good mix of alike and different.' : 'Opposites attract.';
}

/** Plays a round one question at a time, then shows the results side by side. */
function Player({ game, onClose }: { game: GameRound | null; onClose: () => void }) {
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GameRound | null>(null);

  useEffect(() => {
    setPicks([]);
    setResult(null);
  }, [game?.id]);

  if (!game) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const shown = result ?? game;
  const playing = shown.youPlay && !shown.myPicks;
  const index = picks.length;
  const prompt = shown.prompts[index];
  const partnerName = partner?.name ?? 'Your partner';

  async function choose(option: number) {
    const next = [...picks, option];
    setPicks(next);
    navigator.vibrate?.(10);
    if (next.length < shown.prompts.length) return;
    setBusy(true);
    try {
      const { game: updated } = await post<{ game: GameRound }>(`/games/${shown.id}/answer`, { picks: next });
      setResult(updated);
      await queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(errorMessage(err));
      setPicks([]);
    } finally {
      setBusy(false);
    }
  }

  /** "Me"/"You" are from each person's own point of view; show who they actually pointed at. */
  const label = (option: number, who: 'me' | 'partner') => {
    const pointsAtMe = (who === 'me' && option === 0) || (who === 'partner' && option === 1);
    return pointsAtMe ? 'You' : partnerName;
  };

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
            Question {Math.min(index + 1, shown.prompts.length)} of {shown.prompts.length}
            {shown.game === 'know_me' && ` · Which was ${partnerName}'s answer?`}
          </p>
          <AnimatePresence mode="wait">
            {prompt ? (
              <motion.div key={index} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }}>
                <h2 className="mb-5 mt-2 text-[26px] leading-snug">{prompt.text}</h2>
                <div className={cn('grid gap-3', shown.game === 'know_me' ? 'grid-cols-1' : 'grid-cols-2')}>
                  {prompt.options.map((option, i) => (
                    <button
                      key={i}
                      disabled={busy}
                      onClick={() => choose(i)}
                      className={cn(
                        'rounded-[22px] border border-line bg-surface px-4 font-semibold shadow-card transition hover:-translate-y-0.5 hover:border-accent active:scale-95',
                        shown.game === 'know_me' ? 'py-4 text-left text-[15px] font-medium leading-snug' : 'py-8 text-lg',
                      )}
                    >
                      {shown.game === 'most_likely' ? (i === 0 ? '🙋 Me' : `👉 ${partnerName}`) : option}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="grid place-items-center py-16 text-muted">Saving your answers…</div>
            )}
          </AnimatePresence>
        </div>
      ) : shown.status !== 'done' ? (
        <div className="py-10 text-center">
          <p className="text-5xl">⏳</p>
          <p className="mt-3 font-display text-2xl">{shown.youPlay ? 'Your answers are in' : 'Your quiz is ready'}</p>
          <p className="mt-1 text-muted">
            {shown.youPlay ? `Waiting for ${partnerName}. Their answers stay hidden until you've both played.` : `${partnerName} hasn't taken it yet. You'll get a notification when they do.`}
          </p>
          <Button className="mt-6" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div>
          <div className="rounded-[24px] p-6 text-center text-on-accent accent-gradient">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] opacity-90">{shown.game === 'know_me' ? (shown.youPlay ? 'You scored' : `${partnerName} scored`) : 'You matched on'}</p>
            <p className="mt-1 font-display text-6xl leading-none">
              {shown.score}
              <span className="text-2xl opacity-80">/{shown.total}</span>
            </p>
            <p className="mt-2 font-medium">{verdict(shown)}</p>
          </div>
          <ul className="mt-4 space-y-2">
            {shown.prompts.map((p, i) => {
              const mine = shown.myPicks?.[i];
              const theirs = shown.partnerPicks?.[i];
              if (shown.game === 'know_me') {
                const guess = shown.youPlay ? mine : theirs;
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
              const agree = shown.game === 'most_likely' ? mine !== theirs : mine === theirs;
              return (
                <li key={i} className={cn('rounded-2xl p-3.5', agree ? 'bg-accent-soft' : 'bg-surface-2')}>
                  <p className="font-medium">
                    {agree ? '💞 ' : ''}
                    {p.text}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    You: <span className="font-semibold text-ink">{shown.game === 'most_likely' ? label(mine!, 'me') : p.options[mine!]}</span>
                    <span className="mx-2">·</span>
                    {partnerName}: <span className="font-semibold text-ink">{shown.game === 'most_likely' ? label(theirs!, 'partner') : p.options[theirs!]}</span>
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

export default function Games() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => get<{ games: GameRound[] }>('/games').then((r) => r.games) });
  const [starting, setStarting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get('play'));

  useEffect(() => {
    if (params.get('play')) {
      setOpenId(params.get('play'));
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const open = data?.find((g) => g.id === openId) ?? null;
  const partnerName = partner?.name ?? 'your partner';

  const groups = useMemo(() => {
    const all = data ?? [];
    return {
      yourTurn: all.filter((g) => g.status === 'open' && g.youPlay && !g.myPicks),
      waiting: all.filter((g) => g.status === 'open' && !(g.youPlay && !g.myPicks)),
      done: all.filter((g) => g.status === 'done'),
    };
  }, [data]);

  async function start(game: string) {
    setStarting(game);
    try {
      const { game: round } = await post<{ game: GameRound }>('/games', { game });
      await queryClient.invalidateQueries({ queryKey: KEY });
      setOpenId(round.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(null);
    }
  }

  async function remove(game: GameRound) {
    if (!(await confirm({ title: 'Delete this round?', confirmLabel: 'Delete', danger: true }))) return;
    await del(`/games/${game.id}`).catch((err) => toast.error(errorMessage(err)));
    await queryClient.invalidateQueries({ queryKey: KEY });
  }

  const Row = ({ game }: { game: GameRound }) => {
    const meta = GAMES.find((g) => g.id === game.game)!;
    const status =
      game.status === 'done'
        ? `${game.score}/${game.total} ${game.game === 'know_me' ? 'correct' : 'match'}`
        : game.youPlay && !game.myPicks
          ? 'Your turn'
          : `Waiting for ${partnerName}`;
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpenId(game.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="text-2xl">{meta.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {game.game === 'know_me' ? (game.subjectId === me.id ? 'Your quiz' : `${partnerName}'s quiz`) : game.name}
            </span>
            <span className="block text-sm text-muted">
              {status} · {timeAgo(game.createdAt)}
            </span>
          </span>
          <ChevronRight className="size-4 text-faint" />
        </button>
        <IconButton size="sm" label="Delete round" onClick={() => remove(game)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    );
  };

  return (
    <Page title="Games" subtitle="Play together, even when you're apart" back={<BackButton />}>
      {!partner ? (
        <EmptyState emoji="🎲" title="Games need two" body="Once your partner joins, you can play together." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {GAMES.map((g) => (
              <Card key={g.id} className="flex flex-col p-5">
                <span className="text-4xl">{g.emoji}</span>
                <p className="mt-3 font-display text-xl leading-tight">{g.name}</p>
                <p className="mt-1 flex-1 text-sm text-muted">{g.hint}</p>
                <Button className="mt-4" size="sm" loading={starting === g.id} onClick={() => start(g.id)}>
                  {g.id === 'know_me' ? 'Make my quiz' : 'Play'}
                </Button>
              </Card>
            ))}
          </div>

          {isLoading ? (
            <div className="mt-8">
              <SkeletonList rows={3} className="h-14" />
            </div>
          ) : (
            (['yourTurn', 'waiting', 'done'] as const).map((key) =>
              groups[key].length ? (
                <div key={key} className="mt-8">
                  <SectionTitle>{key === 'yourTurn' ? 'Your turn' : key === 'waiting' ? 'Waiting' : 'Results'}</SectionTitle>
                  <Card className="divide-y divide-line/70 overflow-hidden">
                    {groups[key].map((g) => (
                      <Row key={g.id} game={g} />
                    ))}
                  </Card>
                </div>
              ) : null,
            )
          )}
        </>
      )}
      <Player game={open} onClose={() => setOpenId(null)} />
    </Page>
  );
}
