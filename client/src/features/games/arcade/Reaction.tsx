import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { StartCard, type ArcadeProps } from './shared';

const TRIES = 5;

/** Wait for green, then tap as fast as you can. Five tries; score = average in ms (lower is better). */
export default function Reaction({ onGameOver }: ArcadeProps) {
  const [phase, setPhase] = useState<'idle' | 'wait' | 'go' | 'early' | 'shown'>('idle');
  const [times, setTimes] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goAt = useRef(0);

  function arm() {
    setPhase('wait');
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      setPhase('go');
    }, 1200 + Math.random() * 2600);
  }

  function start() {
    setTimes([]);
    setLast(null);
    arm();
  }

  function tap() {
    if (phase === 'wait') {
      if (timer.current) clearTimeout(timer.current);
      navigator.vibrate?.(80);
      setPhase('early');
      return;
    }
    if (phase === 'early' || phase === 'shown') return arm();
    if (phase !== 'go') return;
    const ms = Math.round(performance.now() - goAt.current);
    const next = [...times, ms];
    setTimes(next);
    setLast(ms);
    if (next.length >= TRIES) {
      setPhase('idle');
      onGameOver(Math.round(next.reduce((a, b) => a + b, 0) / next.length));
    } else setPhase('shown');
  }

  const average = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{average !== null ? `${average} ms` : '–'}</p>
      <p className="mb-3 text-sm text-muted">
        Try {Math.min(times.length + (phase === 'idle' ? 0 : 1), TRIES)} of {TRIES}
      </p>
      {phase === 'idle' ? (
        <div className="w-[340px] max-w-full rounded-3xl bg-surface-2">
          <StartCard emoji="⚡" title="Reaction time" hint="When the box turns green, tap as fast as you can. Five tries, your average counts." onStart={start} label={times.length ? 'Play again' : 'Start'} />
        </div>
      ) : (
        <button
          onPointerDown={tap}
          className={cn(
            'grid aspect-square w-[340px] max-w-full touch-none select-none place-items-center rounded-3xl text-center text-white transition-colors',
            phase === 'wait' && 'bg-rose-500',
            phase === 'go' && 'bg-emerald-500',
            (phase === 'early' || phase === 'shown') && 'bg-sky-500',
          )}
        >
          <span>
            <span className="block font-display text-4xl">
              {phase === 'wait' ? 'Wait for green…' : phase === 'go' ? 'TAP!' : phase === 'early' ? 'Too soon!' : `${last} ms`}
            </span>
            {(phase === 'early' || phase === 'shown') && <span className="mt-2 block text-sm opacity-90">Tap to go again</span>}
          </span>
        </button>
      )}
    </div>
  );
}
