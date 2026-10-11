import { useEffect, useRef, useState } from 'react';
import { palette, StartCard, useCanvas, useFrame, type ArcadeProps } from './shared';

const W = 340;
const H = 480;
const COLS = 8;
const ROWS = 6;
const BRICK_H = 16;
const GAP = 4;
const BRICK_W = (W - GAP * (COLS + 1)) / COLS;
const PADDLE_W = 70;
const R = 7;
const ROW_COLORS = ['#e0567a', '#f08a5d', '#f4b740', '#3fae7a', '#5b8def', '#9a6ad6'];

interface State {
  x: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  bricks: boolean[];
  lives: number;
  score: number;
  level: number;
  held: boolean;
  keys: { left: boolean; right: boolean };
}

const freshBricks = () => Array(COLS * ROWS).fill(true) as boolean[];

/** Bounce the ball, break the bricks. Drag or use arrow keys to move. Three lives; each cleared wall is faster. */
export default function Breakout({ onGameOver }: ArcadeProps) {
  const canvas = useCanvas(W, H);
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1 });
  const [last, setLast] = useState<number | null>(null);
  const s = useRef<State>(null as unknown as State);
  const colors = useRef(palette());

  function serve(st: State) {
    st.held = true;
    st.bx = st.x;
    st.by = H - 40 - R;
    const speed = 260 + st.level * 30;
    st.vx = speed * 0.55 * (Math.random() < 0.5 ? -1 : 1);
    st.vy = -speed * 0.85;
  }

  function start() {
    colors.current = palette();
    const st: State = { x: W / 2, bx: 0, by: 0, vx: 0, vy: 0, bricks: freshBricks(), lives: 3, score: 0, level: 1, held: true, keys: { left: false, right: false } };
    serve(st);
    s.current = st;
    setHud({ score: 0, lives: 3, level: 1 });
    setPlaying(true);
  }

  useEffect(() => {
    if (!playing) return;
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') s.current.keys.left = down;
      else if (e.key === 'ArrowRight' || e.key === 'd') s.current.keys.right = down;
      else if (e.code === 'Space' && down) s.current.held = false;
      else return;
      e.preventDefault();
    };
    const kd = key(true);
    const ku = key(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [playing]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    s.current.x = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, ((e.clientX - rect.left) / rect.width) * W));
  }

  useFrame((dt) => {
    const st = s.current;
    if (st.keys.left) st.x = Math.max(PADDLE_W / 2, st.x - 420 * dt);
    if (st.keys.right) st.x = Math.min(W - PADDLE_W / 2, st.x + 420 * dt);
    if (st.held) {
      st.bx = st.x;
    } else {
      st.bx += st.vx * dt;
      st.by += st.vy * dt;
      if (st.bx < R || st.bx > W - R) {
        st.vx = -st.vx;
        st.bx = Math.max(R, Math.min(W - R, st.bx));
      }
      if (st.by < R) {
        st.vy = Math.abs(st.vy);
        st.by = R;
      }
      // Paddle: the further from centre, the steeper the bounce.
      const py = H - 40;
      if (st.vy > 0 && st.by + R >= py && st.by + R <= py + 12 && Math.abs(st.bx - st.x) < PADDLE_W / 2 + R) {
        const speed = Math.hypot(st.vx, st.vy);
        const angle = ((st.bx - st.x) / (PADDLE_W / 2)) * 1.05;
        st.vx = speed * Math.sin(angle);
        st.vy = -Math.abs(speed * Math.cos(angle));
        navigator.vibrate?.(5);
      }
      // Bricks
      for (let i = 0; i < st.bricks.length; i++) {
        if (!st.bricks[i]) continue;
        const bx = GAP + (i % COLS) * (BRICK_W + GAP);
        const by = 50 + Math.floor(i / COLS) * (BRICK_H + GAP);
        if (st.bx + R > bx && st.bx - R < bx + BRICK_W && st.by + R > by && st.by - R < by + BRICK_H) {
          st.bricks[i] = false;
          const fromSide = st.bx < bx || st.bx > bx + BRICK_W;
          if (fromSide) st.vx = -st.vx;
          else st.vy = -st.vy;
          st.score += (ROWS - Math.floor(i / COLS)) * 10 * st.level;
          setHud({ score: st.score, lives: st.lives, level: st.level });
          break;
        }
      }
      if (st.bricks.every((b) => !b)) {
        st.level++;
        st.bricks = freshBricks();
        serve(st);
        setHud({ score: st.score, lives: st.lives, level: st.level });
      }
      if (st.by > H + R) {
        st.lives--;
        navigator.vibrate?.(80);
        setHud({ score: st.score, lives: st.lives, level: st.level });
        if (st.lives <= 0) {
          setPlaying(false);
          setLast(st.score);
          onGameOver(st.score);
          return;
        }
        serve(st);
      }
    }
    draw(st);
  }, playing);

  function draw(st: State) {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const c = colors.current;
    ctx.fillStyle = c.surface2;
    ctx.fillRect(0, 0, W, H);
    st.bricks.forEach((alive, i) => {
      if (!alive) return;
      ctx.fillStyle = ROW_COLORS[Math.floor(i / COLS)];
      ctx.beginPath();
      ctx.roundRect(GAP + (i % COLS) * (BRICK_W + GAP), 50 + Math.floor(i / COLS) * (BRICK_H + GAP), BRICK_W, BRICK_H, 4);
      ctx.fill();
    });
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.roundRect(st.x - PADDLE_W / 2, H - 40, PADDLE_W, 12, 6);
    ctx.fill();
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(st.bx, st.by, R, 0, Math.PI * 2);
    ctx.fill();
    if (st.held) {
      ctx.fillStyle = c.muted;
      ctx.font = '600 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Tap to launch', W / 2, H / 2 + 60);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-[340px] max-w-full justify-between font-display text-2xl tabular-nums">
        <span>{hud.score}</span>
        <span className="text-base text-muted">
          Wall {hud.level} · {'❤️'.repeat(Math.max(0, hud.lives))}
        </span>
      </div>
      <div className="relative w-[340px] max-w-full overflow-hidden rounded-3xl bg-surface-2">
        <canvas ref={canvas} style={{ width: '100%', aspectRatio: `${W}/${H}` }} className="block touch-none" onPointerDown={(e) => { pointer(e); if (playing) s.current.held = false; }} onPointerMove={pointer} aria-label="Breakout" />
        {!playing && (
          <div className="absolute inset-0 grid place-items-center bg-surface-2/95">
            <StartCard emoji="🧱" title={last !== null ? `${last} points` : 'Breakout'} hint="Drag to move the paddle and break every brick. Three lives." onStart={start} label={last !== null ? 'Again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
