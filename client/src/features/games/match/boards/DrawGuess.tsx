import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Input } from '@/components/ui';
import type { BoardProps } from '../registry';

interface Stroke {
  c: string;
  w: number;
  p: number[];
}
interface DrawView {
  word: string | null;
  letters: number;
  strokes: Stroke[] | null;
  guesses: string[];
  solved: boolean;
  maxGuesses: number;
}

/** Drawings are stored as strokes on a 300×300 canvas, so they look the same on every screen. */
const SIZE = 300;
const COLORS = ['#2a1f24', '#d6456b', '#f08a6e', '#f4b740', '#3f8a5f', '#5b8def', '#9a6ad6', '#ffffff'];

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.clearRect(0, 0, SIZE * scale, SIZE * scale);
  ctx.fillStyle = '#fffdfb';
  ctx.fillRect(0, 0, SIZE * scale, SIZE * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w * scale;
    ctx.beginPath();
    for (let i = 0; i < s.p.length; i += 2) {
      const x = s.p[i] * scale;
      const y = s.p[i + 1] * scale;
      if (i === 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y);
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function Canvas({ strokes, onChange }: { strokes: Stroke[]; onChange?: (s: Stroke[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(5);
  const drawing = useRef<Stroke | null>(null);
  const scale = Math.min(3, window.devicePixelRatio || 1);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, strokes, scale);
  }, [strokes, scale]);

  const point = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - rect.left) / rect.width) * SIZE), Math.round(((e.clientY - rect.top) / rect.height) * SIZE)];
  };

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={ref}
        width={SIZE * scale}
        height={SIZE * scale}
        className={cn('aspect-square w-[300px] max-w-full rounded-3xl border border-line shadow-card', onChange && 'touch-none')}
        onPointerDown={(e) => {
          if (!onChange) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drawing.current = { c: color, w: width, p: point(e) };
          onChange([...strokes, drawing.current]);
        }}
        onPointerMove={(e) => {
          if (!onChange || !drawing.current) return;
          const [x, y] = point(e);
          const p = drawing.current.p;
          if (Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 2) return;
          drawing.current = { ...drawing.current, p: [...p, x, y] };
          onChange([...strokes.slice(0, -1), drawing.current]);
        }}
        onPointerUp={() => (drawing.current = null)}
      />
      {onChange && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {COLORS.map((c) => (
            <button key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn('size-8 rounded-full border-2', color === c ? 'border-accent ring-2 ring-accent/40' : 'border-line')} style={{ background: c }} />
          ))}
          {[3, 6, 12].map((w) => (
            <button key={w} aria-label={`Brush ${w}`} onClick={() => setWidth(w)} className={cn('grid size-8 place-items-center rounded-full bg-surface-2', width === w && 'ring-2 ring-accent')}>
              <span className="rounded-full bg-ink" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
          <button aria-label="Undo" onClick={() => onChange(strokes.slice(0, -1))} className="grid size-8 place-items-center rounded-full bg-surface-2">
            <Undo2 className="size-4" />
          </button>
          <button aria-label="Clear" onClick={() => onChange([])} className="grid size-8 place-items-center rounded-full bg-surface-2">
            <Eraser className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function DrawGuess({ match, send, busy, partnerName }: BoardProps<DrawView>) {
  const v = match.view;
  const drawer = match.seat === 0;
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [guess, setGuess] = useState('');
  const done = match.status === 'done';

  async function submitGuess(e: FormEvent) {
    e.preventDefault();
    if (!guess.trim()) return;
    if (await send({ guess: guess.trim() })) setGuess('');
  }

  return (
    <div className="mx-auto max-w-sm">
      {done ? (
        <div className="mb-4 rounded-3xl bg-surface-2 p-4 text-center">
          <p className="text-4xl">{v.solved ? '🎉' : '🤔'}</p>
          <p className="font-display text-xl">{v.solved ? `Guessed it: ${v.word}!` : `It was “${v.word}”`}</p>
        </div>
      ) : drawer && !v.strokes ? (
        <p className="mb-3 text-center">
          Draw <b className="font-display text-2xl">“{v.word}”</b>
          <span className="block text-sm text-muted">No letters or numbers. {partnerName} gets {v.maxGuesses} guesses.</span>
        </p>
      ) : drawer ? (
        <p className="mb-3 text-center text-sm text-muted">You drew “{v.word}”. Waiting for {partnerName} to guess…</p>
      ) : !v.strokes ? (
        <p className="mb-3 text-center text-sm text-muted">{partnerName} is drawing…</p>
      ) : (
        <p className="mb-3 text-center text-sm text-muted">
          What did {partnerName} draw? {v.letters} letters · {v.maxGuesses - v.guesses.length} guesses left
        </p>
      )}

      {drawer && !v.strokes && !done ? (
        <>
          <Canvas strokes={strokes} onChange={setStrokes} />
          <Button block className="mt-4" loading={busy} disabled={!strokes.length} onClick={() => send({ strokes })}>
            Send my drawing
          </Button>
        </>
      ) : v.strokes ? (
        <Canvas strokes={v.strokes} />
      ) : null}

      {v.guesses.length > 0 && <p className="mt-3 text-center text-sm text-muted">Guesses: {v.guesses.join(' · ')}</p>}
      {!drawer && v.strokes && !done && (
        <form onSubmit={submitGuess} className="mt-4 flex gap-2">
          <Input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Your guess" aria-label="Your guess" autoCapitalize="none" className="flex-1" data-autofocus />
          <Button type="submit" disabled={!guess.trim() || busy}>
            Guess
          </Button>
        </form>
      )}
    </div>
  );
}
