import { create } from 'zustand';
import type { Accent } from '@/lib/types';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  emoji?: string;
  action?: { label: string; onClick: () => void };
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the person must type this word to confirm. */
  typeToConfirm?: string;
}

interface UIState {
  mode: ThemeMode;
  toasts: Toast[];
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  online: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171114' : '#fbf6f2');
}

let nextId = 1;

export const useUI = create<UIState>((set, get) => ({
  mode: read('ours:mode', 'system') as ThemeMode,
  toasts: [],
  confirm: null,
  online: navigator.onLine,
  setMode(mode) {
    write('ours:mode', mode);
    applyTheme(mode);
    set({ mode });
  },
  setAccent(accent) {
    write('ours:accent', accent);
    document.documentElement.dataset.accent = accent;
  },
  toast(toast) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), toast.kind === 'error' ? 6000 : 4000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  ask(options) {
    return new Promise<boolean>((resolve) => set({ confirm: { ...options, resolve } }));
  },
  answer(ok) {
    get().confirm?.resolve(ok);
    set({ confirm: null });
  },
}));

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useUI.getState().mode === 'system') applyTheme('system');
});
window.addEventListener('online', () => useUI.setState({ online: true }));
window.addEventListener('offline', () => useUI.setState({ online: false }));

export const toast = {
  success: (message: string, emoji?: string) => useUI.getState().toast({ kind: 'success', message, emoji }),
  error: (message: string) => useUI.getState().toast({ kind: 'error', message }),
  info: (message: string, emoji?: string, action?: Toast['action']) => useUI.getState().toast({ kind: 'info', message, emoji, action }),
};
export const confirm = (options: ConfirmOptions) => useUI.getState().ask(options);
