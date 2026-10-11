import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { StartCard, useCountdown, type ArcadeProps } from './shared';

const SECONDS = 30;
const HOLES = 9;

interface Mole {
  id: number;
  hole: number;
  kind: 'mole' | 'gold' | 'bomb';
  until: number;
}

/** Thirty seconds of whacking. Moles +1, gold +3, bombs −3. They get quicker as you go. */
export default function Whack({ onGameOver }: ArcadeProps) {
  const [playing, setPlaying] = useState(false);
  const [moles, setMoles] = useState<Mole[]>([]);
  const [score, setScore] = useState(0);
  const [last, setLast] = useState<number | null>(null);
  const [pops, setPops] = useState<{ id: number; hole: number; text: string }[]>([]);
  const scoreRef = useRef(0);
  const nextId = useRef(1);
  const startedAt = useRef(0);

  const left = useCountdown(SECONDS, playing, () => {
    setPlaying(false);
    setMoles([]);
    const final = Math.max(0, scoreRef.current);
    setLast(final);
    onGameOver(final);
  });

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const progress = Math.min(1, (now - startedAt.current) / (SECONDS * 1000));
      setMoles((current) => {
        const alive = current.filter((m) => m.until > now);
        if (alive.length >= 3 || Math.random() > 0.55 + progress * 0.3) return alive;
        const free = Array.from({ length: HOLES }, (_, i) => i).filter((h) => !alive.some((m) => m.hole === h));
        const hole = free[Math.floor(Math.random() * free.length)];
        const r = Math.random();
        const kind = r < 0.12 ? 'gold' : r < 0.27 ? 'bomb' : 'mole';
        return [...alive, { id: nextId.current++, hole, kind, until: now + (1100 - progress * 550) * (kind === 'gold' ? 0.7 : 1) }];
      });
    }, 160);
    return () => clearInterval(timer);
  }, [playing]);

  function start() {
    scoreRef.current = 0;
    setScore(0);
    setMoles([]);
    startedAt.current = Date.now();
    setPlaying(true);
  }

  function whack(hole: number) {
    const mole = moles.find((m) => m.hole === hole && m.until > Date.now());
    if (!mole) return;
    const points = mole.kind === 'gold' ? 3 : mole.kind === 'bomb' ? -3 : 1;
    scoreRef.current += points;
    setScore(scoreRef.current);
    setMoles((ms) => ms.filter((m) => m.id !== mole.id));
    const pop = { id: mole.id, hole, text: points > 0 ? `+${points}` : `${points}` };
    setPops((p) => [...p, pop]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== pop.id)), 600);
    navigator.vibrate?.(mole.kind === 'bomb' ? 120 : 15);
  }

  if (!playing)
    return (
      <div className="mx-auto max-w-sm rounded-3xl bg-surface-2">
        <StartCard emoji="🔨" title={last !== null ? `${last} points` : 'Whack-a-mole'} hint="Tap moles for 1, golden ones for 3. Don't hit the bombs (−3). 30 seconds." onStart={start} label={last !== null ? 'Again' : 'Start'} />
      </div>
    );

  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex w-[330px] max-w-full justify-between font-display text-2xl tabular-nums">
        <span>{left}s</span>
        <span>{score}</span>
      </div>
      <div className="grid w-[330px] max-w-full grid-cols-3 gap-3 rounded-3xl bg-emerald-600/15 p-3">
        {Array.from({ length: HOLES }, (_, hole) => {
          const mole = moles.find((m) => m.hole === hole);
          const pop = pops.find((p) => p.hole === hole);
          return (
            <button key={hole} onPointerDown={() => whack(hole)} aria-label={`Hole ${hole + 1}`} className="relative aspect-square touch-none select-none overflow-hidden rounded-full bg-amber-900/70 shadow-inner">
              <AnimatePresence>
                {mole && (
                  <motion.span key={mole.id} initial={{ y: '90%' }} animate={{ y: '8%' }} exit={{ y: '90%' }} transition={{ duration: 0.12 }} className="absolute inset-0 grid place-items-center text-5xl">
                    {mole.kind === 'gold' ? '🌟' : mole.kind === 'bomb' ? '💣' : '🐹'}
                  </motion.span>
                )}
              </AnimatePresence>
              {pop && <span className="pointer-events-none absolute inset-0 grid animate-[float-up_0.6s_ease-out] place-items-center font-display text-2xl text-white drop-shadow">{pop.text}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
