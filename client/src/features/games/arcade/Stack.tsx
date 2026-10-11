import { useEffect, useRef, useState } from 'react';
import { palette, StartCard, useCanvas, useFrame, type ArcadeProps } from './shared';

const W = 320;
const H = 480;
const BLOCK_H = 24;
const START_W = 180;

interface Block {
  x: number;
  w: number;
  hue: number;
}

/** A block slides back and forth; tap to drop it. Overhangs are cut off. How high can you stack? */
export default function Stack({ onGameOver }: ArcadeProps) {
  const canvas = useCanvas(W, H);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [last, setLast] = useState<number | null>(null);
  const s = useRef({ tower: [] as Block[], moving: { x: 0, w: START_W, hue: 0 } as Block, dir: 1, speed: 140, cam: 0, perfect: 0 });
  const colors = useRef(palette());

  function start() {
    colors.current = palette();
    const base = { x: (W - START_W) / 2, w: START_W, hue: 340 };
    s.current = { tower: [base], moving: { x: 0, w: START_W, hue: 352 }, dir: 1, speed: 140, cam: 0, perfect: 0 };
    setScore(0);
    setPlaying(true);
  }

  function drop() {
    if (!playing) return;
    const st = s.current;
    const top = st.tower[st.tower.length - 1];
    const m = st.moving;
    let left = Math.max(m.x, top.x);
    let right = Math.min(m.x + m.w, top.x + top.w);
    if (right - left <= 0) {
      setPlaying(false);
      const final = st.tower.length - 1;
      setLast(final);
      onGameOver(final);
      navigator.vibrate?.(120);
      return;
    }
    // Close enough counts as perfect, and a streak of perfects grows the block back a little.
    if (Math.abs(m.x - top.x) < 4) {
      left = top.x;
      right = top.x + top.w;
      st.perfect++;
      if (st.perfect >= 3) {
        left = Math.max(0, left - 6);
        right = Math.min(W, right + 6);
      }
      navigator.vibrate?.(25);
    } else st.perfect = 0;
    st.tower.push({ x: left, w: right - left, hue: m.hue });
    st.dir = st.tower.length % 2 ? 1 : -1;
    st.moving = { x: st.dir === 1 ? -(right - left) : W, w: right - left, hue: (m.hue + 12) % 360 };
    st.speed = Math.min(380, 140 + st.tower.length * 7);
    setScore(st.tower.length - 1);
  }

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useFrame((dt) => {
    const st = s.current;
    const m = st.moving;
    m.x += st.dir * st.speed * dt;
    if (m.x + m.w > W + 40) st.dir = -1;
    if (m.x < -40) st.dir = 1;
    const targetCam = Math.max(0, (st.tower.length + 1) * BLOCK_H - H * 0.6);
    st.cam += (targetCam - st.cam) * Math.min(1, dt * 6);

    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = colors.current.surface2;
    ctx.fillRect(0, 0, W, H);
    const y = (i: number) => H - (i + 1) * BLOCK_H + st.cam;
    st.tower.forEach((b, i) => {
      ctx.fillStyle = `hsl(${b.hue} 70% 62%)`;
      ctx.fillRect(b.x, y(i), b.w, BLOCK_H - 2);
    });
    ctx.fillStyle = `hsl(${m.hue} 70% 62%)`;
    ctx.fillRect(m.x, y(st.tower.length), m.w, BLOCK_H - 2);
  }, playing);

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-display text-3xl tabular-nums">{score}</p>
      <div className="relative w-[320px] max-w-full overflow-hidden rounded-3xl bg-surface-2">
        <canvas ref={canvas} style={{ width: '100%', aspectRatio: `${W}/${H}` }} className="block touch-none" onPointerDown={drop} aria-label="Stack tower" />
        {!playing && (
          <div className="absolute inset-0 grid place-items-center bg-surface-2/95">
            <StartCard emoji="🏗️" title={last !== null ? `${last} floors` : 'Stack tower'} hint="Tap to drop each block on the one below. Whatever hangs over gets cut off." onStart={start} label={last !== null ? 'Again' : 'Start'} />
          </div>
        )}
      </div>
    </div>
  );
}
