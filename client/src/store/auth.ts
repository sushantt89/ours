import { create } from 'zustand';
import { ApiError, get, onSessionChange, post, refreshSession, setAccessToken } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { AppConfig, Couple, Partner, Session, User } from '@/lib/types';
import { useUI } from './ui';

type Status = 'loading' | 'authed' | 'guest';

interface AuthState {
  status: Status;
  user: User | null;
  couple: Couple | null;
  partner: Partner | null;
  config: AppConfig | null;
  /** True when we are showing the last known session because the network is unavailable. */
  offlineSession: boolean;
  bootstrap: () => Promise<void>;
  setSession: (session: Session & { accessToken?: string }) => void;
  reload: () => Promise<void>;
  patchPartner: (patch: Partial<Partner>) => void;
  logout: () => Promise<void>;
  clear: () => void;
}

const SNAPSHOT = 'ours:session';

function saveSnapshot(session: Session | null) {
  try {
    if (session) localStorage.setItem(SNAPSHOT, JSON.stringify(session));
    else localStorage.removeItem(SNAPSHOT);
  } catch {
    /* storage unavailable */
  }
}

function loadSnapshot(): Session | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/** Removes everything private that this device cached, e.g. when signing out. */
async function wipeLocalData() {
  saveSnapshot(null);
  queryClient.clear();
  // Encryption keys never outlive the session on a shared device.
  await import('./e2ee').then((m) => m.useE2EE.getState().reset()).catch(() => undefined);
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ours-private')).map((k) => caches.delete(k)));
    navigator.serviceWorker?.controller?.postMessage({ type: 'widget-data', data: null });
    await (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.();
  } catch {
    /* not supported */
  }
}

/**
 * The server's feature switches (GIFs, Google, push…). A free host can take a minute to wake
 * up, so a failed fetch is retried with backoff instead of leaving features hidden all session.
 */
async function loadConfig(apply: (config: AppConfig) => void) {
  for (let attempt = 0; ; attempt++) {
    try {
      apply(await get<AppConfig>('/auth/config'));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 2_000 * 2 ** attempt)));
    }
  }
}

export const useAuth = create<AuthState>((set, getState) => ({
  status: 'loading',
  user: null,
  couple: null,
  partner: null,
  config: null,
  offlineSession: false,

  async bootstrap() {
    void loadConfig((config) => set({ config }));
    try {
      const ok = await refreshSession();
      if (!ok) set({ status: 'guest' });
    } catch (err) {
      // Offline: fall back to the last known profile so the app still opens.
      const snapshot = err instanceof ApiError && err.offline ? loadSnapshot() : null;
      if (snapshot) {
        useUI.getState().setAccent(snapshot.couple?.theme ?? 'rose');
        set({ ...snapshot, status: 'authed', offlineSession: true });
      } else set({ status: 'guest' });
    }
  },

  setSession(session) {
    if (session.accessToken) setAccessToken(session.accessToken);
    const { user, couple, partner } = session;
    useUI.getState().setAccent(couple?.theme ?? 'rose');
    saveSnapshot({ user, couple, partner });
    set({ user, couple, partner, status: 'authed', offlineSession: false });
  },

  async reload() {
    try {
      getState().setSession(await get<Session>('/me'));
    } catch {
      /* keep what we have */
    }
  },

  patchPartner(patch) {
    const partner = getState().partner;
    if (partner) set({ partner: { ...partner, ...patch } });
  },

  async logout() {
    await post('/auth/logout').catch(() => undefined);
    getState().clear();
  },

  clear() {
    setAccessToken(null);
    void wipeLocalData();
    set({ status: 'guest', user: null, couple: null, partner: null, offlineSession: false });
  },
}));

// Keep the store in step with silent token refreshes and expired sessions.
onSessionChange((session) => {
  if (session) useAuth.getState().setSession(session);
  else if (useAuth.getState().status === 'authed') useAuth.getState().clear();
});

/** Convenience selectors. These throw away the nullability inside signed-in screens. */
export const useMe = () => useAuth((s) => s.user)!;
export const useCouple = () => useAuth((s) => s.couple)!;
export const usePartner = () => useAuth((s) => s.partner);
