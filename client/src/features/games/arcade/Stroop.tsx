import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { StartCard, useCountdown, type ArcadeProps } from './shared';

const SECONDS = 40;
const COLOURS = [
  { name: 'red', hex: '#e23b4e' },
  { name: 'blue', hex: '#3b6fe2' },
  { name: 'green', hex: '#2f9e5c' },
  { name: 'yellow', hex: '#e2b31b' },
  { name: 'purple', hex: '#8a4fd6' },
  { name: 'orange', hex: '#ef7a2a' },
];

function round() {
  const options = [...COLOURS].sort(() => Math.random() - 0.5).slice(0, 4);
  const ink = options[Math.floor(Math.random() * 4)];
  // Mostly the word names a different colour to the ink: that's the trap.
  const others = options.filter((c) => c !== ink);
  const word = Math.random() < 0.8 ? others[Math.floor(Math.random() * others.length)] : ink;
  return { options, ink, word };
}

/** Tap the colour the word is printed in, not the word itself. Right +1, wrong −1. */
export default function Stroop({ onGameOver }: ArcadeProps) {
  const [playing, setPlaying] = useState(false);
  const [r, setR] = useState(round);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const scoreRef = useRef(0);

  const left = useCountdown(SECONDS, playing, () => {
    setPlaying(false);
    const final = Math.max(0, scoreRef.current);
    setLast(final);
    onGameOver(final);
  });

  function start() {
    scoreRef.current = 0;
    setScore(0);
    setR(round());
    setPlaying(true);
  }

  function pick(name: string) {
    const good = name === r.ink.name;
    scoreRef.current += good ? 1 : -1;
    setScore(scoreRef.current);
    setFlash(good ? 'good' : 'bad');
    setTimeout(() => setFlash(null), 180);
    if (!good) navigator.vibrate?.(60);
    setR(round());
  }

  if (!playing)
    return (
      <div className="mx-auto max-w-sm rounded-3xl bg-surface-2">
        <StartCard emoji="🎨" title={last !== null ? `${last} points` : 'Colour trap'} hint="A colour word appears in some ink. Tap the INK colour, not what the word says. 40 seconds." onStart={start} label={last !== null ? 'Again' : 'Start'} />
      </div>
    );

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center">
      <div className="mb-3 flex w-full justify-between font-display text-2xl tabular-nums">
        <span>{left}s</span>
        <span>{score}</span>
      </div>
      <div className={cn('mb-5 grid h-40 w-full place-items-center rounded-3xl bg-surface shadow-card transition-colors', flash === 'good' && 'bg-success/15', flash === 'bad' && 'bg-danger/15')}>
        <span className="font-display text-6xl font-bold uppercase tracking-wide" style={{ color: r.ink.hex }}>
          {r.word.name}
        </span>
      </div>
      <div className="grid w-full grid-cols-2 gap-3">
        {r.options.map((c) => (
          <button key={c.name} onClick={() => pick(c.name)} className="h-16 rounded-2xl border border-line bg-surface text-lg font-semibold capitalize shadow-card active:scale-95">
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
