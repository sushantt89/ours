import { useState } from 'react';
import { cn } from '@/lib/cn';
import { pieceClass, type BoardProps } from '../registry';

type Pos = [number, number];
interface CheckersView {
  board: ({ s: 0 | 1; k: boolean } | null)[][];
  must: Pos | null;
  last: [Pos, Pos] | null;
  moves: { from: Pos; to: Pos }[];
}
const same = (a: Pos | null | undefined, b: Pos) => Boolean(a && a[0] === b[0] && a[1] === b[1]);

/** Your pieces are always at the bottom. Tap a piece, then where it should go. */
export default function Checkers({ match, send, busy }: BoardProps<CheckersView>) {
  const v = match.view;
  const [picked, setPicked] = useState<Pos | null>(null);
  const myTurn = match.turn === 'me' && !busy;
  const flip = match.seat === 1;
  const targets = picked ? v.moves.filter((m) => same(m.from, picked)).map((m) => m.to) : [];
  const movable = new Set(v.moves.map((m) => m.from.join()));

  async function tap(pos: Pos) {
    if (!myTurn) return;
    if (picked && targets.some((t) => same(t, pos))) {
      const from = picked;
      setPicked(null);
      await send({ from, to: pos });
      return;
    }
    setPicked(movable.has(pos.join()) ? pos : null);
  }

  const rows = Array.from({ length: 8 }, (_, i) => (flip ? 7 - i : i));
  const cols = Array.from({ length: 8 }, (_, i) => (flip ? 7 - i : i));

  return (
    <div className="mx-auto w-[344px] max-w-full overflow-hidden rounded-2xl border-4 border-amber-900/70">
      <div className="grid grid-cols-8">
        {rows.flatMap((r) =>
          cols.map((c) => {
            const dark = (r + c) % 2 === 1;
            const piece = v.board[r][c];
            const pos: Pos = [r, c];
            const isTarget = targets.some((t) => same(t, pos));
            const wasMoved = v.last && (same(v.last[0], pos) || same(v.last[1], pos));
            return (
              <button
                key={`${r}${c}`}
                aria-label={`${piece ? (piece.s === match.seat ? 'Your' : 'Their') + (piece.k ? ' king' : ' piece') : 'Empty'} at row ${r + 1}, column ${c + 1}`}
                onClick={() => tap(pos)}
                className={cn('relative grid aspect-square place-items-center', dark ? 'bg-amber-800/80' : 'bg-amber-100 dark:bg-amber-200/80', wasMoved && dark && 'bg-amber-700')}
              >
                {isTarget && <span className="absolute size-3 rounded-full bg-white/80" />}
                {piece && (
                  <span
                    className={cn(
                      'grid size-[78%] place-items-center rounded-full border-2 border-white/40 text-sm shadow-md transition',
                      pieceClass(piece.s, match.seat),
                      same(picked, pos) && 'scale-110 ring-4 ring-white',
                      myTurn && movable.has(pos.join()) && !picked && 'ring-2 ring-white/60',
                    )}
                  >
                    {piece.k ? '👑' : ''}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
