import { cn } from '@/lib/cn';
import type { BoardProps } from '../registry';

type Throw = 'rock' | 'paper' | 'scissors';
interface RpsView {
  rounds: { picks: [Throw, Throw]; winner: 0 | 1 | null }[];
  score: [number, number];
  myPick: Throw | null;
  theyPicked: boolean;
}
const EMOJI: Record<Throw, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

export default function Rps({ match, send, busy, partnerName }: BoardProps<RpsView>) {
  const v = match.view;
  const me = match.seat;
  const them = me === 0 ? 1 : 0;
  const last = v.rounds[v.rounds.length - 1];
  const done = match.status === 'done';
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center">
      <div className="mb-4 flex items-center gap-5 font-display text-4xl tabular-nums">
        <span className="text-accent">{v.score[me]}</span>
        <span className="text-lg text-muted">first to 3</span>
        <span className="text-indigo-500">{v.score[them]}</span>
      </div>
      {last && (
        <div className="mb-5 flex items-center gap-6 rounded-3xl bg-surface-2 px-6 py-4">
          <span className="text-center">
            <span className="block text-5xl">{EMOJI[last.picks[me]]}</span>
            <span className="text-xs text-muted">You</span>
          </span>
          <span className="text-sm font-semibold">{last.winner === null ? 'Tie' : last.winner === me ? 'You win the round' : `${partnerName} wins it`}</span>
          <span className="text-center">
            <span className="block text-5xl">{EMOJI[last.picks[them]]}</span>
            <span className="text-xs text-muted">{partnerName.split(' ')[0]}</span>
          </span>
        </div>
      )}
      {!done && (
        <>
          <p className="mb-3 text-sm text-muted">
            {v.myPick ? (v.theyPicked ? 'Revealing…' : `You picked ${EMOJI[v.myPick]}. Waiting for ${partnerName}…`) : v.theyPicked ? `${partnerName} has picked. Your move!` : 'Pick in secret. Revealed when you both have.'}
          </p>
          <div className="flex gap-3">
            {(Object.keys(EMOJI) as Throw[]).map((t) => (
              <button
                key={t}
                disabled={Boolean(v.myPick) || busy}
                onClick={() => send({ pick: t })}
                aria-label={t}
                className={cn('grid size-24 place-items-center rounded-3xl border border-line bg-surface text-5xl shadow-card transition active:scale-90 disabled:opacity-40', v.myPick === t && 'opacity-100 ring-4 ring-accent')}
              >
                {EMOJI[t]}
              </button>
            ))}
          </div>
        </>
      )}
      {v.rounds.length > 1 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
          {v.rounds.map((r, i) => (
            <span key={i} className={cn('rounded-full px-2.5 py-1', r.winner === null ? 'bg-surface-2' : r.winner === me ? 'bg-accent-soft' : 'bg-indigo-500/15')}>
              {EMOJI[r.picks[me]]} {EMOJI[r.picks[them]]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
