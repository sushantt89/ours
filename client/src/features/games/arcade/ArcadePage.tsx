import { Suspense, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { errorMessage, get, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMe, usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Button, Sheet, Skeleton } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { ARCADE, formatScore, type ArcadeEntry } from './registry';
import DailyWord from './DailyWord';

export interface BoardRow {
  mine: number | null;
  partner: number | null;
  myPlays: number;
  partnerPlays: number;
}
export const arcadeQuery = { queryKey: ['arcade'], queryFn: () => get<{ board: Record<string, BoardRow> }>('/arcade') } as const;

/** Who's ahead: 'me', 'partner', 'tie' or null when nobody has played. */
export function leader(entry: Pick<ArcadeEntry, 'lowWins'>, row?: BoardRow) {
  if (!row || (row.mine === null && row.partner === null)) return null;
  if (row.mine === null) return 'partner';
  if (row.partner === null) return 'me';
  if (row.mine === row.partner) return 'tie';
  return (entry.lowWins ? row.mine < row.partner : row.mine > row.partner) ? 'me' : 'partner';
}

function Scoreboard({ entry, row }: { entry: ArcadeEntry; row?: BoardRow }) {
  const me = useMe();
  const partner = usePartner();
  const lead = leader(entry, row);
  const side = (who: 'me' | 'partner') => {
    const person = who === 'me' ? me : partner;
    const best = row?.[who === 'me' ? 'mine' : 'partner'];
    return (
      <div className={cn('flex flex-1 items-center gap-2.5 rounded-2xl p-3', lead === who ? 'bg-accent-soft' : 'bg-surface-2')}>
        <Avatar name={person?.name ?? '?'} src={person?.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">
            {who === 'me' ? 'You' : (partner?.name ?? 'Partner')} {lead === who && '👑'}
          </p>
          <p className="font-display text-xl tabular-nums">{best === null || best === undefined ? '–' : formatScore(entry, best)}</p>
        </div>
      </div>
    );
  };
  return (
    <div className="mb-5 flex gap-2">
      {side('me')}
      {side('partner')}
    </div>
  );
}

interface Result {
  score: number;
  best: BoardRow;
  personalBest: boolean;
  tookLead: boolean;
}

export default function ArcadePage() {
  const { id } = useParams();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data } = useQuery(arcadeQuery);
  const [result, setResult] = useState<Result | null>(null);

  const entry = ARCADE.find((g) => g.id === id);
  const onGameOver = useCallback(
    async (score: number) => {
      if (!entry) return;
      try {
        const res = await post<Omit<Result, 'score'>>(`/arcade/${entry.id}/score`, { score });
        setResult({ score, ...res });
        queryClient.setQueryData(arcadeQuery.queryKey, (old: { board: Record<string, BoardRow> } | undefined) =>
          old ? { ...old, board: { ...old.board, [entry.id]: res.best } } : old,
        );
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [entry, queryClient],
  );

  if (id === 'daily-word') {
    return (
      <Page title="Daily word" subtitle="Same word for both of you, every day" back={<BackButton to="/games" />}>
        <DailyWord />
      </Page>
    );
  }
  if (!entry) return <Navigate to="/games" replace />;
  const Game = entry.component;
  const partnerName = partner?.name ?? 'your partner';
  const lead = result ? leader(entry, result.best) : null;

  return (
    <Page title={`${entry.emoji} ${entry.name}`} subtitle={entry.lowWins ? 'Lowest score wins' : 'Highest score wins'} back={<BackButton to="/games" />}>
      <Scoreboard entry={entry} row={data?.board[entry.id]} />
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-sm" />}>
        <Game onGameOver={onGameOver} />
      </Suspense>

      <Sheet open={Boolean(result)} onClose={() => setResult(null)} title="" variant="center">
        {result && (
          <div className="text-center">
            <motion.p initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="text-6xl">
              {result.tookLead ? '👑' : result.personalBest ? '🎉' : lead === 'partner' ? '😤' : '👏'}
            </motion.p>
            <p className="mt-2 font-display text-5xl tabular-nums">{formatScore(entry, result.score)}</p>
            <p className="mt-2 font-medium">
              {result.tookLead
                ? `You beat ${partnerName}! They'll get a notification.`
                : result.personalBest
                  ? 'New personal best!'
                  : lead === 'partner'
                    ? `${partnerName} is still ahead with ${formatScore(entry, result.best.partner!)}`
                    : 'Nice round!'}
            </p>
            <p className="mt-1 text-sm text-muted">
              Your best {result.best.mine !== null ? formatScore(entry, result.best.mine) : '–'} · {partnerName}'s {result.best.partner !== null ? formatScore(entry, result.best.partner) : '–'}
            </p>
            <Button block className="mt-6" onClick={() => setResult(null)}>
              OK
            </Button>
          </div>
        )}
      </Sheet>
    </Page>
  );
}
