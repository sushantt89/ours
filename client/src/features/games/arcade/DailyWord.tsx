import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Delete } from 'lucide-react';
import { ApiError, errorMessage, get, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Skeleton } from '@/components/ui';

interface Guess {
  word: string;
  /** 2 = right place, 1 = elsewhere in the word, 0 = not in it, -1 = hidden (partner's, before you finish) */
  marks: number[];
}
interface Side {
  guesses: Guess[];
  solved: boolean;
  finished: boolean;
}
interface DailyWordState {
  date: string;
  length: number;
  maxGuesses: number;
  me: Side;
  partner: Side;
  answer: string | null;
  tally: { wins: number; losses: number; ties: number };
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const MARK = ['bg-zinc-500 text-white border-transparent', 'bg-amber-400 text-white border-transparent', 'bg-emerald-500 text-white border-transparent'];
const EMOJI = ['⬛', '🟨', '🟩'];

/** Same five-letter word for both of you each day. Guesses are checked on the server, so the word stays secret. */
export default function DailyWord() {
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['arcade', 'daily-word'], queryFn: () => get<DailyWordState>('/arcade/daily-word') });
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit() {
    if (!data || typed.length !== data.length || busy) return;
    setBusy(true);
    try {
      const next = await post<DailyWordState>('/arcade/daily-word/guess', { guess: typed });
      queryClient.setQueryData(['arcade', 'daily-word'], next);
      void queryClient.invalidateQueries({ queryKey: ['arcade'] });
      setTyped('');
      if (next.me.finished) toast.success(next.me.solved ? `Solved in ${next.me.guesses.length}!` : `The word was ${next.answer?.toUpperCase()}`, next.me.solved ? '🟩' : '🟥');
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 350);
      toast.error(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function key(k: string) {
    if (!data || data.me.finished) return;
    if (k === 'enter') return void submit();
    if (k === 'back') return setTyped((t) => t.slice(0, -1));
    if (/^[a-z]$/.test(k)) setTyped((t) => (t.length < data.length ? t + k : t));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter') key('enter');
      else if (e.key === 'Backspace') key('back');
      else key(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!data) return <Skeleton className="mx-auto h-96 max-w-sm" />;

  // Best mark seen for each letter, for colouring the keyboard.
  const letterMarks: Record<string, number> = {};
  data.me.guesses.forEach((g) => g.word.split('').forEach((ch, i) => (letterMarks[ch] = Math.max(letterMarks[ch] ?? -1, g.marks[i]))));

  const rows = Array.from({ length: data.maxGuesses }, (_, r) => {
    const g = data.me.guesses[r];
    if (g) return g;
    if (r === data.me.guesses.length && !data.me.finished) return { word: typed.padEnd(data.length, ' '), marks: Array(data.length).fill(-2) };
    return { word: ' '.repeat(data.length), marks: Array(data.length).fill(-2) };
  });
  const partnerName = partner?.name ?? 'Your partner';

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center">
      <div className="mb-3 flex w-full items-center justify-between text-sm">
        <span className="text-muted">{new Date(`${data.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        <span className="font-medium">
          You {data.tally.wins} · {partnerName} {data.tally.losses}
          {data.tally.ties ? ` · ${data.tally.ties} tied` : ''}
        </span>
      </div>

      <div className={cn('grid gap-1.5', shake && 'animate-[shake-x_300ms]')}>
        {rows.map((g, r) => (
          <div key={r} className="flex gap-1.5">
            {g.word.split('').map((ch, i) => (
              <span
                key={i}
                className={cn(
                  'grid size-14 place-items-center rounded-xl border-2 font-display text-3xl uppercase transition-colors',
                  g.marks[i] >= 0 ? MARK[g.marks[i]] : ch.trim() ? 'border-muted' : 'border-line',
                )}
              >
                {ch.trim()}
              </span>
            ))}
          </div>
        ))}
      </div>

      {data.me.finished ? (
        <div className="mt-5 w-full rounded-3xl bg-surface-2 p-4 text-center">
          <p className="font-display text-xl">{data.me.solved ? `Solved in ${data.me.guesses.length} 🎉` : `The word was ${data.answer?.toUpperCase()}`}</p>
          <p className="mt-3 text-sm font-medium">{partnerName}</p>
          {data.partner.guesses.length ? (
            <div className="mt-1 text-lg leading-tight">
              {data.partner.guesses.map((g, i) => (
                <div key={i}>{g.marks.map((m) => EMOJI[m] ?? '⬜').join('')}</div>
              ))}
              <p className="mt-1 text-sm text-muted">{data.partner.finished ? (data.partner.solved ? `Solved in ${data.partner.guesses.length}` : "Didn't get it") : 'Still playing…'}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Hasn't played yet today</p>
          )}
          <p className="mt-3 text-xs text-faint">A new word arrives tomorrow.</p>
        </div>
      ) : (
        <>
          <p className="mt-3 h-5 text-xs text-muted">
            {data.partner.guesses.length
              ? data.partner.finished
                ? `${partnerName} ${data.partner.solved ? `solved it in ${data.partner.guesses.length}` : 'is done'}. Your turn!`
                : `${partnerName} has used ${data.partner.guesses.length} guess${data.partner.guesses.length === 1 ? '' : 'es'}`
              : ''}
          </p>
          <div className="mt-2 w-full space-y-1.5 select-none">
            {ROWS.map((row, r) => (
              <div key={r} className="flex justify-center gap-1">
                {r === 2 && (
                  <button onClick={() => key('enter')} disabled={busy} className="h-12 rounded-lg bg-surface-2 px-2.5 text-xs font-bold active:scale-95">
                    ENTER
                  </button>
                )}
                {row.split('').map((ch) => (
                  <button
                    key={ch}
                    onClick={() => key(ch)}
                    className={cn('h-12 min-w-0 flex-1 rounded-lg font-semibold uppercase active:scale-95', letterMarks[ch] !== undefined ? MARK[letterMarks[ch]] : 'bg-surface-2')}
                  >
                    {ch}
                  </button>
                ))}
                {r === 2 && (
                  <button onClick={() => key('back')} aria-label="Delete letter" className="grid h-12 place-items-center rounded-lg bg-surface-2 px-2.5 active:scale-95">
                    <Delete className="size-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
