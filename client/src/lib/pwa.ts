import { create } from 'zustand';
import { toast } from '@/store/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** Set when the browser offers its own install prompt (Chrome, Edge, Android). */
  promptEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  install: () => Promise<boolean>;
}

export const useInstall = create<InstallState>((set, get) => ({
  promptEvent: null,
  installed: matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  async install() {
    const event = get().promptEvent;
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    set({ promptEvent: null });
    return outcome === 'accepted';
  },
}));

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  useInstall.setState({ promptEvent: e as BeforeInstallPromptEvent });
});
window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, promptEvent: null }));

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  listenForNavigation();
  if (!import.meta.env.PROD) {
    // In development, a push-only worker so notifications can be tried with `npm run dev`.
    navigator.serviceWorker.register('/dev-push-sw.js', { scope: '/' }).catch(() => undefined);
    return;
  }
  const start = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const activate = (worker: ServiceWorker) => worker.postMessage({ type: 'skip-waiting' });

      // A version that finished downloading last time: switch now, while the app is just opening.
      if (registration.waiting && navigator.serviceWorker.controller) activate(registration.waiting);

      // A new version downloaded while the app is open: switch to it by itself, nothing to tap.
      // It waits for a quiet moment so it never reloads mid-sentence or mid-call, and happens at
      // once if the app is in the background.
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          whenIdle(() => activate(worker));
        });
      });

      // Installed apps stay open for days: look for a new version whenever the app comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
      });

      // Only reload for an update; the very first install takes control silently.
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return;
        reloaded = true;
        try {
          sessionStorage.setItem('ours:updated', '1');
        } catch {
          /* fine without the note */
        }
        location.reload();
      });
    } catch {
      /* service workers unavailable (private mode, unsupported browser) */
    }
  };
  // Wait for the page to finish loading so registration never competes with first paint.
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
}

/** A tapped push notification asks the open app to navigate. */
function listenForNavigation() {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'navigate' && typeof event.data.url === 'string') {
      window.dispatchEvent(new CustomEvent('ours:navigate', { detail: event.data.url }));
    }
  });
}

/** Hands the service worker the few facts its home-screen widgets need. */
export function shareWidgetData(data: unknown) {
  navigator.serviceWorker?.controller?.postMessage({ type: 'widget-data', data });
}

/**
 * Fetches the newest version of the app and switches to it. Used when the server reports a
 * newer version than the one running, and by "Check for updates" in Settings.
 */
export async function updateApp(): Promise<'updating' | 'current'> {
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (!registration) {
    location.reload();
    return 'updating';
  }
  await registration.update().catch(() => undefined);
  const worker = registration.waiting ?? registration.installing;
  if (!worker) return 'current';
  const activate = () => worker.postMessage({ type: 'skip-waiting' });
  if (worker.state === 'installed') activate();
  else worker.addEventListener('statechange', () => worker.state === 'installed' && activate());
  // The page reloads itself once the new version takes over (see registerServiceWorker).
  return 'updating';
}

/** True while someone is typing something, or on a call: not a moment to reload the app. */
function busy() {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const typing = Boolean(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && el.value?.trim());
  const inCall = Boolean(document.querySelector('[aria-label^="Call with"]'));
  return typing || inCall;
}

/** Runs `fn` now if the app is hidden or idle, otherwise as soon as it is. */
function whenIdle(fn: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    if (document.visibilityState === 'hidden' || !busy()) {
      done = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      fn();
    }
  };
  const onVisibility = () => document.visibilityState === 'hidden' && run();
  const timer = setInterval(run, 5000);
  document.addEventListener('visibilitychange', onVisibility);
  run();
}

/** After an automatic update, a small note so a reload never feels like a glitch. */
export function announceUpdate() {
  try {
    if (sessionStorage.getItem('ours:updated') !== '1') return;
    sessionStorage.removeItem('ours:updated');
    setTimeout(() => toast.success('Updated to the latest version', '✨'), 600);
  } catch {
    /* storage unavailable */
  }
}
