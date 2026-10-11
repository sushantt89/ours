import { useEffect, useRef, useState } from 'react';
import { StartCard, useCountdown, type ArcadeProps } from './shared';

const ROUND = 30;
interface Target {
  id: number;
  x: number;
  y: number;
  kind: 'heart' | 'gold' | 'broken';
  born: number;
  life: number;
}
const POINTS = { heart: 1, gold: 3, broken: -3 };
const EMOJI = { heart: '❤️', gold: '💛', broken: '💔' };

/** 30 seconds: tap hearts as they pop up, gold ones are worth more, avoid the broken ones. */
export default function TapHearts({ onGameOver }: ArcadeProps) {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const scoreRef = useRef(0);
  const nextId = useRef(1);
  const startedAt = useRef(0);

  const finish = () => {
    setPlaying(false);
    setTargets([]);
    onGameOver(Math.max(0, scoreRef.current));
  };
  const left = useCountdown(ROUND, playing, finish);

  useEffect(() => {
    if (!playing) return;
    const spawn = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - startedAt.current) / 1000;
      const r = Math.random();
      const kind: Target['kind'] = r < 0.12 ? 'gold' : r < 0.32 ? 'broken' : 'heart';
      setTargets((ts) => [
        ...ts.filter((t) => now - t.born < t.life),
        { id: nextId.current++, x: 8 + Math.random() * 78, y: 8 + Math.random() * 78, kind, born: now, life: Math.max(650, 1500 - elapsed * 25) },
      ]);
    }, 420);
    const sweep = setInterval(() => setTargets((ts) => ts.filter((t) => Date.now() - t.born < t.life)), 150);
    return () => {
      clearInterval(spawn);
      clearInterval(sweep);
    };
  }, [playing]);

  function start() {
    scoreRef.current = 0;
    setScore(0);
    setTargets([]);
    startedAt.current = Date.now();
    setPlaying(true);
  }

  function hit(t: Target) {
    setTargets((ts) => ts.filter((x) => x.id !== t.id));
    scoreRef.current += POINTS[t.kind];
    setScore(scoreRef.current);
    navigator.vibrate?.(t.kind === 'broken' ? 60 : 8);
    const pop = { id: t.id, x: t.x, y: t.y, text: POINTS[t.kind] > 0 ? `+${POINTS[t.kind]}` : `${POINTS[t.kind]}` };
    setPops((p) => [...p, pop]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== pop.id)), 500);
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full max-w-[340px] items-center justify-between font-display text-3xl tabular-nums">
        <span>{score}</span>
        <span className={left <= 5 && playing ? 'text-danger' : 'text-muted'}>{playing ? `${left}s` : ''}</span>
      </div>
      <div className="relative aspect-[3/4] w-[340px] max-w-full touch-none select-none overflow-hidden rounded-3xl border border-line bg-surface-2">
        {targets.map((t) => (
          <button
            key={t.id}
            onPointerDown={() => hit(t)}
            aria-label={t.kind}
            className="absolute grid size-14 -translate-x-1/2 -translate-y-1/2 animate-[pop-in_160ms_ease-out] place-items-center text-4xl"
            style={{ left: `${t.x}%`, top: `${t.y}%` }}
          >
            {EMOJI[t.kind]}
          </button>
        ))}
        {pops.map((p) => (
          <span key={p.id} className="pointer-events-none absolute -translate-x-1/2 animate-[float-up_500ms_ease-out_forwards] font-display text-xl font-bold text-accent" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {p.text}
          </span>
        ))}
        {!playing && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <StartCard emoji="💛" title="Tap the hearts" hint="30 seconds. Tap ❤️ +1 and 💛 +3. Avoid 💔 −3." onStart={start} label={score ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
