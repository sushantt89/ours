import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, Send } from 'lucide-react';
import { ApiError, errorMessage, post, put } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { isIOS } from '@/lib/push';
import type { LocationState, SharedPosition } from '@/lib/types';
import { queryClient } from '@/lib/queryClient';
import { useMe, usePartner } from '@/store/auth';
import { toast, useUI } from '@/store/ui';
import { Avatar, Button, Card, EmptyState, ErrorState, Segmented, Skeleton } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { formatDistance, locationQuery, metresBetween } from './useLocationSharing';

type Duration = '60' | '480' | 'off';
const DURATIONS: { value: Duration; label: string }[] = [
  { value: '60', label: '1 hour' },
  { value: '480', label: '8 hours' },
  { value: 'off', label: 'Until I stop' },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function personIcon(name: string, avatar?: string | null) {
  const inner = avatar ? `<img src="${esc(avatar)}" alt="" />` : `<b>${esc(name.charAt(0).toUpperCase())}</b>`;
  return L.divIcon({ className: '', iconSize: [48, 48], iconAnchor: [24, 24], html: `<div class="ours-person">${inner}</div>` });
}
const meIcon = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="ours-me"></div>' });

function untilLabel(until: string | null) {
  if (!until) return 'until you turn it off';
  const end = new Date(until);
  const sameDay = end.toDateString() === new Date().toDateString();
  return `until ${new Intl.DateTimeFormat(undefined, sameDay ? { timeStyle: 'short' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(end)}`;
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 });
  });
}

function locationError(err: unknown) {
  const code = (err as GeolocationPositionError)?.code;
  if (code === 1) {
    return isIOS
      ? 'Location is blocked for Ours. Turn it on in Settings → Privacy & Security → Location Services → Safari Websites (or the app), then try again.'
      : 'Location is blocked for this site. Allow it in your browser’s site settings, then try again.';
  }
  if (!window.isSecureContext) return 'Location needs a secure (https) connection.';
  return "Couldn't find your location. Check that location is turned on and try again.";
}

export default function Locate() {
  const me = useMe();
  const partner = usePartner();
  const [params, setParams] = useSearchParams();
  const asked = params.get('asked') === '1';
  const { data, isLoading, isError, refetch } = useQuery({ ...locationQuery, refetchInterval: 60_000 });
  const [duration, setDuration] = useState<Duration>('60');
  const [busy, setBusy] = useState(false);
  // Your own spot, used on this screen only. It is sent to the server only while you share.
  const [here, setHere] = useState<SharedPosition | null>(null);
  const [, tick] = useState(0);

  // Keep "updated 2 min ago" fresh.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // If location is already allowed, show where you are next to them (without sharing it).
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => {
        if (p.state !== 'granted') return;
        return currentPosition().then((pos) => {
          if (!cancelled) setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: new Date().toISOString() });
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = data?.me.position ?? here;
  const theirs = data?.partner.sharing ? data.partner.position : null;

  async function startSharing() {
    setBusy(true);
    try {
      const pos = await currentPosition().catch((err) => {
        throw new Error(locationError(err));
      });
      const minutes = duration === 'off' ? null : Number(duration);
      await put('/location/sharing', { sharing: true, minutes });
      const { me: view } = await post<{ me: LocationState['me'] }>('/location/update', {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      });
      queryClient.setQueryData<LocationState>(['location'], (old) => (old ? { ...old, me: view } : old));
      void queryClient.invalidateQueries({ queryKey: ['location'] });
      if (asked) setParams({}, { replace: true });
      toast.success(`${partner?.name ?? 'Your partner'} can see where you are`, '📍');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function stopSharing() {
    setBusy(true);
    try {
      await put('/location/sharing', { sharing: false });
      await queryClient.invalidateQueries({ queryKey: ['location'] });
      toast.success('Stopped sharing your location');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    try {
      const { canRequestAt } = await post<{ canRequestAt: string }>('/location/request');
      queryClient.setQueryData<LocationState>(['location'], (old) => (old ? { ...old, canRequestAt } : old));
      toast.success(`Asked ${partner?.name ?? 'your partner'} to share`, '📍');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : errorMessage(err));
    }
  }

  const waitUntil = data?.canRequestAt ? new Date(data.canRequestAt).getTime() : 0;
  const canAsk = Date.now() >= waitUntil;
  const directions = theirs
    ? isIOS
      ? `https://maps.apple.com/?daddr=${theirs.lat},${theirs.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${theirs.lat},${theirs.lng}`
    : null;

  return (
    <Page title="Locate" subtitle="Where you both are, only when you choose to share" back={<BackButton />}>
      {!partner ? (
        <EmptyState emoji="📍" title="Almost there" body="Locate switches on once your partner joins your space." />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-28" />
        </div>
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          {asked && !data.me.sharing && (
            <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft p-4">
              <span className="text-2xl">📍</span>
              <p className="flex-1 text-sm">
                <span className="font-semibold">{partner.name} asked to see where you are.</span> Share below if you'd like to, or just ignore it.
              </p>
            </Card>
          )}

          {theirs || mine ? (
            <LocateMap me={mine} meIsShared={Boolean(data.me.position)} partner={theirs} partnerName={partner.name} partnerAvatar={partner.avatarUrl} />
          ) : null}

          {/* Your partner */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Avatar name={partner.name} src={partner.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{partner.name}</p>
                {theirs ? (
                  <p className="text-sm text-muted">
                    {mine ? `${formatDistance(metresBetween(mine, theirs))} · ` : ''}updated {timeAgo(theirs.at)}
                    {theirs.accuracy && theirs.accuracy > 100 ? ` · within ${Math.round(theirs.accuracy)} m` : ''}
                  </p>
                ) : data.partner.sharing ? (
                  <p className="text-sm text-muted">Sharing, waiting for their phone to send a position…</p>
                ) : (
                  <p className="text-sm text-muted">Not sharing their location right now</p>
                )}
                {data.partner.sharing && <p className="text-xs text-faint">Sharing {untilLabel(data.partner.until)}</p>}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {directions && (
                <a href={directions} target="_blank" rel="noreferrer" className="flex-1">
                  <Button block variant="soft">
                    <Navigation className="size-4" /> Directions
                  </Button>
                </a>
              )}
              {!data.partner.sharing && (
                <Button block variant="outline" onClick={ask} disabled={!canAsk}>
                  <Send className="size-4" /> {canAsk ? `Ask ${partner.name} to share` : 'Asked, give them a moment'}
                </Button>
              )}
            </div>
          </Card>

          {/* You */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Avatar name={me.name} src={me.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">You</p>
                <p className="text-sm text-muted">
                  {data.me.sharing ? `Sharing with ${partner.name} ${untilLabel(data.me.until)}` : `${partner.name} can't see your location`}
                </p>
              </div>
            </div>
            {data.me.sharing ? (
              <Button block variant="outline" className="mt-4" onClick={stopSharing} loading={busy}>
                Stop sharing
              </Button>
            ) : (
              <div className="mt-4 space-y-3">
                <Segmented label="How long to share" value={duration} onChange={setDuration} options={DURATIONS} className="w-full" />
                <Button block onClick={startSharing} loading={busy}>
                  📍 Share my location with {partner.name}
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Your position updates while Ours is open on this phone. Phones don't let web apps track in the background, so when the app is closed {partner.name} sees where you last were. Only your latest position is kept, never a history, and it's deleted as soon as you stop.
            </p>
          </Card>
        </div>
      )}
    </Page>
  );
}

function LocateMap({
  me,
  meIsShared,
  partner,
  partnerName,
  partnerAvatar,
}: {
  me: SharedPosition | null;
  meIsShared: boolean;
  partner: SharedPosition | null;
  partnerName: string;
  partnerAvatar?: string | null;
}) {
  const mode = useUI((s) => s.mode);
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const framed = useRef('');
  const dark = document.documentElement.dataset.theme === 'dark';

  useEffect(() => {
    if (!element.current) return;
    map.current = L.map(element.current, { zoomControl: false, attributionControl: true, minZoom: 2 }).setView([20, 0], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    tiles.current?.remove();
    tiles.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: dark ? 'ours-tiles-dark' : '',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
  }, [dark, mode]);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    const points: L.LatLngExpression[] = [];
    if (partner) {
      if (partner.accuracy && partner.accuracy > 30) {
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e0567a';
        L.circle([partner.lat, partner.lng], { radius: partner.accuracy, color: accent, weight: 1, fillOpacity: 0.12 }).addTo(group);
      }
      L.marker([partner.lat, partner.lng], { icon: personIcon(partnerName, partnerAvatar), title: partnerName, zIndexOffset: 100 }).addTo(group);
      points.push([partner.lat, partner.lng]);
    }
    if (me) {
      L.marker([me.lat, me.lng], { icon: meIcon, title: meIsShared ? 'You' : 'You (not shared)' }).addTo(group);
      points.push([me.lat, me.lng]);
    }
    // Frame the view when who's on the map changes, not on every small movement.
    const key = `${Boolean(partner)}-${Boolean(me)}`;
    if (points.length && framed.current !== key) {
      framed.current = key;
      if (points.length === 1) m.setView(points[0], 15);
      else m.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
    }
  }, [me, partner, meIsShared, partnerName, partnerAvatar]);

  return <div ref={element} className="h-[45dvh] min-h-64 overflow-hidden rounded-[28px] border border-line/70 shadow-card" />;
}
