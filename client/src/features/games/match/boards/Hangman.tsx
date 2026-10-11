import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button, Input } from '@/components/ui';
import type { BoardProps } from '../registry';

interface HangmanView {
  hint: string;
  length: number;
  pattern: string[];
  guessed: string[];
  wrong: number;
  maxWrong: number;
  word: string | null;
}

const PARTS = ['🙂', '👕', '💪', '🤚', '👖', '👟'];

export default function Hangman({ match, send, busy, partnerName }: BoardProps<HangmanView>) {
  const v = match.view;
  const guessing = match.seat === 1;
  const active = match.status === 'active' && guessing && !busy;
  const [solve, setSolve] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!solve.trim()) return;
    await send({ solve: solve.trim() });
    setSolve('');
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center">
      <div className="mb-3 flex gap-1 text-3xl" aria-label={`${v.wrong} of ${v.maxWrong} wrong`}>
        {PARTS.map((p, i) => (
          <span key={i} className={cn('transition', i < v.wrong ? 'opacity-100' : 'opacity-15 grayscale')}>
            {p}
          </span>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">
        {v.wrong}/{v.maxWrong} wrong{v.hint ? ` · Hint: ${v.hint}` : ''}
      </p>
      <div className="mb-5 flex flex-wrap justify-center gap-1.5">
        {v.pattern.map((ch, i) => (
          <span key={i} className={cn('grid h-12 w-9 place-items-end justify-center border-b-4 pb-1 font-display text-3xl uppercase', ch ? 'border-accent' : 'border-line')}>
            {ch}
          </span>
        ))}
      </div>
      {!guessing && match.status === 'active' && <p className="mb-3 text-sm text-muted">Your word is “{v.word}”. Watch {partnerName} guess…</p>}
      <div className="grid w-full grid-cols-9 gap-1.5">
        {'abcdefghijklmnopqrstuvwxyz'.split('').map((ch) => {
          const used = v.guessed.includes(ch);
          const good = used && v.pattern.includes(ch);
          return (
            <button
              key={ch}
              disabled={!active || used}
              onClick={() => send({ letter: ch })}
              className={cn('h-11 rounded-lg font-semibold uppercase transition active:scale-90', !used ? 'bg-surface-2' : good ? 'bg-success/80 text-white' : 'bg-zinc-400/60 text-white')}
            >
              {ch}
            </button>
          );
        })}
      </div>
      {active && (
        <form onSubmit={submit} className="mt-4 flex w-full gap-2">
          <Input value={solve} onChange={(e) => setSolve(e.target.value)} placeholder="Know it? Solve (wrong costs 2)" aria-label="Solve the word" autoCapitalize="none" className="flex-1" />
          <Button type="submit" disabled={!solve.trim()}>
            Solve
          </Button>
        </form>
      )}
    </div>
  );
}
