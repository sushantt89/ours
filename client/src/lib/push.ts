import { post } from './api';

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const ua = navigator.userAgent;
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush(publicKey: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await post('/notifications/push/subscribe', subscription.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await post('/notifications/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return 'off';
}

/** Shows the unread count on the installed app's icon, where the platform supports it. */
export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (count > 0) nav.setAppBadge?.(count).catch(() => undefined);
  else nav.clearAppBadge?.().catch(() => undefined);
}
