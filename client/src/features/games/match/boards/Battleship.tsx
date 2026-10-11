import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import type { BoardProps } from '../registry';

interface Ship {
  r: number;
  c: number;
  len: number;
  dir: 'h' | 'v';
}
interface Shot {
  r: number;
  c: number;
  hit: boolean;
}
interface BattleView {
  size: number;
  fleet: number[];
  placed: [boolean, boolean];
  myShips: Ship[] | null;
  incoming: Shot[];
  outgoing: Shot[];
  sunk: Ship[];
  last: [number, number] | null;
}

const cellsOf = (s: Ship) => Array.from({ length: s.len }, (_, i) => (s.dir === 'h' ? `${s.r},${s.c + i}` : `${s.r + i},${s.c}`));

function randomFleet(fleet: number[], size: number): Ship[] {
  for (;;) {
    const used = new Set<string>();
    const ships: Ship[] = [];
    let ok = true;
    for (const len of fleet) {
      let placed = false;
      for (let tries = 0; tries < 100 && !placed; tries++) {
        const dir = Math.random() < 0.5 ? 'h' : 'v';
        const r = Math.floor(Math.random() * (dir === 'v' ? size - len + 1 : size));
        const c = Math.floor(Math.random() * (dir === 'h' ? size - len + 1 : size));
        const ship = { r, c, len, dir } as Ship;
        // Leave a gap around ships so they never touch.
        const near = cellsOf(ship).flatMap((k) => {
          const [y, x] = k.split(',').map(Number);
          return [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => `${y + dy},${x + dx}`));
        });
        if (near.some((k) => used.has(k))) continue;
        cellsOf(ship).forEach((k) => used.add(k));
        ships.push(ship);
        placed = true;
      }
      if (!placed) ok = false;
    }
    if (ok) return ships;
  }
}

function Sea({
  size,
  label,
  ships,
  shots,
  onFire,
  last,
  small,
}: {
  size: number;
  label: string;
  ships: Ship[];
  shots: Shot[];
  onFire?: (r: number, c: number) => void;
  last?: [number, number] | null;
  small?: boolean;
}) {
  const shipCells = new Set(ships.flatMap(cellsOf));
  const shotAt = new Map(shots.map((s) => [`${s.r},${s.c}`, s.hit]));
  return (
    <div>
      <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className={cn('grid gap-[3px] rounded-2xl bg-sky-900/80 p-1.5', small ? 'w-[200px]' : 'w-[320px] max-w-full')} style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: size * size }, (_, i) => {
          const r = Math.floor(i / size);
          const c = i % size;
          const key = `${r},${c}`;
          const shot = shotAt.get(key);
          return (
            <button
              key={key}
              disabled={!onFire || shot !== undefined}
              onClick={() => onFire?.(r, c)}
              aria-label={`Row ${r + 1} column ${c + 1}${shot === undefined ? '' : shot ? ', hit' : ', miss'}`}
              className={cn(
                'grid aspect-square place-items-center rounded-[4px] text-[10px] transition',
                shipCells.has(key) ? 'bg-slate-400' : 'bg-sky-500/70',
                onFire && shot === undefined && 'hover:bg-sky-300 active:scale-90',
                last?.[0] === r && last?.[1] === c && 'ring-2 ring-white',
              )}
            >
              {shot === true ? '💥' : shot === false ? <span className="size-1.5 rounded-full bg-white/80" /> : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Battleship({ match, send, busy, partnerName }: BoardProps<BattleView>) {
  const v = match.view;
  const [draft, setDraft] = useState<Ship[]>(() => randomFleet(v.fleet, v.size));
  const iPlaced = v.placed[match.seat];
  const theyPlaced = v.placed[match.seat === 0 ? 1 : 0];
  const hitsOnThem = useMemo(() => v.outgoing.filter((s) => s.hit).length, [v.outgoing]);
  const total = v.fleet.reduce((a, b) => a + b, 0);

  if (!iPlaced) {
    return (
      <div className="flex flex-col items-center">
        <p className="mb-3 max-w-xs text-center text-sm text-muted">Here's your fleet. Shuffle until you like it, then lock it in. {partnerName} won't see it.</p>
        <Sea size={v.size} label="Your fleet" ships={draft} shots={[]} />
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => setDraft(randomFleet(v.fleet, v.size))}>
            <Shuffle className="size-4" /> Shuffle
          </Button>
          <Button loading={busy} onClick={() => send({ place: draft })}>
            Lock in my fleet
          </Button>
        </div>
      </div>
    );
  }
  if (!theyPlaced) {
    return (
      <div className="flex flex-col items-center">
        <p className="mb-3 text-sm text-muted">Waiting for {partnerName} to place their fleet…</p>
        <Sea size={v.size} label="Your fleet" ships={v.myShips ?? []} shots={v.incoming} small />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <Sea size={v.size} label={`${partnerName}'s waters`} ships={v.sunk} shots={v.outgoing} onFire={match.turn === 'me' && !busy ? (r, c) => send({ fire: [r, c] }) : undefined} />
        <p className="mt-1.5 text-xs text-muted">
          {hitsOnThem}/{total} hits · {v.sunk.length}/{v.fleet.length} ships sunk
        </p>
      </div>
      <Sea size={v.size} label="Your fleet" ships={v.myShips ?? []} shots={v.incoming} last={v.incoming.length ? [v.incoming[v.incoming.length - 1].r, v.incoming[v.incoming.length - 1].c] : null} small />
    </div>
  );
}
