import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { get } from '@/lib/api';
import { Input } from './Field';

export interface PlaceValue {
  label: string;
  lat?: number;
  lng?: number;
}

/**
 * A place name with suggestions from OpenStreetMap. Picking a suggestion also pins the
 * memory on the map; typing freely still works and is looked up in the background.
 */
export function PlaceInput({ value, onChange, label = 'Where' }: { value: PlaceValue; onChange: (v: PlaceValue) => void; label?: string }) {
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.label.trim().length < 3 || value.lat !== undefined) return setResults([]);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      get<{ places: { label: string; lat: number; lng: number }[] }>(`/places?q=${encodeURIComponent(value.label.trim())}`, controller.signal)
        .then((r) => {
          setResults(r.places);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value.label, value.lat]);

  useEffect(() => {
    const close = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div ref={wrap} className="relative">
      <Input
        label={label}
        placeholder="Melbourne"
        value={value.label}
        maxLength={80}
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onChange({ label: e.target.value });
        }}
        onFocus={() => results.length && setOpen(true)}
        hint={value.lat !== undefined ? '📍 Pinned on your map' : undefined}
      />
      {open && results.length > 0 && (
        <ul className="absolute inset-x-0 top-[calc(100%-1.25rem)] z-30 mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-float" role="listbox">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  onChange({ label: r.label.slice(0, 80), lat: r.lat, lng: r.lng });
                  setOpen(false);
                  setResults([]);
                }}
              >
                <MapPin className="size-4 shrink-0 text-accent" /> {r.label}
              </button>
            </li>
          ))}
          <li className="px-4 py-1.5 text-right text-[10px] text-faint">© OpenStreetMap</li>
        </ul>
      )}
    </div>
  );
}
