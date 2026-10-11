import { cn } from '@/lib/cn';
import { pieceClass, type BoardProps } from '../registry';

interface ReversiView {
  board: (0 | 1 | null)[][];
  last: [number, number] | null;
  passed: boolean;
  score: [number, number];
  hints: boolean[][];
}

export default function Reversi({ match, send, busy, partnerName }: BoardProps<ReversiView>) {
  const v = match.view;
  const myTurn = match.turn === 'me' && !busy;
  const them = match.seat === 0 ? 1 : 0;
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex gap-6 font-display text-xl tabular-nums">
        <span className="text-accent">You {v.score[match.seat]}</span>
        <span className="text-indigo-500">
          {partnerName} {v.score[them]}
        </span>
      </div>
      {v.passed && match.turn === 'me' && <p className="mb-2 text-sm text-muted">{partnerName} had no move, so it's you again.</p>}
      <div className="w-[344px] max-w-full rounded-2xl bg-emerald-800 p-1.5">
        <div className="grid grid-cols-8 gap-[3px]">
          {v.board.flatMap((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}${c}`}
                aria-label={`Row ${r + 1} column ${c + 1}`}
                disabled={!myTurn || !v.hints[r][c]}
                onClick={() => send({ r, c })}
                className="grid aspect-square place-items-center rounded-[5px] bg-emerald-600"
              >
                {cell !== null ? (
                  <span className={cn('size-[82%] rounded-full shadow-md transition-colors duration-300', pieceClass(cell, match.seat), v.last?.[0] === r && v.last?.[1] === c && 'ring-2 ring-white')} />
                ) : myTurn && v.hints[r][c] ? (
                  <span className="size-3 rounded-full bg-white/40" />
                ) : null}
              </button>
            )),
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Place a piece to sandwich theirs and flip them to your colour.</p>
    </div>
  );
}
