import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { shuffle, StartCard, type ArcadeProps } from './shared';

const FACES = ['❤️', '🌹', '💌', '🧸', '🍓', '🌙', '⭐', '🎁', '🍫', '🎈', '🌻', '🦋', '🍰', '💍', '🐶', '🎵'];

interface Card {
  id: number;
  face: string;
  open: boolean;
  matched: boolean;
}

/** Flip two cards at a time to find all 8 pairs. Score = moves (lower is better). */
export default function Memory({ onGameOver }: ArcadeProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [moves, setMoves] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lock = useRef(false);

  function start() {
    const faces = shuffle(FACES).slice(0, 8);
    setCards(shuffle([...faces, ...faces]).map((face, id) => ({ id, face, open: false, matched: false })));
    setMoves(0);
    setPlaying(true);
  }

  function flip(card: Card) {
    if (!playing || lock.current || card.open || card.matched) return;
    const next = cards.map((c) => (c.id === card.id ? { ...c, open: true } : c));
    const open = next.filter((c) => c.open && !c.matched);
    setCards(next);
    if (open.length < 2) return;

    const turn = moves + 1;
    setMoves(turn);
    lock.current = true;
    const [a, b] = open;
    if (a.face === b.face) {
      navigator.vibrate?.(20);
      const done = next.map((c) => (c.id === a.id || c.id === b.id ? { ...c, matched: true } : c));
      setCards(done);
      lock.current = false;
      if (done.every((c) => c.matched)) {
        setPlaying(false);
        setTimeout(() => onGameOver(turn), 500);
      }
    } else {
      setTimeout(() => {
        setCards((cs) => cs.map((c) => (c.id === a.id || c.id === b.id ? { ...c, open: false } : c)));
        lock.current = false;
      }, 750);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{moves} {moves === 1 ? "move" : "moves"}</p>
      <div className="relative">
        <div className="grid grid-cols-4 gap-2.5 rounded-3xl bg-surface-2 p-3">
          {(cards.length ? cards : Array.from({ length: 16 }, (_, id) => ({ id, face: '', open: false, matched: false }))).map((c) => (
            <button
              key={c.id}
              onClick={() => flip(c)}
              aria-label={c.open || c.matched ? c.face : 'Hidden card'}
              className={cn(
                'grid size-[72px] place-items-center rounded-2xl text-4xl transition-all duration-300 [transform-style:preserve-3d] sm:size-20',
                c.open || c.matched ? 'bg-surface [transform:rotateY(0deg)]' : 'accent-gradient [transform:rotateY(180deg)]',
                c.matched && 'opacity-60',
              )}
            >
              {c.open || c.matched ? c.face : ''}
            </button>
          ))}
        </div>
        {!playing && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-surface/90">
            <StartCard emoji="🃏" title="Memory match" hint="Find all 8 pairs in as few moves as you can." onStart={start} label={moves ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
