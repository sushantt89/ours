import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { shuffle, StartCard, useCountdown, type ArcadeProps } from './shared';

const ROUND = 60;

interface Problem {
  text: string;
  answer: number;
  options: number[];
}

/** Gets a little harder the more you solve. */
function makeProblem(level: number): Problem {
  const r = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const big = Math.min(12 + level * 4, 99);
  const op = ['+', '−', '×', '÷'][r(0, level < 4 ? 1 : 3)];
  let a = r(2, big);
  let b = r(2, big);
  let answer: number;
  if (op === '+') answer = a + b;
  else if (op === '−') {
    if (b > a) [a, b] = [b, a];
    answer = a - b;
  } else if (op === '×') {
    a = r(2, Math.min(12, 4 + level));
    b = r(2, 12);
    answer = a * b;
  } else {
    b = r(2, Math.min(12, 4 + level));
    answer = r(2, 12);
    a = b * answer;
  }
  const near = new Set([answer]);
  while (near.size < 4) near.add(Math.max(0, answer + r(-10, 10)));
  return { text: `${a} ${op} ${b}`, answer, options: shuffle([...near]) };
}

/** 60 seconds of quick sums. Score = correct answers. */
export default function MathSprint({ onGameOver }: ArcadeProps) {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [problem, setProblem] = useState<Problem>(() => makeProblem(0));
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const scoreRef = useRef(0);

  const finish = () => {
    setPlaying(false);
    onGameOver(scoreRef.current);
  };
  const left = useCountdown(ROUND, playing, finish);

  function start() {
    scoreRef.current = 0;
    setScore(0);
    setProblem(makeProblem(0));
    setPlaying(true);
  }

  function answer(n: number) {
    if (!playing) return;
    const right = n === problem.answer;
    if (right) {
      scoreRef.current++;
      setScore(scoreRef.current);
    }
    navigator.vibrate?.(right ? 8 : 60);
    setFlash(right ? 'right' : 'wrong');
    setTimeout(() => setFlash(null), 180);
    setProblem(makeProblem(Math.floor(scoreRef.current / 4)));
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center">
      <div className="mb-2 flex w-full items-center justify-between font-display text-3xl tabular-nums">
        <span>{score}</span>
        <span className={left <= 10 && playing ? 'text-danger' : 'text-muted'}>{playing ? `${left}s` : ''}</span>
      </div>
      {!playing ? (
        <div className="w-full rounded-3xl bg-surface-2">
          <StartCard emoji="➗" title="Math sprint" hint="60 seconds of quick sums. It gets harder as you go." onStart={start} label={score ? 'Play again' : 'Start'} />
        </div>
      ) : (
        <div className="w-full">
          <div className={cn('mb-5 rounded-3xl py-10 text-center font-display text-5xl tabular-nums transition-colors', flash === 'right' ? 'bg-success/20' : flash === 'wrong' ? 'bg-danger/20' : 'bg-surface-2')}>
            {problem.text}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {problem.options.map((n) => (
              <button key={n} onClick={() => answer(n)} className="rounded-2xl border border-line bg-surface py-5 font-display text-3xl tabular-nums shadow-card active:scale-95">
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
