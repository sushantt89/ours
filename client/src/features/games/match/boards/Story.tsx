import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button, Textarea } from '@/components/ui';
import type { BoardProps } from '../registry';

interface StoryView {
  lines: { text: string; by: 0 | 1 | null }[];
  max: number;
}

export default function Story({ match, send, busy, partnerName }: BoardProps<StoryView>) {
  const v = match.view;
  const [line, setLine] = useState('');
  const myTurn = match.turn === 'me' && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!line.trim()) return;
    if (await send({ line: line.trim() })) setLine('');
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 rounded-3xl bg-surface p-5 font-display text-lg leading-relaxed shadow-card">
        {v.lines.map((l, i) => (
          <span key={i} className={cn(l.by === null ? 'italic text-muted' : l.by === match.seat ? 'text-ink' : 'text-indigo-600 dark:text-indigo-300')}>
            {l.text}{' '}
          </span>
        ))}
        {match.status === 'done' && <span className="mt-3 block text-center text-sm text-muted">— The end —</span>}
      </div>
      <p className="mb-3 text-center text-xs text-muted">
        {v.lines.length - 1} lines · your lines in black, {partnerName}'s in blue · up to {v.max}
      </p>
      {match.status === 'active' &&
        (myTurn ? (
          <form onSubmit={submit} className="space-y-2">
            <Textarea value={line} onChange={(e) => setLine(e.target.value)} placeholder="And then…" maxLength={160} rows={2} aria-label="Next line" data-autofocus />
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit" disabled={!line.trim()}>
                Add my line
              </Button>
              <Button type="button" variant="outline" disabled={v.lines.length < 5} onClick={() => send({ end: true })}>
                The end
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-center text-sm text-muted">{partnerName} is writing the next line…</p>
        ))}
    </div>
  );
}
