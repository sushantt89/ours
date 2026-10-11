import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { get } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Match } from '@/lib/types';
import { Card, SectionTitle } from '@/components/ui';
import { MATCH_GAMES } from './registry';
import { useStartMatch } from './StartSheets';

type Records = Record<string, { won: number; lost: number; drawn: number }>;
export const matchesQuery = { queryKey: ['matches'], queryFn: () => get<{ matches: Match[]; records: Records }>('/matches') };

function status(m: Match, partnerName: string) {
  if (m.status === 'done') return m.result === 'won' ? 'You won 🏆' : m.result === 'lost' ? `${partnerName} won` : m.result === 'draw' ? 'Draw' : 'Finished';
  return m.turn === 'me' ? 'Your turn' : m.turn === 'both' ? 'Your pick' : `${partnerName}'s turn`;
}

function MatchRow({ m, partnerName }: { m: Match; partnerName: string }) {
  const entry = MATCH_GAMES.find((g) => g.id === m.game);
  return (
    <Link to={`/games/match/${m.id}`} className="flex items-center gap-3 px-4 py-3">
      <span className="text-2xl">{entry?.emoji ?? '🎲'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{m.name}</span>
        <span className={cn('block text-sm', m.turn === 'me' || m.turn === 'both' ? 'font-medium text-accent' : 'text-muted')}>
          {status(m, partnerName)} · {timeAgo(m.updatedAt)}
        </span>
      </span>
      <ChevronRight className="size-4 text-faint" />
    </Link>
  );
}

/** Turn-based games against each other, with your running record for each. */
export function HeadToHead({ partnerName }: { partnerName: string }) {
  const { data } = useQuery(matchesQuery);
  const { start, starting, sheet } = useStartMatch();
  const [showDone, setShowDone] = useState(false);
  const matches = data?.matches ?? [];
  const mine = matches.filter((m) => m.status === 'active' && (m.turn === 'me' || m.turn === 'both'));
  const theirs = matches.filter((m) => m.status === 'active' && m.turn === 'partner');
  const done = matches.filter((m) => m.status === 'done');
  const total = Object.values(data?.records ?? {}).reduce((t, r) => ({ won: t.won + r.won, lost: t.lost + r.lost }), { won: 0, lost: 0 });

  return (
    <div className="mt-8">
      <SectionTitle>Head to head</SectionTitle>
      <p className="-mt-1 mb-3 px-1 text-sm text-muted">
        Take turns from your own phones. {total.won + total.lost > 0 && <b className="text-ink">You {total.won} · {partnerName} {total.lost}</b>}
      </p>

      {mine.length > 0 && (
        <Card className="mb-3 divide-y divide-line/70 overflow-hidden border-accent/40">
          {mine.map((m) => (
            <MatchRow key={m.id} m={m} partnerName={partnerName} />
          ))}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MATCH_GAMES.map((g) => {
          const r = data?.records[g.id];
          return (
            <button
              key={g.id}
              disabled={starting !== null}
              onClick={() => start(g)}
              className="flex flex-col items-start rounded-[24px] border border-line/70 bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60"
            >
              <span className="text-3xl">{g.emoji}</span>
              <span className="mt-2 font-display text-lg leading-tight">{g.name}</span>
              <span className="mt-1 text-xs text-muted">{starting === g.id ? 'Starting…' : g.hint}</span>
              {r && r.won + r.lost + r.drawn > 0 && (
                <span className="mt-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {r.won}–{r.lost}
                  {r.drawn ? ` · ${r.drawn} draw${r.drawn > 1 ? 's' : ''}` : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {theirs.length > 0 && (
        <>
          <p className="mb-2 mt-5 px-1 text-sm font-semibold text-muted">Waiting for {partnerName}</p>
          <Card className="divide-y divide-line/70 overflow-hidden">
            {theirs.map((m) => (
              <MatchRow key={m.id} m={m} partnerName={partnerName} />
            ))}
          </Card>
        </>
      )}
      {done.length > 0 && (
        <>
          <p className="mb-2 mt-5 px-1 text-sm font-semibold text-muted">Recent matches</p>
          <Card className="divide-y divide-line/70 overflow-hidden">
            {(showDone ? done : done.slice(0, 3)).map((m) => (
              <MatchRow key={m.id} m={m} partnerName={partnerName} />
            ))}
          </Card>
          {done.length > 3 && (
            <button className="mt-2 w-full text-center text-sm font-medium text-accent" onClick={() => setShowDone((s) => !s)}>
              {showDone ? 'Show fewer' : `Show all ${done.length}`}
            </button>
          )}
        </>
      )}
      {sheet}
    </div>
  );
}
