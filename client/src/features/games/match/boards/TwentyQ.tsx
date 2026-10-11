import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button, Input } from '@/components/ui';
import type { BoardProps } from '../registry';

interface TwentyView {
  secret: string | null;
  category: string;
  log: { text: string; guess: boolean; answer: 'yes' | 'no' | 'maybe' | 'right' | 'wrong' | null }[];
  max: number;
}
const ANSWER_LABEL = { yes: '👍 Yes', no: '👎 No', maybe: '🤷 Sort of', right: '🎉 Got it!', wrong: '❌ Nope' };

export default function TwentyQ({ match, send, busy, partnerName }: BoardProps<TwentyView>) {
  const v = match.view;
  const knows = match.seat === 0; // the one who chose the secret answers
  const [text, setText] = useState('');
  const pending = v.log[v.log.length - 1];
  const waitingForAnswer = Boolean(pending && pending.answer === null);
  const myTurn = match.turn === 'me' && !busy;

  async function ask(e: FormEvent, guess = false) {
    e.preventDefault();
    if (!text.trim()) return;
    if (await send(guess ? { guess: text.trim() } : { ask: text.trim() })) setText('');
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 rounded-3xl bg-surface-2 p-4 text-center">
        {knows ? (
          <>
            <p className="text-xs uppercase tracking-wider text-muted">Your secret</p>
            <p className="font-display text-2xl">{v.secret}</p>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider text-muted">{partnerName} is thinking of…</p>
            <p className="font-display text-2xl">{v.secret ?? (v.category ? `a ${v.category.toLowerCase()}` : 'something')}</p>
          </>
        )}
        <p className="mt-1 text-sm text-muted">
          {v.log.length}/{v.max} questions used
        </p>
      </div>
      <ul className="mb-4 space-y-2">
        {v.log.map((q, i) => (
          <li key={i} className={cn('flex items-start justify-between gap-3 rounded-2xl px-3.5 py-2.5', q.guess ? 'bg-accent-soft' : 'bg-surface')}>
            <span className="text-sm">
              <span className="text-muted">{i + 1}. </span>
              {q.guess ? <b>Is it {q.text}?</b> : q.text}
            </span>
            <span className="shrink-0 text-sm font-medium">{q.answer ? ANSWER_LABEL[q.answer] : '…'}</span>
          </li>
        ))}
      </ul>
      {match.status === 'active' &&
        (knows ? (
          myTurn && waitingForAnswer ? (
            pending.guess ? (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => send({ correct: true })}>🎉 That's it</Button>
                <Button variant="outline" onClick={() => send({ correct: false })}>
                  ❌ Nope
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(['yes', 'no', 'maybe'] as const).map((a) => (
                  <Button key={a} variant={a === 'yes' ? 'primary' : 'outline'} onClick={() => send({ answer: a })}>
                    {ANSWER_LABEL[a]}
                  </Button>
                ))}
              </div>
            )
          ) : (
            <p className="text-center text-sm text-muted">Waiting for {partnerName}'s next question…</p>
          )
        ) : myTurn ? (
          <form onSubmit={(e) => ask(e)} className="space-y-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Is it bigger than a breadbox?" aria-label="Your question or guess" maxLength={140} data-autofocus />
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit" disabled={!text.trim()}>
                Ask
              </Button>
              <Button type="button" variant="soft" disabled={!text.trim()} onClick={(e) => ask(e, true)}>
                Guess it
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-center text-sm text-muted">Waiting for {partnerName} to answer…</p>
        ))}
    </div>
  );
}
