import { useRef, useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { shuffle, StartCard, useCountdown, type ArcadeProps } from './shared';
import { SCRAMBLE_WORDS } from './words';

const ROUND = 60;

function scramble(word: string) {
  if (word.length < 2) return word;
  let out = word;
  while (out === word) out = shuffle(word.split('')).join('');
  return out;
}

/** 60 seconds to unscramble as many words as you can. Score = letters in words solved. */
export default function Scramble({ onGameOver }: ArcadeProps) {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [word, setWord] = useState('');
  const [jumbled, setJumbled] = useState('');
  const [guess, setGuess] = useState('');
  const [wrong, setWrong] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);
  const scoreRef = useRef(0);
  const used = useRef(new Set<string>());
  const input = useRef<HTMLInputElement>(null);

  const finish = () => {
    setPlaying(false);
    onGameOver(scoreRef.current);
  };
  const left = useCountdown(ROUND, playing, finish);

  function nextWord() {
    const options = SCRAMBLE_WORDS.filter((w) => !used.current.has(w));
    const w = options[Math.floor(Math.random() * options.length)] ?? 'love';
    used.current.add(w);
    setWord(w);
    setJumbled(scramble(w));
    setGuess('');
  }

  function start() {
    scoreRef.current = 0;
    used.current = new Set();
    setScore(0);
    setSolved([]);
    nextWord();
    setPlaying(true);
    setTimeout(() => input.current?.focus(), 50);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (guess.trim().toLowerCase() === word) {
      scoreRef.current += word.length;
      setScore(scoreRef.current);
      setSolved((s) => [word, ...s]);
      navigator.vibrate?.(15);
      nextWord();
    } else {
      setWrong(true);
      navigator.vibrate?.(60);
      setTimeout(() => setWrong(false), 350);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center">
      <div className="mb-2 flex w-full items-center justify-between font-display text-3xl tabular-nums">
        <span>{score}</span>
        <span className={left <= 10 && playing ? 'text-danger' : 'text-muted'}>{playing ? `${left}s` : ''}</span>
      </div>
      {!playing ? (
        <div className="w-full rounded-3xl bg-surface-2">
          <StartCard emoji="🔤" title="Word scramble" hint="Unscramble as many words as you can in 60 seconds. Longer words score more." onStart={start} label={score ? 'Play again' : 'Start'} />
          {solved.length > 0 && <p className="px-6 pb-6 text-center text-sm text-muted">Last round: {solved.join(', ')}</p>}
        </div>
      ) : (
        <div className="w-full">
          <div className={cn('mb-4 flex flex-wrap justify-center gap-2', wrong && 'animate-[shake-x_300ms]')}>
            {jumbled.split('').map((ch, i) => (
              <span key={i} className="grid size-12 place-items-center rounded-2xl bg-surface font-display text-2xl uppercase shadow-card">
                {ch}
              </span>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <input
              ref={input}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-label="Your answer"
              placeholder="Type the word"
              className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-5 text-lg outline-none focus:border-accent"
            />
            <button className="rounded-full px-5 font-semibold text-on-accent accent-gradient">Go</button>
          </form>
          <button type="button" onClick={nextWord} className="mt-3 w-full text-sm font-medium text-muted">
            Skip this one
          </button>
          {solved.length > 0 && <p className="mt-4 text-center text-sm text-muted">✓ {solved.join(' · ')}</p>}
        </div>
      )}
    </div>
  );
}
