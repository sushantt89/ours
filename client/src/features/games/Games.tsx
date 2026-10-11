import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Trash2 } from 'lucide-react';
import { del, errorMessage, get, post } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { GameRound, PromptGameId } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, EmptyState, IconButton, SectionTitle, SkeletonList } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { GAMES_KEY, Player, TwoTruthsSheet } from './prompt/Player';
import { ARCADE, formatScore } from './arcade/registry';
import { arcadeQuery, leader } from './arcade/ArcadePage';
import { HeadToHead } from './match/HeadToHead';

/** "Both answer, then reveal" games. */
const TOGETHER: { id: PromptGameId; emoji: string; name: string; hint: string; action?: string }[] = [
  { id: 'would_you_rather', emoji: '🤔', name: 'Would you rather', hint: 'Ten dilemmas. Do you choose alike?' },
  { id: 'this_or_that', emoji: '⚖️', name: 'This or that', hint: 'Ten quick choices. How many match?' },
  { id: 'most_likely', emoji: '👉', name: "Who's more likely", hint: 'Point at each other. Do you agree?' },
  { id: 'never_have_i_ever', emoji: '🙊', name: 'Never have I ever', hint: 'Confess, then compare' },
  { id: 'hot_takes', emoji: '🌶️', name: 'Hot takes', hint: 'Agree or disagree?' },
  { id: 'rate_it', emoji: '⭐', name: 'Rate it', hint: 'Score things 1 to 5. Same taste?' },
  { id: 'finish_sentence', emoji: '✍️', name: 'Finish the sentence', hint: 'Write it, then read each other’s' },
  { id: 'two_truths', emoji: '🤥', name: 'Two truths and a lie', hint: 'Can they spot your lie?', action: 'Write mine' },
  { id: 'know_me', emoji: '🧠', name: 'How well do you know me?', hint: 'A quiz from your daily answers', action: 'Make my quiz' },
];

export default function Games() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: GAMES_KEY, queryFn: () => get<{ games: GameRound[] }>('/games').then((r) => r.games) });
  const { data: arcade } = useQuery(arcadeQuery);
  const [starting, setStarting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get('play'));
  const [writingTruths, setWritingTruths] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);

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
    const answered = (g: GameRound) => Boolean(g.kind === 'text' ? g.myTexts : g.myPicks);
    return {
      yourTurn: all.filter((g) => g.status === 'open' && g.youPlay && !answered(g)),
      waiting: all.filter((g) => g.status === 'open' && !(g.youPlay && !answered(g))),
      done: all.filter((g) => g.status === 'done'),
    };
  }, [data]);

  async function start(game: PromptGameId) {
    if (game === 'two_truths') return setWritingTruths(true);
    setStarting(game);
    try {
      const { game: round } = await post<{ game: GameRound }>('/games', { game });
      await queryClient.invalidateQueries({ queryKey: GAMES_KEY });
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
    await queryClient.invalidateQueries({ queryKey: GAMES_KEY });
  }

  const Row = ({ game }: { game: GameRound }) => {
    const meta = TOGETHER.find((g) => g.id === game.game);
    const answered = game.kind === 'text' ? game.myTexts : game.myPicks;
    const status =
      game.status === 'done'
        ? game.kind === 'text'
          ? 'Read both answers'
          : game.game === 'two_truths'
            ? game.score
              ? 'Lie spotted'
              : 'Fooled!'
            : `${game.score}/${game.total} ${game.kind === 'quiz' ? 'correct' : 'match'}`
        : game.youPlay && !answered
          ? 'Your turn'
          : `Waiting for ${partnerName}`;
    const title =
      game.kind === 'quiz' ? (game.subjectId === me.id ? `Your ${game.game === 'two_truths' ? 'two truths' : 'quiz'}` : `${partnerName}'s ${game.game === 'two_truths' ? 'two truths' : 'quiz'}`) : game.name;
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpenId(game.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="text-2xl">{meta?.emoji ?? '🎲'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{title}</span>
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

  const resultList = showAllResults ? groups.done : groups.done.slice(0, 4);

  return (
    <Page title="Games" subtitle="Play together, even when you're apart" back={<BackButton />} wide>
      {!partner ? (
        <EmptyState emoji="🎲" title="Games need two" body="Once your partner joins, you can play together." />
      ) : (
        <>
          {groups.yourTurn.length > 0 && (
            <div className="mb-6">
              <SectionTitle>Your turn</SectionTitle>
              <Card className="divide-y divide-line/70 overflow-hidden border-accent/40">
                {groups.yourTurn.map((g) => (
                  <Row key={g.id} game={g} />
                ))}
              </Card>
            </div>
          )}

          <SectionTitle>Play together</SectionTitle>
          <p className="-mt-1 mb-3 px-1 text-sm text-muted">You both answer, then see each other's answers.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {TOGETHER.map((g) => (
              <button
                key={g.id}
                disabled={starting !== null}
                onClick={() => start(g.id)}
                className="flex flex-col items-start rounded-[24px] border border-line/70 bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60"
              >
                <span className="text-3xl">{g.emoji}</span>
                <span className="mt-2 font-display text-lg leading-tight">{g.name}</span>
                <span className="mt-1 text-xs text-muted">{starting === g.id ? 'Starting…' : g.hint}</span>
              </button>
            ))}
          </div>

          <HeadToHead partnerName={partnerName} />

          <div className="mt-8">
            <SectionTitle>Arcade</SectionTitle>
            <p className="-mt-1 mb-3 px-1 text-sm text-muted">Play on your own, beat {partnerName}'s best. 👑 shows who's ahead.</p>
            <Link to="/games/arcade/daily-word" className="mb-3 flex items-center gap-4 rounded-[24px] p-4 text-on-accent shadow-card accent-gradient transition active:scale-[0.99]">
              <span className="text-4xl">🟩</span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl">Daily word</span>
                <span className="block text-sm opacity-90">Same secret word for both of you today. Fewest guesses wins.</span>
              </span>
              <ChevronRight className="size-5" />
            </Link>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ARCADE.map((g) => {
                const row = arcade?.board[g.id];
                const lead = leader(g, row);
                return (
                  <Link key={g.id} to={`/games/arcade/${g.id}`} className="flex flex-col rounded-[24px] border border-line/70 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 active:scale-[0.98]">
                    <span className="text-3xl">{g.emoji}</span>
                    <span className="mt-2 font-display text-lg leading-tight">{g.name}</span>
                    <span className="mt-0.5 text-xs text-muted">{g.hint}</span>
                    <span className="mt-3 flex items-center justify-between gap-2 text-xs tabular-nums">
                      <span className={cn('truncate', lead === 'me' && 'font-semibold text-accent')}>
                        {lead === 'me' && '👑 '}You {row?.mine != null ? formatScore(g, row.mine) : '–'}
                      </span>
                      <span className={cn('truncate text-right', lead === 'partner' && 'font-semibold text-accent')}>
                        {lead === 'partner' && '👑 '}
                        {partner.name.split(' ')[0]} {row?.partner != null ? formatScore(g, row.partner) : '–'}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="mt-8">
              <SkeletonList rows={3} className="h-14" />
            </div>
          ) : (
            <>
              {groups.waiting.length > 0 && (
                <div className="mt-8">
                  <SectionTitle>Waiting for {partnerName}</SectionTitle>
                  <Card className="divide-y divide-line/70 overflow-hidden">
                    {groups.waiting.map((g) => (
                      <Row key={g.id} game={g} />
                    ))}
                  </Card>
                </div>
              )}
              {groups.done.length > 0 && (
                <div className="mt-8">
                  <SectionTitle>Results</SectionTitle>
                  <Card className="divide-y divide-line/70 overflow-hidden">
                    {resultList.map((g) => (
                      <Row key={g.id} game={g} />
                    ))}
                  </Card>
                  {groups.done.length > 4 && (
                    <Button variant="ghost" block className="mt-2" onClick={() => setShowAllResults((v) => !v)}>
                      {showAllResults ? 'Show fewer' : `Show all ${groups.done.length}`}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      <Player game={open} onClose={() => setOpenId(null)} />
      <TwoTruthsSheet
        open={writingTruths}
        onClose={() => setWritingTruths(false)}
        onCreated={(game) => {
          setWritingTruths(false);
          void queryClient.invalidateQueries({ queryKey: GAMES_KEY });
          toast.success(`Sent! Let's see if ${partnerName} can spot the lie`, '🤥');
          setOpenId(game.id);
        }}
      />
    </Page>
  );
}
