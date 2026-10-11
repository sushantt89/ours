import { useEffect, useRef, useState, type RefObject } from 'react';

/** Every arcade game gets this: call it once with the final score when a game ends. */
export interface ArcadeProps {
  onGameOver: (score: number) => void;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Swipes on an element and arrow keys / WASD on the keyboard, as directions. */
export function useDirections(ref: RefObject<HTMLElement | null>, onDir: (dir: Dir) => void, enabled = true) {
  const handler = useRef(onDir);
  handler.current = onDir;

  useEffect(() => {
    if (!enabled) return;
    const keys: Record<string, Dir> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      const dir = keys[e.key];
      if (!dir || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      handler.current(dir);
    };
    window.addEventListener('keydown', onKey);

    const el = ref.current;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (start = { x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      handler.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    el?.addEventListener('pointerdown', down);
    el?.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('pointerdown', down);
      el?.removeEventListener('pointerup', up);
    };
  }, [ref, enabled]);
}

/** Calls `fn` every frame with the seconds since the last frame, while `running`. */
export function useFrame(fn: (dt: number) => void, running: boolean) {
  const handler = useRef(fn);
  handler.current = fn;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      handler.current(Math.min(0.05, (now - last) / 1000));
      last = now;
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [running]);
}

/** A countdown in whole seconds; calls onEnd at zero. */
export function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    if (!running) return;
    setLeft(seconds);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        end.current();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [seconds, running]);
  return left;
}

/** The app's colours, for drawing on a canvas. */
export function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--accent', '#e0567a'),
    accent2: v('--accent-2', '#f08a5d'),
    ink: v('--ink', '#2a1d22'),
    muted: v('--muted', '#8a7a80'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f6eeea'),
    line: v('--line', '#eadfda'),
    bg: v('--bg', '#fbf6f2'),
  };
}

/** A canvas that is sharp on high-density screens and sized to its box. */
export function useCanvas(width: number, height: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, [width, height]);
  return ref;
}

export function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A start screen shown before a game begins. */
export function StartCard({ emoji, title, hint, onStart, label = 'Start' }: { emoji: string; title: string; hint: string; onStart: () => void; label?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="text-6xl">{emoji}</span>
      <p className="mt-3 font-display text-2xl">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>
      <button onClick={onStart} className="mt-6 rounded-full px-8 py-3 font-semibold text-on-accent shadow-card accent-gradient transition active:scale-95">
        {label}
      </button>
    </div>
  );
}
