import { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { StartCard, type ArcadeProps } from './shared';

const N = 4;
const SOLVED = [...Array.from({ length: N * N - 1 }, (_, i) => i + 1), 0];

const neighbours = (i: number) => [i - N, i + N, i % N ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < N * N);

/** Shuffled by random legal moves from the solved board, so it's always solvable. */
function scramble(): number[] {
  const tiles = SOLVED.slice();
  let blank = tiles.length - 1;
  let prev = -1;
  for (let k = 0; k < 160; k++) {
    const options = neighbours(blank).filter((j) => j !== prev);
    const j = options[Math.floor(Math.random() * options.length)];
    [tiles[blank], tiles[j]] = [tiles[j], tiles[blank]];
    prev = blank;
    blank = j;
  }
  return tiles.every((t, i) => t === SOLVED[i]) ? scramble() : tiles;
}

/** Slide the tiles back into order. Fewest moves wins. */
export default function Slide({ onGameOver }: ArcadeProps) {
  const [tiles, setTiles] = useState<number[] | null>(null);
  const [moves, setMoves] = useState(0);
  const [last, setLast] = useState<number | null>(null);

  function tap(i: number) {
    if (!tiles) return;
    const blank = tiles.indexOf(0);
    if (!neighbours(blank).includes(i)) return;
    const next = tiles.slice();
    [next[blank], next[i]] = [next[i], next[blank]];
    const count = moves + 1;
    setMoves(count);
    if (next.every((t, k) => t === SOLVED[k])) {
      setTiles(null);
      setLast(count);
      onGameOver(count);
    } else setTiles(next);
  }

  function start() {
    setTiles(scramble());
    setMoves(0);
  }

  if (!tiles)
    return (
      <div className="mx-auto max-w-sm rounded-3xl bg-surface-2">
        <StartCard emoji="🧩" title={last !== null ? `Solved in ${last} moves` : '15-puzzle'} hint="Tap a tile next to the gap to slide it. Put 1 to 15 back in order in as few moves as you can." onStart={start} label={last !== null ? 'Again' : 'Start'} />
      </div>
    );

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 font-display text-2xl tabular-nums">{moves} moves</p>
      <div className="grid w-[320px] max-w-full grid-cols-4 gap-2 rounded-3xl bg-surface-2 p-2">
        {tiles.map((t, i) =>
          t === 0 ? (
            <div key="blank" className="aspect-square" />
          ) : (
            <motion.button
              layout
              transition={{ type: 'spring', stiffness: 600, damping: 40 }}
              key={t}
              onClick={() => tap(i)}
              aria-label={`Tile ${t}`}
              className={cn('grid aspect-square place-items-center rounded-2xl font-display text-3xl shadow-card', t === SOLVED[i] ? 'text-on-accent accent-gradient' : 'bg-surface')}
            >
              {t}
            </motion.button>
          ),
        )}
      </div>
      <button onClick={start} className="mt-4 text-sm font-medium text-muted underline-offset-2 hover:underline">
        New shuffle
      </button>
    </div>
  );
}
