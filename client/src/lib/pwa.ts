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

      // A new version downloaded while the app is open: offer it, and switch by itself the next
      // time the app goes into the background, so nobody has to remember to tap "Update".
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          if (document.visibilityState === 'hidden') return activate(worker);
          toast.info('A new version is ready', '✨', { label: 'Update', onClick: () => activate(worker) });
          const onHide = () => {
            if (document.visibilityState !== 'hidden') return;
            document.removeEventListener('visibilitychange', onHide);
            activate(worker);
          };
          document.addEventListener('visibilitychange', onHide);
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
