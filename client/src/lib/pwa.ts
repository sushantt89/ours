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
      // A new version has downloaded: offer to switch to it rather than reloading under the user.
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast.info('A new version is ready', '✨', {
              label: 'Update',
              onClick: () => {
                worker.postMessage({ type: 'skip-waiting' });
              },
            });
          }
        });
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
