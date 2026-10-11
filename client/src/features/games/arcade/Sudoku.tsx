import { useEffect, useMemo, useState } from 'react';
import { Eraser } from 'lucide-react';
import { cn } from '@/lib/cn';
import { shuffle, StartCard, type ArcadeProps } from './shared';

type Grid = number[]; // 81 cells, 0 = empty

const row = (i: number) => Math.floor(i / 9);
const col = (i: number) => i % 9;
const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
const PEERS = Array.from({ length: 81 }, (_, i) => Array.from({ length: 81 }, (_, j) => j).filter((j) => j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))));

const fits = (g: Grid, i: number, n: number) => PEERS[i].every((j) => g[j] !== n);

/** Fills the grid with a random valid solution. */
function fill(g: Grid): boolean {
  const i = g.indexOf(0);
  if (i < 0) return true;
  for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (fits(g, i, n)) {
      g[i] = n;
      if (fill(g)) return true;
      g[i] = 0;
    }
  }
  return false;
}

/** Counts solutions, stopping at 2: we only need to know the answer is unique. */
function count(g: Grid, limit = 2): number {
  const i = g.indexOf(0);
  if (i < 0) return 1;
  let total = 0;
  for (let n = 1; n <= 9 && total < limit; n++) {
    if (fits(g, i, n)) {
      g[i] = n;
      total += count(g, limit - total);
      g[i] = 0;
    }
  }
  return total;
}

const LEVELS = { easy: 40, medium: 32 } as const;

function makePuzzle(givens: number) {
  const solution: Grid = Array(81).fill(0);
  fill(solution);
  const puzzle = solution.slice();
  let filled = 81;
  for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k))) {
    if (filled <= givens) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (count(puzzle.slice()) !== 1) puzzle[i] = keep;
    else filled--;
  }
  return { puzzle, solution };
}

/** Classic 9×9 sudoku. Score = seconds taken (lower is better); each mistake adds 10. */
export default function Sudoku({ onGameOver }: ArcadeProps) {
  const [game, setGame] = useState<{ puzzle: Grid; solution: Grid } | null>(null);
  const [cells, setCells] = useState<Grid>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [last, setLast] = useState<number | null>(null);

  useEffect(() => {
    if (!game) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [game]);

  function start(level: keyof typeof LEVELS) {
    const g = makePuzzle(LEVELS[level]);
    setGame(g);
    setCells(g.puzzle.slice());
    setSelected(null);
    setMistakes(0);
    setStartedAt(Date.now());
    setNow(Date.now());
  }

  function enter(n: number) {
    if (!game || selected === null || game.puzzle[selected]) return;
    const next = cells.slice();
    next[selected] = n;
    setCells(next);
    if (n && n !== game.solution[selected]) {
      setMistakes((m) => m + 1);
      navigator.vibrate?.(60);
    }
    if (next.every((v, i) => v === game.solution[i])) {
      const seconds = Math.max(20, Math.round((Date.now() - startedAt) / 1000) + mistakes * 10);
      setGame(null);
      setLast(seconds);
      onGameOver(seconds);
    }
  }

  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) enter(Number(e.key));
      else if (e.key === 'Backspace' || e.key === '0') enter(0);
      else if (selected !== null && e.key.startsWith('Arrow')) {
        const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
        setSelected((s) => Math.min(80, Math.max(0, (s ?? 0) + d)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remaining = useMemo(() => {
    const counts = Array(10).fill(9);
    cells.forEach((v, i) => game && v && v === game.solution[i] && counts[v]--);
    return counts;
  }, [cells, game]);

  if (!game)
    return (
      <div className="mx-auto max-w-sm rounded-3xl bg-surface-2">
        <StartCard emoji="9️⃣" title={last !== null ? `Solved in ${last}s` : 'Sudoku'} hint="Fill every row, column and box with 1 to 9. Fastest time wins; each mistake adds 10 seconds." onStart={() => start('easy')} label="Easy" />
        <div className="-mt-6 pb-8 text-center">
          <button onClick={() => start('medium')} className="text-sm font-semibold text-accent">
            or try Medium
          </button>
        </div>
      </div>
    );

  const sel = selected;
  const selValue = sel !== null ? cells[sel] : 0;
  const elapsed = Math.round((now - startedAt) / 1000);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center">
      <div className="mb-3 flex w-full justify-between font-display text-2xl tabular-nums">
        <span>
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </span>
        <span className="text-base text-muted">{mistakes ? `${mistakes} mistake${mistakes > 1 ? 's' : ''} (+${mistakes * 10}s)` : 'No mistakes'}</span>
      </div>
      <div className="grid w-full grid-cols-9 overflow-hidden rounded-2xl border-2 border-ink/70 bg-surface">
        {cells.map((v, i) => {
          const given = Boolean(game.puzzle[i]);
          const wrong = v !== 0 && v !== game.solution[i];
          const related = sel !== null && (row(i) === row(sel) || col(i) === col(sel) || box(i) === box(sel));
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              aria-label={`Row ${row(i) + 1} column ${col(i) + 1}${v ? `, ${v}` : ''}`}
              className={cn(
                'grid aspect-square place-items-center text-lg tabular-nums',
                col(i) % 3 === 2 && col(i) < 8 ? 'border-r-2 border-r-ink/70' : 'border-r border-r-line',
                row(i) % 3 === 2 && row(i) < 8 ? 'border-b-2 border-b-ink/70' : 'border-b border-b-line',
                given ? 'font-bold' : 'font-medium text-accent',
                wrong && 'text-danger',
                related && 'bg-accent-soft/50',
                v !== 0 && v === selValue && 'bg-accent-soft',
                sel === i && 'bg-accent/30',
              )}
            >
              {v || ''}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid w-full grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} disabled={remaining[n] === 0} onClick={() => enter(n)} className="h-12 rounded-xl bg-surface-2 font-display text-2xl active:scale-95 disabled:opacity-25">
            {n}
          </button>
        ))}
        <button onClick={() => enter(0)} aria-label="Erase" className="grid h-12 place-items-center rounded-xl bg-surface-2 active:scale-95">
          <Eraser className="size-5" />
        </button>
      </div>
    </div>
  );
}
