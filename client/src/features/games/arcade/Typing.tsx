import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { shuffle, StartCard, useCountdown, type ArcadeProps } from './shared';
import { SCRAMBLE_WORDS } from './words';

const SECONDS = 30;

/** Type the words as fast as you can for 30 seconds. Score = words per minute (5 correct characters = 1 word). */
export default function Typing({ onGameOver }: ArcadeProps) {
  const [playing, setPlaying] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const correctChars = useRef(0);
  const [correctWords, setCorrectWords] = useState(0);
  const [lastWpm, setLastWpm] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const wpm = () => Math.round((correctChars.current / 5) * (60 / SECONDS));
  const left = useCountdown(SECONDS, playing, () => {
    setPlaying(false);
    const score = wpm();
    setLastWpm(score);
    onGameOver(score);
  });

  function start() {
    setWords(shuffle([...SCRAMBLE_WORDS, ...SCRAMBLE_WORDS]).slice(0, 150));
    setIndex(0);
    setTyped('');
    correctChars.current = 0;
    setCorrectWords(0);
    setPlaying(true);
    setTimeout(() => input.current?.focus(), 50);
  }

  function change(value: string) {
    if (!playing) return;
    if (value.endsWith(' ')) {
      const attempt = value.trim();
      if (!attempt) return setTyped('');
      if (attempt === words[index]) {
        correctChars.current += attempt.length + 1;
        setCorrectWords((n) => n + 1);
      } else navigator.vibrate?.(30);
      setIndex((i) => i + 1);
      setTyped('');
    } else setTyped(value.toLowerCase());
  }

  const visible = useMemo(() => words.slice(index, index + 14), [words, index]);
  const current = words[index] ?? '';
  const wrongSoFar = typed.length > 0 && !current.startsWith(typed);

  if (!playing)
    return (
      <div className="mx-auto max-w-sm rounded-3xl bg-surface-2">
        <StartCard
          emoji="⌨️"
          title={lastWpm !== null ? `${lastWpm} words a minute` : 'Typing race'}
          hint="Type each word and press space. 30 seconds. Only correct words count."
          onStart={start}
          label={lastWpm !== null ? 'Again' : 'Start'}
        />
      </div>
    );

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center">
      <div className="mb-3 flex w-full justify-between font-display text-2xl tabular-nums">
        <span>{left}s</span>
        <span>{correctWords} words</span>
      </div>
      <div className="mb-4 min-h-28 w-full rounded-3xl bg-surface p-4 text-lg leading-relaxed shadow-card">
        {visible.map((w, i) => (
          <span key={index + i} className={cn('mr-2 inline-block', i === 0 ? cn('rounded-md px-1 font-semibold', wrongSoFar ? 'bg-danger/20 text-danger' : 'bg-accent-soft text-accent') : 'text-muted')}>
            {w}
          </span>
        ))}
      </div>
      <input
        ref={input}
        value={typed}
        onChange={(e) => change(e.target.value)}
        aria-label="Type here"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className={cn('w-full rounded-2xl border-2 bg-surface px-4 py-3 text-center text-xl outline-none', wrongSoFar ? 'border-danger' : 'border-line focus:border-accent')}
        placeholder="type here, space to submit"
      />
    </div>
  );
}
