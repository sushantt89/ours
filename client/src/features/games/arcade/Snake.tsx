import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { palette, StartCard, useCanvas, useDirections, type ArcadeProps, type Dir } from './shared';

const N = 17; // grid cells per side
const SIZE = 340;
const CELL = SIZE / N;
type P = { x: number; y: number };
const STEP: Record<Dir, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function freeCell(snake: P[]): P {
  for (;;) {
    const p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

/** Classic snake: eat hearts, grow, don't bite yourself or the walls. Score = hearts eaten. */
export default function Snake({ onGameOver }: ArcadeProps) {
  const canvas = useCanvas(SIZE, SIZE);
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const state = useRef({ snake: [] as P[], dir: 'right' as Dir, queue: [] as Dir[], food: { x: 0, y: 0 }, score: 0 });

  const turn = (dir: Dir) => {
    const s = state.current;
    const last = s.queue[s.queue.length - 1] ?? s.dir;
    if (dir !== last && dir !== OPPOSITE[last] && s.queue.length < 3) s.queue.push(dir);
  };
  useDirections(box, turn, playing);

  function start() {
    const snake = [
      { x: 6, y: 8 },
      { x: 5, y: 8 },
      { x: 4, y: 8 },
    ];
    state.current = { snake, dir: 'right', queue: [], food: freeCell(snake), score: 0 };
    setScore(0);
    setPlaying(true);
  }

  useEffect(() => {
    if (!playing) return;
    const colors = palette();
    const ctx = canvas.current!.getContext('2d')!;
    let timer: ReturnType<typeof setTimeout>;

    const draw = () => {
      const { snake, food } = state.current;
      ctx.fillStyle = colors.surface2;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.font = `${CELL * 0.9}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❤️', food.x * CELL + CELL / 2, food.y * CELL + CELL / 2 + 1);
      snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? colors.accent : colors.accent2;
        ctx.globalAlpha = i === 0 ? 1 : Math.max(0.45, 1 - i / (snake.length + 6));
        ctx.beginPath();
        ctx.roundRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2, 5);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      const s = state.current;
      s.dir = s.queue.shift() ?? s.dir;
      const head = { x: s.snake[0].x + STEP[s.dir].x, y: s.snake[0].y + STEP[s.dir].y };
      const hit = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || s.snake.some((p) => p.x === head.x && p.y === head.y);
      if (hit) {
        navigator.vibrate?.(120);
        setPlaying(false);
        onGameOver(s.score);
        return;
      }
      s.snake.unshift(head);
      if (head.x === s.food.x && head.y === s.food.y) {
        s.score++;
        setScore(s.score);
        s.food = freeCell(s.snake);
        navigator.vibrate?.(15);
      } else {
        s.snake.pop();
      }
      draw();
      // Speeds up as you grow.
      timer = setTimeout(tick, Math.max(65, 150 - s.score * 3));
    };
    draw();
    timer = setTimeout(tick, 300);
    return () => clearTimeout(timer);
  }, [playing, canvas, onGameOver]);

  const pad = (dir: Dir, Icon: typeof ArrowUp) => (
    <button aria-label={dir} onClick={() => turn(dir)} className="grid size-14 place-items-center rounded-2xl bg-surface-2 active:scale-90 active:bg-accent-soft">
      <Icon className="size-6" />
    </button>
  );

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{score}</p>
      <div ref={box} className="relative touch-none select-none">
        <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} className="max-w-full rounded-3xl border border-line" />
        {!playing && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-surface/90">
            <StartCard emoji="🐍" title="Snake" hint="Swipe, use the arrows or the keyboard. Eat hearts, don't hit yourself or the walls." onStart={start} label={score ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <span />
        {pad('up', ArrowUp)}
        <span />
        {pad('left', ArrowLeft)}
        {pad('down', ArrowDown)}
        {pad('right', ArrowRight)}
      </div>
    </div>
  );
}
