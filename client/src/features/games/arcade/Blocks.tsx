import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ChevronsDown, RotateCw } from 'lucide-react';
import { palette, StartCard, useCanvas, type ArcadeProps } from './shared';

const COLS = 10;
const ROWS = 20;
const CELL = 22;
const W = COLS * CELL;
const H = ROWS * CELL;

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];
const COLORS = ['#e8577a', '#f08a5d', '#f4b740', '#5fb49c', '#5b8def', '#9a6ad6', '#d46ab0'];
const LINE_POINTS = [0, 100, 300, 500, 800];

interface Piece {
  shape: number[][];
  color: number;
  x: number;
  y: number;
}
const rotate = (m: number[][]) => m[0].map((_, c) => m.map((row) => row[c]).reverse());
const randomPiece = (): Piece => {
  const i = Math.floor(Math.random() * SHAPES.length);
  return { shape: SHAPES[i], color: i + 1, x: Math.floor((COLS - SHAPES[i][0].length) / 2), y: 0 };
};

/** Falling blocks: complete rows to clear them. Score goes up with lines and level. */
export default function Blocks({ onGameOver }: ArcadeProps) {
  const canvas = useCanvas(W, H);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const g = useRef({ board: [] as number[][], piece: randomPiece(), next: randomPiece(), score: 0, lines: 0, colors: palette() });

  const fits = (p: Piece, board = g.current.board) =>
    p.shape.every((row, r) => row.every((v, c) => !v || (p.x + c >= 0 && p.x + c < COLS && p.y + r < ROWS && (p.y + r < 0 || !board[p.y + r][p.x + c]))));

  function draw() {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { board, piece, colors } = g.current;
    ctx.fillStyle = colors.surface2;
    ctx.fillRect(0, 0, W, H);
    const cell = (x: number, y: number, color: string, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    board.forEach((row, y) => row.forEach((v, x) => v && cell(x, y, COLORS[v - 1])));
    // Ghost: where the piece will land.
    let ghost = { ...piece };
    while (fits({ ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
    ghost.shape.forEach((row, r) => row.forEach((v, c) => v && cell(ghost.x + c, ghost.y + r, COLORS[piece.color - 1], 0.22)));
    piece.shape.forEach((row, r) => row.forEach((v, c) => v && cell(piece.x + c, piece.y + r, COLORS[piece.color - 1])));
  }

  function lock() {
    const st = g.current;
    st.piece.shape.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v && st.piece.y + r >= 0) st.board[st.piece.y + r][st.piece.x + c] = st.piece.color;
      }),
    );
    const kept = st.board.filter((row) => row.some((v) => !v));
    const cleared = ROWS - kept.length;
    if (cleared) {
      st.board = [...Array.from({ length: cleared }, () => Array(COLS).fill(0)), ...kept];
      st.lines += cleared;
      st.score += LINE_POINTS[cleared] * (1 + Math.floor(st.lines / 10));
      setLines(st.lines);
      setScore(st.score);
      navigator.vibrate?.(30);
    }
    st.piece = st.next;
    st.next = randomPiece();
    if (!fits(st.piece)) {
      setPlaying(false);
      onGameOver(st.score);
    }
  }

  function act(action: 'left' | 'right' | 'down' | 'rotate' | 'drop') {
    const st = g.current;
    if (!playing) return;
    const p = st.piece;
    if (action === 'left' && fits({ ...p, x: p.x - 1 })) st.piece = { ...p, x: p.x - 1 };
    if (action === 'right' && fits({ ...p, x: p.x + 1 })) st.piece = { ...p, x: p.x + 1 };
    if (action === 'down') {
      if (fits({ ...p, y: p.y + 1 })) st.piece = { ...p, y: p.y + 1 };
      else lock();
    }
    if (action === 'rotate') {
      const turned = { ...p, shape: rotate(p.shape) };
      // Nudge off the walls if a rotation doesn't quite fit.
      for (const dx of [0, -1, 1, -2, 2]) {
        if (fits({ ...turned, x: turned.x + dx })) {
          st.piece = { ...turned, x: turned.x + dx };
          break;
        }
      }
    }
    if (action === 'drop') {
      let q = p;
      while (fits({ ...q, y: q.y + 1 })) q = { ...q, y: q.y + 1 };
      st.score += 2 * (q.y - p.y);
      setScore(st.score);
      st.piece = q;
      lock();
    }
    draw();
  }
  const actRef = useRef(act);
  actRef.current = act;

  function start() {
    g.current = { board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)), piece: randomPiece(), next: randomPiece(), score: 0, lines: 0, colors: palette() };
    setScore(0);
    setLines(0);
    setPlaying(true);
  }

  useEffect(() => {
    if (!playing) return;
    draw();
    let timer: ReturnType<typeof setTimeout>;
    const fall = () => {
      actRef.current('down');
      timer = setTimeout(fall, Math.max(110, 650 - Math.floor(g.current.lines / 10) * 60));
    };
    timer = setTimeout(fall, 650);
    const keys: Record<string, Parameters<typeof act>[0]> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' };
    const onKey = (e: KeyboardEvent) => {
      const a = keys[e.key];
      if (a) {
        e.preventDefault();
        actRef.current(a);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Swipe: left/right moves, down drops, tap rotates.
  const touch = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const btn = (label: string, action: Parameters<typeof act>[0], Icon: typeof ArrowLeft) => (
    <button aria-label={label} onClick={() => act(action)} className="grid size-14 place-items-center rounded-2xl bg-surface-2 active:scale-90 active:bg-accent-soft">
      <Icon className="size-6" />
    </button>
  );

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-[220px] justify-between font-display tabular-nums">
        <span className="text-3xl">{score.toLocaleString()}</span>
        <span className="self-end text-sm text-muted">{lines} lines</span>
      </div>
      <div
        className="relative touch-none select-none"
        onPointerDown={(e) => (touch.current = { x: e.clientX, y: e.clientY, moved: false })}
        onPointerMove={(e) => {
          const t = touch.current;
          if (!t) return;
          const dx = e.clientX - t.x;
          if (Math.abs(dx) > 26) {
            act(dx > 0 ? 'right' : 'left');
            t.x = e.clientX;
            t.moved = true;
          }
          if (e.clientY - t.y > 70 && !t.moved) {
            act('drop');
            touch.current = null;
          }
        }}
        onPointerUp={() => {
          if (touch.current && !touch.current.moved) act('rotate');
          touch.current = null;
        }}
      >
        <canvas ref={canvas} style={{ width: W, height: H }} className="rounded-2xl border border-line" />
        {!playing && (
          <div className="absolute inset-0 grid place-items-center rounded-2xl bg-surface/90">
            <StartCard emoji="🧱" title="Block puzzle" hint="Drag to move, tap to turn, swipe down to drop. Fill rows to clear them." onStart={start} label={score ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        {btn('Move left', 'left', ArrowLeft)}
        {btn('Turn', 'rotate', RotateCw)}
        {btn('Move down', 'down', ArrowDown)}
        {btn('Drop', 'drop', ChevronsDown)}
        {btn('Move right', 'right', ArrowRight)}
      </div>
    </div>
  );
}
