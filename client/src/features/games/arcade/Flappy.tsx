import { useEffect, useRef, useState } from 'react';
import { palette, StartCard, useCanvas, useFrame, type ArcadeProps } from './shared';

const W = 340;
const H = 480;
const GAP = 150;
const PIPE_W = 58;
const GRAVITY = 1500;
const FLAP = -460;
const SPEED = 150;

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
}

/** Tap to flap a heart through the gaps. Score = gaps passed. */
export default function Flappy({ onGameOver }: ArcadeProps) {
  const canvas = useCanvas(W, H);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const s = useRef({ y: H / 2, vy: 0, pipes: [] as Pipe[], score: 0, sinceSpawn: 0, colors: palette() });

  function start() {
    s.current = { y: H / 2, vy: FLAP, pipes: [], score: 0, sinceSpawn: 1.2, colors: palette() };
    setScore(0);
    setPlaying(true);
  }
  const flap = () => {
    if (!playing) return;
    s.current.vy = FLAP;
  };

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault();
        s.current.vy = FLAP;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  useFrame((dt) => {
    const st = s.current;
    st.vy += GRAVITY * dt;
    st.y += st.vy * dt;
    st.sinceSpawn += dt;
    if (st.sinceSpawn > 1.45) {
      st.sinceSpawn = 0;
      st.pipes.push({ x: W, gapY: 90 + Math.random() * (H - 180 - GAP) + GAP / 2, passed: false });
    }
    const birdX = 90;
    let dead = st.y < 12 || st.y > H - 12;
    for (const p of st.pipes) {
      p.x -= SPEED * (1 + st.score * 0.015) * dt;
      if (!p.passed && p.x + PIPE_W < birdX) {
        p.passed = true;
        st.score++;
        setScore(st.score);
      }
      const inX = birdX + 14 > p.x && birdX - 14 < p.x + PIPE_W;
      const inGap = st.y - 13 > p.gapY - GAP / 2 && st.y + 13 < p.gapY + GAP / 2;
      if (inX && !inGap) dead = true;
    }
    st.pipes = st.pipes.filter((p) => p.x > -PIPE_W);

    const ctx = canvas.current?.getContext('2d');
    if (ctx) {
      const c = st.colors;
      ctx.fillStyle = c.surface2;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = c.accent2;
      for (const p of st.pipes) {
        ctx.beginPath();
        ctx.roundRect(p.x, -10, PIPE_W, p.gapY - GAP / 2 + 10, 10);
        ctx.roundRect(p.x, p.gapY + GAP / 2, PIPE_W, H, 10);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(birdX, st.y);
      ctx.rotate(Math.max(-0.5, Math.min(1.1, st.vy / 700)));
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💖', 0, 2);
      ctx.restore();
    }
    if (dead) {
      navigator.vibrate?.(120);
      setPlaying(false);
      onGameOver(st.score);
    }
  }, playing);

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{score}</p>
      <div className="relative touch-none select-none" onPointerDown={flap}>
        <canvas ref={canvas} style={{ width: W, height: H }} className="max-w-full rounded-3xl border border-line" />
        {!playing && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-surface/90">
            <StartCard emoji="💖" title="Flappy heart" hint="Tap (or press space) to flap. Fly through the gaps." onStart={start} label={score ? 'Play again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
