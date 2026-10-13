import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Delete, Shuffle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import type { BoardProps } from '../registry';

interface RaceView {
  letters: string;
  durationMs: number;
  startedAt: number | null;
  finished: boolean;
  mine: string[];
  myPoints: number;
  theirCount: number;
  theirPoints: number;
  theirFinished: boolean;
  theirWords: string[] | null;
  possibleCount: number | null;
  missed: string[] | null;
}

const wordPoints = (w: string, n: number) => (w.length <= 3 ? 1 : w.length - 2) + (w.length === n ? 5 : 0);

/** Same seven letters on both phones; find as many words as you can in two minutes. */
export default function WordRace({ match, send, busy, partnerName }: BoardProps<RaceView>) {
  const v = match.view;
  const [order, setOrder] = useState(() => [...v.letters].map((_, i) => i));
  const [picked, setPicked] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const finishing = useRef(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const active = match.status === 'active' && v.startedAt !== null && !v.finished;
  const left = v.startedAt ? Math.max(0, Math.ceil((v.startedAt + v.durationMs - now) / 1000)) : Math.round(v.durationMs / 1000);
  const word = picked.map((i) => v.letters[i]).join('');

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);

  // When the clock runs out, close your round so the result can be worked out.
  useEffect(() => {
    if (active && left === 0 && !finishing.current) {
      finishing.current = true;
      void send({ finish: true });
    }
  }, [active, left, send]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') void submit();
      else if (e.key === 'Backspace') setPicked((p) => p.slice(0, -1));
      else if (/^[a-z]$/i.test(e.key)) {
        const ch = e.key.toLowerCase();
        setPicked((p) => {
          const i = [...v.letters].findIndex((l, k) => l === ch && !p.includes(k));
          return i < 0 ? p : [...p, i];
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (word.length < 3 || busy) return;
    const tried = word;
    setPicked([]);
    const ok = await send({ word: tried }, { onError: (text) => setNote({ text, good: false }) });
    if (ok) setNote({ text: `+${wordPoints(tried, v.letters.length)} ${tried}`, good: true });
    else navigator.vibrate?.(60);
  }

  const found = useMemo(() => [...v.mine].reverse(), [v.mine]);

  if (match.status === 'active' && v.startedAt === null)
    return (
      <div className="mx-auto max-w-sm text-center">
        <p className="mb-2 text-sm text-muted">Same 7 letters on both phones. Make as many words of 3+ letters as you can in 2 minutes. Longer words score more; all 7 letters earns +5.</p>
        <p className="mb-4 text-sm">
          {partnerName}: {v.theirCount > 0 || v.theirFinished ? `${v.theirPoints} points so far` : 'not started yet'}
        </p>
        <Button size="lg" onClick={() => send({ start: true })} loading={busy}>
          Start my 2 minutes
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 grid grid-cols-3 items-end text-center">
        <div>
          <p className="font-display text-3xl tabular-nums">{v.myPoints}</p>
          <p className="text-xs text-muted">You · {v.mine.length} word{v.mine.length === 1 ? "" : "s"}</p>
        </div>
        <p className={cn('font-display text-4xl tabular-nums', active && left <= 10 && 'text-danger')}>{active ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '⏱️'}</p>
        <div>
          <p className="font-display text-3xl tabular-nums text-indigo-500">{v.theirPoints}</p>
          <p className="text-xs text-muted">
            {partnerName} · {v.theirFinished ? 'done' : `${v.theirCount} word${v.theirCount === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {active ? (
        <>
          <form onSubmit={submit} className="mb-3 flex h-14 items-center justify-center rounded-2xl bg-surface text-3xl font-semibold uppercase tracking-[0.2em] shadow-card">
            {word || <span className="text-base font-normal normal-case tracking-normal text-faint">tap letters</span>}
          </form>
          {v.possibleCount !== null && (
            <p className="-mt-1 mb-1 text-center text-xs text-muted">
              Found {v.mine.length} of {v.possibleCount}+ everyday words
            </p>
          )}
          <p className={cn('-mt-1 mb-2 h-5 text-center text-sm font-medium', note?.good ? 'text-success' : 'text-danger')}>{note?.text}</p>
          <div className="mb-3 flex justify-center gap-1.5">
            {order.map((i) => (
              <button
                key={i}
                disabled={picked.includes(i)}
                onClick={() => setPicked((p) => [...p, i])}
                className="grid size-11 place-items-center rounded-xl text-xl font-bold uppercase text-on-accent shadow-card accent-gradient transition active:scale-90 disabled:opacity-25"
              >
                {v.letters[i]}
              </button>
            ))}
          </div>
          <div className="mb-4 grid grid-cols-[auto_1fr_auto] gap-2">
            <Button variant="outline" aria-label="Shuffle letters" onClick={() => setOrder((o) => [...o].sort(() => Math.random() - 0.5))}>
              <Shuffle className="size-4" />
            </Button>
            <Button onClick={() => submit()} disabled={word.length < 3} loading={busy}>
              Enter
            </Button>
            <Button variant="outline" aria-label="Delete letter" onClick={() => setPicked((p) => p.slice(0, -1))}>
              <Delete className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        match.status === 'active' && <p className="mb-4 text-center text-sm text-muted">Time's up! Waiting for {partnerName} to finish…</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {found.map((w) => (
          <span key={w} className={cn('rounded-full px-2.5 py-1 text-sm font-medium', v.theirWords?.includes(w) ? 'bg-surface-2' : 'bg-accent-soft')}>
            {w} <span className="text-xs text-muted">+{wordPoints(w, v.letters.length)}</span>
          </span>
        ))}
      </div>
      {v.theirWords && v.theirWords.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold text-muted">{partnerName}'s words</p>
          <div className="flex flex-wrap gap-1.5">
            {v.theirWords.map((w) => (
              <span key={w} className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-sm font-medium">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
      {v.missed && v.missed.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold text-muted">Words you both missed</p>
          <div className="flex flex-wrap gap-1.5">
            {v.missed.map((w) => (
              <span key={w} className="rounded-full border border-dashed border-line px-2.5 py-1 text-sm text-muted">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
      {active && (
        <button onClick={() => send({ finish: true })} className="mt-5 w-full text-center text-sm font-medium text-muted">
          I'm done
        </button>
      )}
    </div>
  );
}
