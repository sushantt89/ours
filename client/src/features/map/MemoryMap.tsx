import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { get } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import type { MapPin, Media } from '@/lib/types';
import { useUI } from '@/store/ui';
import { Button, EmptyState, ErrorState, Lightbox, Sheet, Skeleton } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

interface Place {
  key: string;
  lat: number;
  lng: number;
  label: string;
  pins: MapPin[];
}

/** Memories taken at (almost) the same spot share one marker. */
function groupPins(pins: MapPin[]): Place[] {
  const places = new Map<string, Place>();
  for (const pin of pins) {
    const key = `${pin.lat.toFixed(3)},${pin.lng.toFixed(3)}`;
    const place = places.get(key) ?? { key, lat: pin.lat, lng: pin.lng, label: pin.location, pins: [] };
    place.pins.push(pin);
    if (!place.label && pin.location) place.label = pin.location;
    places.set(key, place);
  }
  return [...places.values()];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function markerIcon(place: Place) {
  const count = place.pins.length;
  return L.divIcon({
    className: '',
    iconSize: [52, 52],
    iconAnchor: [26, 60],
    html: `<div class="ours-pin"><img src="${esc(place.pins[0].thumbUrl)}" alt="" />${count > 1 ? `<span>${count}</span>` : ''}</div>`,
  });
}

export default function MemoryMap() {
  const mode = useUI((s) => s.mode);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['memories', 'map'], queryFn: () => get<{ pins: MapPin[]; unpinned: number }>('/memories/map') });
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [viewer, setViewer] = useState<Media | null>(null);
  const places = useMemo(() => groupPins(data?.pins ?? []), [data]);
  const dark = document.documentElement.dataset.theme === 'dark';

  // Create the map once.
  useEffect(() => {
    if (!element.current || map.current) return;
    map.current = L.map(element.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 2 }).setView([20, 0], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isLoading]);

  // Light or dark map tiles to match the app.
  useEffect(() => {
    if (!map.current) return;
    tiles.current?.remove();
    // OpenStreetMap's free tiles. In dark mode they're recoloured with a CSS filter.
    tiles.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: dark ? 'ours-tiles-dark' : '',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
  }, [dark, mode, isLoading]);

  // Markers, and a view that fits them all.
  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    for (const place of places) {
      L.marker([place.lat, place.lng], { icon: markerIcon(place), title: place.label || 'Memory', keyboard: true })
        .on('click', () => setSelected(place))
        .addTo(markers.current);
    }
    if (places.length === 1) map.current.setView([places[0].lat, places[0].lng], 12);
    else if (places.length > 1) map.current.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 13 });
  }, [places]);

  const asMedia = (pin: MapPin): Media => ({
    id: pin.id,
    kind: pin.kind,
    mime: pin.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    name: pin.caption || 'memory',
    size: 0,
    storage: 'app',
    url: pin.thumbUrl.replace('?thumb=1', ''),
    thumbUrl: pin.thumbUrl,
  });

  return (
    <Page title="Memory map" subtitle={data ? `${places.length} ${places.length === 1 ? 'place' : 'places'} you've shared` : undefined} back={<BackButton />} wide>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-[70dvh] rounded-card" />
      ) : (
        <>
          <div className="relative overflow-hidden rounded-card border border-line/70 shadow-card">
            <div ref={element} className="h-[calc(100dvh-13rem)] min-h-[420px] w-full bg-surface-2 lg:h-[calc(100dvh-10rem)]" aria-label="Map of your memories" />
            {places.length === 0 && (
              <div className="absolute inset-0 z-[500] grid place-items-center bg-bg/70 backdrop-blur-sm">
                <EmptyState
                  emoji="🗺️"
                  title="No pins yet"
                  body="Add a place when you save a memory, or upload photos taken with location on. They'll appear here."
                  action={
                    <Link to="/memories?add=1">
                      <Button>Add a memory</Button>
                    </Link>
                  }
                />
              </div>
            )}
          </div>
          {Boolean(data?.unpinned) && (
            <p className="mt-3 px-1 text-sm text-muted">
              {data!.unpinned} {data!.unpinned === 1 ? 'memory has' : 'memories have'} no place yet. Add one from the memory's details to put it on the map.
            </p>
          )}
        </>
      )}

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.label || 'Somewhere special'} wide>
        {selected && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {selected.pins.map((pin) => (
              <button key={pin.id} onClick={() => setViewer(asMedia(pin))} className="text-left">
                <img src={pin.thumbUrl} alt={pin.caption || ''} className="aspect-square w-full rounded-2xl object-cover" loading="lazy" />
                <p className="mt-1 truncate text-sm font-medium">{pin.caption || formatDate(pin.date)}</p>
                {pin.caption && <p className="text-xs text-muted">{formatDate(pin.date)}</p>}
              </button>
            ))}
          </div>
        )}
      </Sheet>
      <Lightbox media={viewer} onClose={() => setViewer(null)} />
    </Page>
  );
}
