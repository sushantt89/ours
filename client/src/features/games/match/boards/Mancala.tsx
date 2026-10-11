import { cn } from '@/lib/cn';
import type { BoardProps } from '../registry';

interface MancalaView {
  pits: number[];
  last: number | null;
}

function Seeds({ n }: { n: number }) {
  return (
    <span className="flex flex-wrap items-center justify-center gap-0.5 p-1">
      {n <= 12 ? Array.from({ length: n }, (_, i) => <span key={i} className="size-2 rounded-full bg-amber-900/70 dark:bg-amber-200/80" />) : null}
      <span className={cn('w-full text-center font-display tabular-nums', n > 12 ? 'text-xl' : 'text-xs')}>{n}</span>
    </span>
  );
}

/** Your row is at the bottom, sown left to right into your store on the right. */
export default function Mancala({ match, send, busy, partnerName }: BoardProps<MancalaView>) {
  const v = match.view;
  const mine = match.seat === 0 ? 0 : 7;
  const theirs = match.seat === 0 ? 7 : 0;
  const myStore = match.seat === 0 ? 6 : 13;
  const theirStore = match.seat === 0 ? 13 : 6;
  const myTurn = match.turn === 'me' && !busy;
  const pit = (i: number, own: boolean) => (
    <button
      key={i}
      disabled={!own || !myTurn || v.pits[i] === 0}
      onClick={() => send({ pit: i - mine })}
      aria-label={`${own ? 'Your' : 'Their'} pit with ${v.pits[i]} seeds`}
      className={cn('grid aspect-square place-items-center rounded-full bg-amber-200/70 transition dark:bg-amber-900/50', own && myTurn && v.pits[i] > 0 && 'ring-2 ring-accent hover:scale-105', v.last === i && 'bg-amber-300/90')}
    >
      <Seeds n={v.pits[i]} />
    </button>
  );
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-[350px] max-w-full items-stretch gap-2 rounded-[32px] bg-amber-700/80 p-2.5">
        <div className="flex w-12 flex-col items-center justify-center rounded-full bg-amber-200/70 text-center dark:bg-amber-900/50">
          <span className="text-[10px] font-semibold uppercase text-indigo-700 dark:text-indigo-300">{partnerName.split(' ')[0]}</span>
          <span className="font-display text-2xl tabular-nums">{v.pits[theirStore]}</span>
        </div>
        <div className="grid flex-1 grid-rows-2 gap-2">
          {/* Their pits run right to left along the top */}
          <div className="grid grid-cols-6 gap-1.5">{Array.from({ length: 6 }, (_, k) => pit(theirs + 5 - k, false))}</div>
          <div className="grid grid-cols-6 gap-1.5">{Array.from({ length: 6 }, (_, k) => pit(mine + k, true))}</div>
        </div>
        <div className="flex w-12 flex-col items-center justify-center rounded-full bg-amber-200/70 text-center dark:bg-amber-900/50">
          <span className="text-[10px] font-semibold uppercase text-accent">You</span>
          <span className="font-display text-2xl tabular-nums">{v.pits[myStore]}</span>
        </div>
      </div>
      <p className="mt-3 max-w-xs text-center text-xs text-muted">Tap one of your pits to sow its seeds. End in your store to go again; end in an empty pit of yours to capture.</p>
    </div>
  );
}
