import { useEffect, useRef, useState } from 'react';
import { Flag, Pickaxe } from 'lucide-react';
import { cn } from '@/lib/cn';
import { StartCard, type ArcadeProps } from './shared';

const SIZE = 9;
const MINES = 10;

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  around: number;
}

const neighbours = (i: number) => {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if ((dr || dc) && nr >= 0 && nc >= 0 && nr < SIZE && nc < SIZE) out.push(nr * SIZE + nc);
    }
  return out;
};

/** Mines are placed after the first tap, so the first tap is always safe. */
function layMines(safe: number): Cell[] {
  const cells: Cell[] = Array.from({ length: SIZE * SIZE }, () => ({ mine: false, open: false, flag: false, around: 0 }));
  const banned = new Set([safe, ...neighbours(safe)]);
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(Math.random() * cells.length);
    if (cells[i].mine || banned.has(i)) continue;
    cells[i].mine = true;
    placed++;
  }
  cells.forEach((cell, i) => (cell.around = neighbours(i).filter((n) => cells[n].mine).length));
  return cells;
}

const NUMBER_COLORS = ['', 'text-blue-500', 'text-emerald-600', 'text-rose-500', 'text-indigo-600', 'text-amber-700', 'text-cyan-600', 'text-ink', 'text-muted'];

/** Classic Minesweeper, 9×9 with 10 mines. Score = seconds to clear (lower is better). */
export default function Minesweeper({ onGameOver }: ArcadeProps) {
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [state, setState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [flagMode, setFlagMode] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    if (state !== 'playing' || !cells) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [state, cells]);

  function start() {
    setCells(null);
    setSeconds(0);
    setState('playing');
  }

  function open(i: number) {
    if (state !== 'playing') return;
    let board = cells;
    if (!board) {
      board = layMines(i);
      startedAt.current = Date.now();
    }
    const next = board.map((c) => ({ ...c }));
    if (next[i].flag || next[i].open) return;
    if (next[i].mine) {
      next.forEach((c) => c.mine && (c.open = true));
      setCells(next);
      setState('lost');
      navigator.vibrate?.(200);
      return;
    }
    // Flood-open empty areas.
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      if (next[k].open || next[k].flag) continue;
      next[k].open = true;
      if (next[k].around === 0) stack.push(...neighbours(k).filter((n) => !next[n].open && !next[n].mine));
    }
    setCells(next);
    if (next.filter((c) => !c.open).length === MINES) {
      const time = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      setSeconds(time);
      setState('won');
      onGameOver(time);
    }
  }

  function flag(i: number) {
    if (state !== 'playing' || !cells || cells[i].open) return;
    navigator.vibrate?.(15);
    setCells(cells.map((c, k) => (k === i ? { ...c, flag: !c.flag } : c)));
  }

  const flags = cells?.filter((c) => c.flag).length ?? 0;

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-[340px] max-w-full items-center justify-between font-display text-2xl tabular-nums">
        <span>💣 {MINES - flags}</span>
        <span>⏱ {seconds}s</span>
      </div>
      <div className="relative select-none">
        <div className="grid grid-cols-9 gap-1 rounded-3xl bg-surface-2 p-2" onContextMenu={(e) => e.preventDefault()}>
          {Array.from({ length: SIZE * SIZE }, (_, i) => {
            const c = cells?.[i];
            return (
              <button
                key={i}
                aria-label={c?.open ? (c.mine ? 'mine' : `${c.around}`) : c?.flag ? 'flagged' : 'hidden'}
                onPointerDown={() => {
                  longPressed.current = false;
                  press.current = setTimeout(() => {
                    longPressed.current = true;
                    flag(i);
                  }, 380);
                }}
                onPointerUp={() => press.current && clearTimeout(press.current)}
                onPointerLeave={() => press.current && clearTimeout(press.current)}
                onClick={() => {
                  if (longPressed.current) return;
                  if (flagMode) flag(i);
                  else open(i);
                }}
                className={cn(
                  'grid size-[34px] place-items-center rounded-lg text-base font-bold transition sm:size-9',
                  c?.open ? (c.mine ? 'bg-danger/80' : 'bg-surface') : 'bg-line hover:brightness-95 active:scale-90',
                  c?.open && NUMBER_COLORS[c.around],
                )}
              >
                {c?.open ? (c.mine ? '💣' : c.around || '') : c?.flag ? '🚩' : ''}
              </button>
            );
          })}
        </div>
        {(state === 'idle' || state === 'lost') && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-surface/85">
            <StartCard
              emoji={state === 'lost' ? '💥' : '💣'}
              title={state === 'lost' ? 'Boom!' : 'Minesweeper'}
              hint={state === 'lost' ? 'That one was a mine. Only cleared boards count for the leaderboard.' : 'Tap to dig, long-press (or flag mode) to flag. Clear the board as fast as you can.'}
              onStart={start}
              label={state === 'lost' ? 'Try again' : 'Start'}
            />
          </div>
        )}
      </div>
      <div className="mt-4 inline-flex rounded-full bg-surface-2 p-1">
        <button onClick={() => setFlagMode(false)} className={cn('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium', !flagMode && 'bg-surface shadow-sm')}>
          <Pickaxe className="size-4" /> Dig
        </button>
        <button onClick={() => setFlagMode(true)} className={cn('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium', flagMode && 'bg-surface shadow-sm')}>
          <Flag className="size-4" /> Flag
        </button>
      </div>
      {state === 'won' && (
        <button onClick={start} className="mt-4 rounded-full px-6 py-2.5 font-semibold text-on-accent accent-gradient">
          Play again
        </button>
      )}
    </div>
  );
}
