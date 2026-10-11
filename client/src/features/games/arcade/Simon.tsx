import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { StartCard, type ArcadeProps } from './shared';

const PADS = [
  { color: 'bg-rose-500', lit: 'bg-rose-300', tone: 330 },
  { color: 'bg-amber-400', lit: 'bg-amber-200', tone: 392 },
  { color: 'bg-emerald-500', lit: 'bg-emerald-300', tone: 494 },
  { color: 'bg-sky-500', lit: 'bg-sky-300', tone: 587 },
];

let audio: AudioContext | null = null;
function beep(freq: number, ms = 220) {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + ms / 1000);
  } catch {
    /* sound is optional */
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Watch the sequence, repeat it. It grows by one each round. Score = rounds completed. */
export default function Simon({ onGameOver }: ArcadeProps) {
  const [lit, setLit] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'showing' | 'input'>('idle');
  const [round, setRound] = useState(0);
  const seq = useRef<number[]>([]);
  const step = useRef(0);

  async function show(sequence: number[]) {
    setPhase('showing');
    await wait(500);
    const speed = Math.max(220, 520 - sequence.length * 18);
    for (const pad of sequence) {
      setLit(pad);
      beep(PADS[pad].tone, speed);
      await wait(speed);
      setLit(null);
      await wait(120);
    }
    step.current = 0;
    setPhase('input');
  }

  function start() {
    seq.current = [Math.floor(Math.random() * 4)];
    setRound(0);
    void show(seq.current);
  }

  function press(pad: number) {
    if (phase !== 'input') return;
    beep(PADS[pad].tone, 160);
    setLit(pad);
    setTimeout(() => setLit(null), 140);
    if (seq.current[step.current] !== pad) {
      navigator.vibrate?.(200);
      setPhase('idle');
      onGameOver(seq.current.length - 1);
      return;
    }
    step.current++;
    if (step.current === seq.current.length) {
      setRound(seq.current.length);
      seq.current = [...seq.current, Math.floor(Math.random() * 4)];
      void show(seq.current);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{round}</p>
      <p className="mb-3 h-5 text-sm text-muted">{phase === 'showing' ? 'Watch…' : phase === 'input' ? 'Your turn' : ''}</p>
      <div className="relative">
        <div className="grid grid-cols-2 gap-3 rounded-[36px] bg-surface-2 p-3">
          {PADS.map((p, i) => (
            <button
              key={i}
              aria-label={`Pad ${i + 1}`}
              onPointerDown={() => press(i)}
              className={cn('size-32 rounded-[28px] transition-all duration-100 sm:size-36', lit === i ? `${p.lit} scale-95 shadow-[0_0_30px_rgba(255,255,255,0.7)]` : p.color, phase !== 'input' && 'cursor-default')}
            />
          ))}
        </div>
        {phase === 'idle' && (
          <div className="absolute inset-0 grid place-items-center rounded-[36px] bg-surface/90">
            <StartCard emoji="🎵" title="Simon says" hint="Watch the colours light up, then repeat the pattern. One more each round." onStart={start} label={round ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
