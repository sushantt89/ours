import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, get, post } from '@/lib/api';
import type { LocationState } from '@/lib/types';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/store/auth';

export const locationQuery = { queryKey: ['location'], queryFn: () => get<LocationState>('/location') } as const;

/** Distance in metres between two points (haversine). */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number) {
  if (m < 50) return 'right next to you';
  if (m < 1000) return `${Math.round(m / 10) * 10} m away`;
  if (m < 100_000) return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km away`;
  return `${Math.round(m / 1000).toLocaleString()} km away`;
}

const MIN_INTERVAL_MS = 15_000;
const MIN_MOVE_M = 25;

/**
 * While you've chosen to share, sends your position as you move — only while the app is open
 * and on screen (web apps can't track in the background). Mounted once for the whole app.
 */
export function useLocationSharing() {
  const signedIn = useAuth((s) => Boolean(s.couple && s.partner));
  const { data } = useQuery({ ...locationQuery, enabled: signedIn, staleTime: 30_000 });
  const sharing = Boolean(data?.me.sharing);
  const until = data?.me.until;

  // Sharing with an end time: refresh when it passes so the app shows it as off.
  useEffect(() => {
    if (!sharing || !until) return;
    const ms = new Date(until).getTime() - Date.now();
    const timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['location'] }), Math.max(0, ms) + 1000);
    return () => clearTimeout(timer);
  }, [sharing, until]);

  useEffect(() => {
    if (!sharing || !('geolocation' in navigator)) return;
    let watch: number | null = null;
    let last: { lat: number; lng: number; at: number } | null = null;

    const send = (pos: GeolocationPosition) => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const now = Date.now();
      if (last && now - last.at < MIN_INTERVAL_MS && metresBetween(last, here) < MIN_MOVE_M) return;
      last = { ...here, at: now };
      post<{ me: LocationState['me'] }>('/location/update', { ...here, accuracy: Math.round(pos.coords.accuracy) })
        .then(({ me }) => queryClient.setQueryData<LocationState>(['location'], (old) => (old ? { ...old, me } : old)))
        .catch((err) => {
          // Sharing was switched off elsewhere (another device, or it expired).
          if (err instanceof ApiError && err.status === 409) void queryClient.invalidateQueries({ queryKey: ['location'] });
        });
    };

    const start = () => {
      if (watch !== null || document.visibilityState !== 'visible') return;
      watch = navigator.geolocation.watchPosition(send, () => undefined, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    };
    const stop = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      watch = null;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [sharing]);
}
