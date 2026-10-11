import { Suspense, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { ApiError, del, errorMessage, get, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Match } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Avatar, Button, ErrorState, IconButton, Skeleton } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { MATCH_GAMES } from './registry';
import { useStartMatch } from './StartSheets';

function statusLine(m: Match, partnerName: string) {
  if (m.status === 'done') {
    if (m.result === 'won') return 'You won! 🏆';
    if (m.result === 'lost') return `${partnerName} won this one`;
    if (m.result === 'draw') return "It's a draw 🤝";
    return 'Finished';
  }
  if (m.turn === 'me') return 'Your turn';
  if (m.turn === 'partner') return `${partnerName}'s turn`;
  return 'Both of you play now';
}

export default function MatchPage() {
  const { id } = useParams();
  const me = useMe();
  const partner = usePartner();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const key = ['matches', id];
  const { data: match, isLoading, isError, refetch } = useQuery({ queryKey: key, queryFn: () => get<{ match: Match }>(`/matches/${id}`).then((r) => r.match), retry: false });
  const [busy, setBusy] = useState(false);
  const { start, sheet } = useStartMatch();

  const send = useCallback(
    async (move: unknown) => {
      setBusy(true);
      try {
        const { match: updated } = await post<{ match: Match }>(`/matches/${id}/move`, { move });
        queryClient.setQueryData(['matches', id], updated);
        void queryClient.invalidateQueries({ queryKey: ['matches'], exact: true });
        navigator.vibrate?.(10);
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : errorMessage(err));
        void refetch();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id, queryClient, refetch],
  );

  const entry = MATCH_GAMES.find((g) => g.id === match?.game);
  if (isError) return <Navigate to="/games" replace />;
  const partnerName = partner?.name ?? 'Your partner';

  async function remove() {
    if (!(await confirm({ title: 'Delete this game?', body: 'It disappears for both of you.', confirmLabel: 'Delete', danger: true }))) return;
    await del(`/matches/${id}`).catch((err) => toast.error(errorMessage(err)));
    void queryClient.invalidateQueries({ queryKey: ['matches'] });
    navigate('/games', { replace: true });
  }

  const Board = entry?.board;
  const seatPerson = (who: 'me' | 'partner') => (
    <div className={cn('flex flex-1 items-center gap-2 rounded-2xl p-2.5 transition-colors', match && match.turn === who ? 'bg-accent-soft ring-1 ring-accent/40' : 'bg-surface-2')}>
      <Avatar name={(who === 'me' ? me.name : partner?.name) ?? '?'} src={who === 'me' ? me.avatarUrl : partner?.avatarUrl} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{who === 'me' ? 'You' : partnerName}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <span className={cn('size-2.5 rounded-full', who === 'me' ? 'bg-accent' : 'bg-indigo-500')} />
          {match?.turn === who ? 'to play' : match?.turn === 'both' ? 'picking' : ''}
        </span>
      </span>
    </div>
  );

  return (
    <Page
      title={entry ? `${entry.emoji} ${entry.name}` : 'Game'}
      subtitle={match ? statusLine(match, partnerName) : undefined}
      back={<BackButton to="/games" />}
      actions={
        match && (
          <IconButton label="Delete game" onClick={remove}>
            <Trash2 className="size-5" />
          </IconButton>
        )
      }
    >
      {isLoading || !match || !Board ? (
        isLoading ? <Skeleton className="mx-auto h-96 max-w-sm" /> : <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            {seatPerson('me')}
            {seatPerson('partner')}
          </div>
          {match.status === 'done' && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('mb-4 rounded-3xl p-4 text-center', match.result === 'won' ? 'text-on-accent accent-gradient' : 'bg-surface-2')}>
              <p className="font-display text-2xl">{statusLine(match, partnerName)}</p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" variant={match.result === 'won' ? 'outline' : 'primary'} onClick={() => entry && start(entry)}>
                  Play again
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate('/games')}>
                  More games
                </Button>
              </div>
            </motion.div>
          )}
          <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-sm" />}>
            <Board match={match} send={send} busy={busy} partnerName={partnerName} />
          </Suspense>
        </>
      )}
      {sheet}
    </Page>
  );
}
