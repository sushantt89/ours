import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { StartCard, useDirections, type ArcadeProps, type Dir } from './shared';

type Grid = number[][];
const empty = (): Grid => Array.from({ length: 4 }, () => [0, 0, 0, 0]);

function addTile(grid: Grid): Grid {
  const free: [number, number][] = [];
  grid.forEach((row, r) => row.forEach((v, c) => v === 0 && free.push([r, c])));
  if (!free.length) return grid;
  const [r, c] = free[Math.floor(Math.random() * free.length)];
  const next = grid.map((row) => row.slice());
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

/** Slides one row to the left, merging pairs. Returns the row and the points scored. */
function slideRow(row: number[]): [number[], number] {
  const tiles = row.filter(Boolean);
  const out: number[] = [];
  let points = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) {
      out.push(tiles[i] * 2);
      points += tiles[i] * 2;
      i++;
    } else out.push(tiles[i]);
  }
  while (out.length < 4) out.push(0);
  return [out, points];
}

const rotate = (g: Grid): Grid => g[0].map((_, c) => g.map((row) => row[c]).reverse()); // clockwise

function move(grid: Grid, dir: Dir): [Grid, number] {
  // Rotate so the move is "left", slide, rotate back.
  const turns = { left: 0, down: 1, right: 2, up: 3 }[dir];
  let g = grid;
  for (let i = 0; i < turns; i++) g = rotate(g);
  let points = 0;
  g = g.map((row) => {
    const [r, p] = slideRow(row);
    points += p;
    return r;
  });
  for (let i = 0; i < (4 - turns) % 4; i++) g = rotate(g);
  return [g, points];
}

const same = (a: Grid, b: Grid) => a.every((row, r) => row.every((v, c) => v === b[r][c]));
const canMove = (g: Grid) => (['left', 'right', 'up', 'down'] as Dir[]).some((d) => !same(move(g, d)[0], g));

const TILE: Record<number, string> = {
  2: 'bg-surface text-ink',
  4: 'bg-accent-soft text-ink',
  8: 'bg-orange-300 text-white',
  16: 'bg-orange-400 text-white',
  32: 'bg-rose-400 text-white',
  64: 'bg-rose-500 text-white',
  128: 'bg-amber-400 text-white',
  256: 'bg-amber-500 text-white',
  512: 'bg-pink-500 text-white',
  1024: 'bg-fuchsia-500 text-white',
  2048: 'bg-purple-600 text-white',
};

/** Slide tiles; matching numbers merge. Score = sum of merges. */
export default function Game2048({ onGameOver }: ArcadeProps) {
  const box = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<Grid>(empty);
  const [score, setScore] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scoreRef = useRef(0);

  const start = () => {
    const first = addTile(addTile(empty()));
    gridRef.current = first;
    setGrid(first);
    setScore(0);
    scoreRef.current = 0;
    setPlaying(true);
  };

  const gridRef = useRef<Grid>(grid);
  gridRef.current = grid;

  const onDir = useCallback(
    (dir: Dir) => {
      const g = gridRef.current;
      const [moved, points] = move(g, dir);
      if (same(moved, g)) return;
      const next = addTile(moved);
      gridRef.current = next;
      setGrid(next);
      scoreRef.current += points;
      setScore(scoreRef.current);
      if (!canMove(next)) {
        setPlaying(false);
        setTimeout(() => onGameOver(scoreRef.current), 400);
      }
    },
    [onGameOver],
  );
  useDirections(box, onDir, playing);

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{score.toLocaleString()}</p>
      <div ref={box} className="relative touch-none select-none rounded-3xl bg-surface-2 p-2.5">
        <div className="grid grid-cols-4 gap-2.5">
          {grid.flat().map((v, i) => (
            <div
              key={i}
              className={cn(
                'grid size-[72px] place-items-center rounded-2xl font-display font-semibold transition-all duration-100 sm:size-20',
                v ? (TILE[v] ?? 'bg-purple-800 text-white') : 'bg-line/50',
                v >= 1000 ? 'text-xl' : v >= 100 ? 'text-2xl' : 'text-3xl',
              )}
            >
              {v || ''}
            </div>
          ))}
        </div>
        {!playing && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-surface/90">
            <StartCard emoji="🔢" title="2048" hint="Swipe or use the arrow keys. Matching numbers merge. Reach 2048!" onStart={start} label={score ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
