import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import type { BoardProps } from '../registry';

interface Answered {
  q: string;
  options: string[];
  picked: number;
  answer: number;
}
interface TriviaView {
  total: number;
  index: number;
  current: { q: string; options: string[] } | null;
  mine: Answered[];
  myScore: number;
  myMs: number;
  theirProgress: number;
  theirScore: number;
  theirMs: number | null;
  theirPicks: number[] | null;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function Bar({ label, done, total, score, mine }: { label: string; done: number; total: number; score: number; mine?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 truncate font-medium">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div className={cn('h-full rounded-full', mine ? 'bg-accent' : 'bg-indigo-500')} animate={{ width: `${(done / total) * 100}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right tabular-nums text-muted">
        {score}/{done}
      </span>
    </div>
  );
}

/** Same ten questions on both phones; you see your partner's progress as they go. */
export default function Trivia({ match, send, busy, partnerName }: BoardProps<TriviaView>) {
  const v = match.view;
  const [reveal, setReveal] = useState<Answered | null>(null);
  const started = useRef<number | null>(null);

  // Tell the server the question is on screen so the clock is fair.
  useEffect(() => {
    if (match.status !== 'active' || !v.current || started.current === v.index) return;
    started.current = v.index;
    if (v.index === 0) void send({ start: true });
  }, [match.status, v.current, v.index, send]);

  async function pick(i: number) {
    if (busy || reveal || !v.current) return;
    const q = v.current;
    if (await send({ pick: i })) {
      // Show right/wrong for a moment (the reply carries the answer) before the next question.
      setReveal({ q: q.q, options: q.options, picked: i, answer: -1 });
      setTimeout(() => setReveal(null), 1100);
    }
  }

  // Once the reply arrives, the last of `mine` is the question just answered (with its answer).
  const shown = reveal ? (v.mine[v.mine.length - 1] ?? reveal) : null;
  const finishedMine = !v.current;

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 space-y-2 rounded-2xl bg-surface p-3 shadow-card">
        <Bar label="You" done={v.index} total={v.total} score={v.myScore} mine />
        <Bar label={partnerName} done={v.theirProgress} total={v.total} score={v.theirScore} />
      </div>

      {shown ? (
        <Question q={shown.q} options={shown.options} picked={shown.picked} answer={shown.answer} number={v.mine.length} total={v.total} />
      ) : v.current && match.status === 'active' ? (
        <Question q={v.current.q} options={v.current.options} onPick={pick} number={v.index + 1} total={v.total} disabled={busy} />
      ) : (
        <div>
          <p className="mb-3 text-center text-sm text-muted">
            {match.status === 'done'
              ? `You got ${v.myScore} in ${secs(v.myMs)} · ${partnerName} got ${v.theirScore}${v.theirMs !== null ? ` in ${secs(v.theirMs)}` : ''}`
              : finishedMine
                ? `You got ${v.myScore}/${v.total}. Waiting for ${partnerName} to finish (${v.theirProgress}/${v.total})…`
                : ''}
          </p>
          <ul className="space-y-2">
            {v.mine.map((a, k) => (
              <li key={k} className="rounded-2xl bg-surface p-3 text-sm shadow-card">
                <p className="font-medium">
                  {a.picked === a.answer ? '✅' : '❌'} {a.q}
                </p>
                <p className="mt-1 text-muted">
                  {a.picked !== a.answer && <span className="line-through">{a.options[a.picked]}</span>} <b className="text-ink">{a.options[a.answer]}</b>
                  {v.theirPicks && <span className="ml-2 text-xs">· {partnerName}: {v.theirPicks[k] === a.answer ? '✅' : `❌ ${a.options[v.theirPicks[k]]}`}</span>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Question({ q, options, onPick, picked, answer, number, total, disabled }: { q: string; options: string[]; onPick?: (i: number) => void; picked?: number; answer?: number; number: number; total: number; disabled?: boolean }) {
  return (
    <motion.div key={q} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        Question {number} of {total}
      </p>
      <p className="mb-4 mt-1 font-display text-2xl leading-snug">{q}</p>
      <div className="grid gap-2">
        {options.map((o, i) => {
          const state = answer === undefined || answer < 0 ? (picked === i ? 'picked' : null) : i === answer ? 'right' : picked === i ? 'wrong' : null;
          return (
            <button
              key={i}
              disabled={disabled || !onPick}
              onClick={() => onPick?.(i)}
              className={cn(
                'rounded-2xl border px-4 py-3.5 text-left font-medium transition active:scale-[0.98]',
                state === 'right' ? 'border-success bg-success/15' : state === 'wrong' ? 'border-danger bg-danger/15' : state === 'picked' ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
