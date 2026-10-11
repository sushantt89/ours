import { cn } from '@/lib/cn';
import type { BoardProps } from '../registry';

interface DotsView {
  h: (0 | 1 | null)[][];
  v: (0 | 1 | null)[][];
  boxes: (0 | 1 | null)[][];
  score: [number, number];
}

const lineColor = (who: 0 | 1 | null, mine: number) => (who === null ? 'bg-line hover:bg-accent/50' : who === mine ? 'bg-accent' : 'bg-indigo-500');

/** 4×4 boxes. Lines are big tap targets so it works on a phone. */
export default function Dots({ match, send, busy }: BoardProps<DotsView>) {
  const v = match.view;
  const n = v.boxes.length;
  const canPlay = match.turn === 'me' && !busy;
  const CELL = 64;
  const DOT = 12;
  const size = n * CELL + DOT;
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex gap-6 font-display text-xl tabular-nums">
        <span className="text-accent">You {v.score[match.seat]}</span>
        <span className="text-indigo-500">Them {v.score[match.seat === 0 ? 1 : 0]}</span>
      </div>
      <div className="relative rounded-3xl bg-surface-2 p-4">
        <div className="relative" style={{ width: size, height: size }}>
          {v.boxes.flatMap((row, r) =>
            row.map((who, c) =>
              who === null ? null : (
                <span
                  key={`b${r}${c}`}
                  className={cn('absolute grid place-items-center rounded-md text-lg', who === match.seat ? 'bg-accent/25' : 'bg-indigo-500/25')}
                  style={{ left: c * CELL + DOT, top: r * CELL + DOT, width: CELL - DOT, height: CELL - DOT }}
                >
                  {who === match.seat ? '💗' : '💙'}
                </span>
              ),
            ),
          )}
          {v.h.flatMap((row, r) =>
            row.map((who, c) => (
              <button
                key={`h${r}${c}`}
                aria-label={`Line across, row ${r + 1}, position ${c + 1}`}
                disabled={!canPlay || who !== null}
                onClick={() => send({ dir: 'h', r, c })}
                className="absolute flex items-center"
                style={{ left: c * CELL + DOT, top: r * CELL - 10 + DOT / 2, width: CELL - DOT, height: 20 }}
              >
                <span className={cn('h-1.5 w-full rounded-full transition-colors', lineColor(who, match.seat))} />
              </button>
            )),
          )}
          {v.v.flatMap((row, r) =>
            row.map((who, c) => (
              <button
                key={`v${r}${c}`}
                aria-label={`Line down, row ${r + 1}, position ${c + 1}`}
                disabled={!canPlay || who !== null}
                onClick={() => send({ dir: 'v', r, c })}
                className="absolute flex justify-center"
                style={{ left: c * CELL - 10 + DOT / 2, top: r * CELL + DOT, width: 20, height: CELL - DOT }}
              >
                <span className={cn('h-full w-1.5 rounded-full transition-colors', lineColor(who, match.seat))} />
              </button>
            )),
          )}
          {Array.from({ length: (n + 1) * (n + 1) }, (_, i) => (
            <span key={`d${i}`} className="pointer-events-none absolute rounded-full bg-ink" style={{ left: (i % (n + 1)) * CELL, top: Math.floor(i / (n + 1)) * CELL, width: DOT, height: DOT }} />
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Close a box to claim it and go again.</p>
    </div>
  );
}
