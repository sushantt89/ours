import { cn } from '@/lib/cn';
import { pieceClass, type BoardProps } from '../registry';

interface GridView {
  board: (0 | 1 | null)[][];
  last: [number, number] | null;
}

const isLast = (v: GridView, r: number, c: number) => v.last?.[0] === r && v.last?.[1] === c;

export function TicTacToe({ match, send, busy }: BoardProps<GridView>) {
  const v = match.view;
  const canPlay = match.turn === 'me' && !busy;
  return (
    <div className="mx-auto grid w-[300px] max-w-full grid-cols-3 gap-2.5 rounded-[28px] bg-surface-2 p-3">
      {v.board.flatMap((row, r) =>
        row.map((cell, c) => (
          <button
            key={`${r}${c}`}
            aria-label={`Row ${r + 1} column ${c + 1}${cell === null ? '' : cell === match.seat ? ', yours' : ', theirs'}`}
            disabled={!canPlay || cell !== null}
            onClick={() => send({ r, c })}
            className={cn('grid aspect-square place-items-center rounded-2xl bg-surface font-display text-6xl transition active:scale-95', isLast(v, r, c) && 'ring-2 ring-accent/50')}
          >
            {cell === null ? '' : <span className={cell === match.seat ? 'text-accent' : 'text-indigo-500'}>{cell === 0 ? '✕' : '◯'}</span>}
          </button>
        )),
      )}
    </div>
  );
}

export function ConnectFour({ match, send, busy }: BoardProps<GridView>) {
  const v = match.view;
  const canPlay = match.turn === 'me' && !busy;
  return (
    <div className="mx-auto w-[340px] max-w-full rounded-[28px] bg-indigo-900/90 p-2.5">
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, c) => (
          <button key={c} disabled={!canPlay || v.board[0][c] !== null} onClick={() => send({ c })} aria-label={`Drop in column ${c + 1}`} className="flex flex-col gap-1.5 rounded-xl transition hover:bg-white/10 disabled:hover:bg-transparent">
            {v.board.map((row, r) => (
              <span
                key={r}
                className={cn(
                  'aspect-square w-full rounded-full transition-colors',
                  row[c] === null ? 'bg-surface-2/90' : pieceClass(row[c]!, match.seat),
                  isLast(v, r, c) && 'ring-2 ring-white',
                )}
              />
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Gomoku({ match, send, busy }: BoardProps<GridView>) {
  const v = match.view;
  const n = v.board.length;
  const canPlay = match.turn === 'me' && !busy;
  return (
    <div className="mx-auto w-[360px] max-w-full rounded-2xl bg-amber-200/70 p-2 dark:bg-amber-900/40">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {v.board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              aria-label={`Row ${r + 1} column ${c + 1}`}
              disabled={!canPlay || cell !== null}
              onClick={() => send({ r, c })}
              className="relative grid aspect-square place-items-center"
            >
              {/* grid lines */}
              <span className="absolute inset-x-0 top-1/2 h-px bg-amber-900/30 dark:bg-amber-100/25" />
              <span className="absolute inset-y-0 left-1/2 w-px bg-amber-900/30 dark:bg-amber-100/25" />
              {cell !== null && <span className={cn('relative size-[80%] rounded-full shadow', pieceClass(cell, match.seat), isLast(v, r, c) && 'ring-2 ring-white')} />}
            </button>
          )),
        )}
      </div>
    </div>
  );
}
