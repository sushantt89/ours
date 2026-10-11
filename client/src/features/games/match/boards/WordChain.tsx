import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button, Input } from '@/components/ui';
import type { BoardProps } from '../registry';

interface ChainView {
  chain: { word: string; by: 0 | 1 }[];
  gaveUp: 0 | 1 | null;
}

export default function WordChain({ match, send, busy, partnerName }: BoardProps<ChainView>) {
  const v = match.view;
  const [word, setWord] = useState('');
  const last = v.chain[v.chain.length - 1].word;
  const need = last.slice(-1).toUpperCase();
  const myTurn = match.turn === 'me' && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!word.trim()) return;
    // On a refused word, keep it so it can be fixed.
    if (await send({ word: word.trim() })) setWord('');
  }

  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-3 text-center text-sm text-muted">Each word must start with the last letter of the one before. No repeats. Stuck? Give up and they win.</p>
      <div className="mb-4 flex flex-wrap justify-center gap-1.5">
        {v.chain.map((w, i) => (
          <span key={i} className={cn('rounded-full px-3 py-1 font-medium', i === 0 ? 'bg-surface-2 text-muted' : w.by === match.seat ? 'bg-accent-soft' : 'bg-indigo-500/15')}>
            {w.word.slice(0, -1)}
            <b className="text-accent">{w.word.slice(-1)}</b>
          </span>
        ))}
      </div>
      <p className="mb-2 text-center font-display text-2xl">
        {match.status === 'done' ? `${v.chain.length - 1} words long` : myTurn ? `Your word starts with ${need}` : `${partnerName} needs a word starting with ${need}`}
      </p>
      {myTurn && (
        <>
          <form onSubmit={submit} className="flex gap-2">
            <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder={`${need}…`} aria-label="Your word" autoCapitalize="none" autoCorrect="off" className="flex-1" data-autofocus />
            <Button type="submit" disabled={!word.trim()}>
              Play
            </Button>
          </form>
          <Button variant="ghost" block className="mt-2 text-danger" onClick={() => send({ giveUp: true })}>
            I'm stuck, give up
          </Button>
        </>
      )}
    </div>
  );
}
