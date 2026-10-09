import sharp from 'sharp';
import exifReader from 'exif-reader';
import { env } from '../config/env';
import { Memory } from '../models';
import { sync } from './realtime';

/**
 * Places for the memory map.
 *
 * Coordinates come from the photo's own GPS data when it has some, otherwise from looking
 * up the place name with OpenStreetMap's free Nominatim service. Nominatim allows one
 * request per second, so every lookup goes through a small queue.
 */

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

const enabled = () => !env.isTest && process.env.GEOCODING !== 'off';
const AGENT = `Ours couple app (${env.SERVER_URL})`;

/** Reads GPS coordinates embedded in a photo, if any. */
export async function gpsFromImage(buffer: Buffer): Promise<{ lat: number; lng: number } | null> {
  try {
    const { exif } = await sharp(buffer).metadata();
    if (!exif) return null;
    const gps = exifReader(exif).GPSInfo;
    const toDecimal = (dms?: number[], ref?: string) => {
      if (!dms || dms.length < 3) return null;
      const value = dms[0] + dms[1] / 60 + dms[2] / 3600;
      return ref === 'S' || ref === 'W' ? -value : value;
    };
    const lat = toDecimal(gps?.GPSLatitude, gps?.GPSLatitudeRef);
    const lng = toDecimal(gps?.GPSLongitude, gps?.GPSLongitudeRef);
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

let chain: Promise<unknown> = Promise.resolve();
let last = 0;

/** Runs requests to Nominatim one at a time, at most one per second. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, last + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return task();
  });
  chain = run.catch(() => undefined);
  return run;
}

const cache = new Map<string, Place[]>();

const shortLabel = (address: Record<string, string> | undefined, fallback: string) => {
  if (!address) return fallback.split(',').slice(0, 2).join(',').trim();
  const place = address.suburb || address.town || address.city || address.village || address.hamlet || address.county || address.state;
  const area = address.city && address.city !== place ? address.city : address.state || address.country;
  return [address.tourism || address.attraction || address.amenity || address.beach, place, area].filter(Boolean).slice(0, 2).join(', ') || fallback;
};

export async function searchPlaces(query: string, limit = 5): Promise<Place[]> {
  const key = `${query.toLowerCase().trim()}|${limit}`;
  if (cache.has(key)) return cache.get(key)!;
  if (!enabled()) return [];
  const results = await throttled(async () => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': AGENT, 'Accept-Language': 'en' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { lat: string; lon: string; display_name: string; address?: Record<string, string> }[];
    return data.map((d) => ({ label: shortLabel(d.address, d.display_name), lat: Number(d.lat), lng: Number(d.lon) }));
  }).catch(() => [] as Place[]);
  if (cache.size > 500) cache.clear();
  cache.set(key, results);
  return results;
}

export async function reversePlace(lat: number, lng: number): Promise<string | null> {
  if (!enabled()) return null;
  return throttled(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'User-Agent': AGENT, 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    return data.display_name ? shortLabel(data.address, data.display_name).slice(0, 80) : null;
  }).catch(() => null);
}

/** Fills in whatever a memory is missing: a pin from its place name, or a place name from its pin. */
export async function locateMemory(memoryId: unknown) {
  const memory = await Memory.findById(memoryId);
  if (!memory || memory.geoChecked) return;
  try {
    if (memory.geo?.lat != null && !memory.location) {
      const label = await reversePlace(memory.geo.lat, memory.geo.lng!);
      if (label) memory.location = label;
    } else if (memory.location && memory.geo?.lat == null) {
      const [best] = await searchPlaces(memory.location, 1);
      if (best) memory.geo = { lat: best.lat, lng: best.lng, source: 'place' };
    }
  } finally {
    memory.geoChecked = true;
    await memory.save();
  }
  sync(memory.coupleId, 'memories');
}

export function queueLocate(memoryId: unknown) {
  if (enabled()) void locateMemory(memoryId).catch(() => undefined);
}

/** Catches up on memories that were saved before the map existed, a few at a time. */
export async function backfillPlaces(limit = 20) {
  if (!enabled()) return;
  const pending = await Memory.find({ geoChecked: { $ne: true }, $or: [{ location: { $ne: '' } }, { 'geo.lat': { $exists: true } }] })
    .select('_id')
    .limit(limit);
  for (const m of pending) await locateMemory(m._id).catch(() => undefined);
}
