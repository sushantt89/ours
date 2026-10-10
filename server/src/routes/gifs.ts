import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/http';

/** GIF and sticker search, proxied so the API key and the user's IP never reach the browser/provider. */
const router = Router();

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}
interface GiphyItem {
  id: string;
  title: string;
  images: { fixed_width: GiphyImage; fixed_width_small?: GiphyImage; downsized_medium?: GiphyImage };
}

interface Gif {
  id: string;
  title: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

/**
 * GIPHY's free ("beta") keys allow about 100 requests an hour, shared by everyone using the
 * app. Results are remembered here so both of you opening the tray, or sending the same nudge
 * again, doesn't spend that allowance. When GIPHY refuses, older results are served instead.
 */
const cache = new Map<string, { at: number; results: Gif[] }>();
const FRESH_MS = { search: 6 * 3600_000, trending: 3600_000 };
const MAX_ENTRIES = 300;

export function clearGifCache() {
  cache.clear();
}

/** Tests: make remembered results look older than they are. */
export function ageGifCache(ms: number) {
  for (const entry of cache.values()) entry.at -= ms;
}

function remember(key: string, results: Gif[]) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), results });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

router.get('/', async (req, res) => {
  if (!env.gifsEnabled) throw new HttpError(503, 'GIF search is not configured on this server', 'gifs_disabled');
  const query = z
    .object({ q: z.string().trim().max(60).default(''), type: z.enum(['gifs', 'stickers']).default('gifs') })
    .parse(req.query);
  const key = `${query.type}:${query.q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (query.q ? FRESH_MS.search : FRESH_MS.trending)) return res.json({ results: hit.results });

  const params = new URLSearchParams({ api_key: env.GIPHY_API_KEY!, limit: '24', rating: 'pg-13' });
  if (query.q) params.set('q', query.q);
  const endpoint = `https://api.giphy.com/v1/${query.type}/${query.q ? 'search' : 'trending'}?${params}`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) }).catch(() => null);

  if (!response?.ok) {
    if (!env.isTest) console.warn('[gifs] GIPHY request failed:', response ? response.status : 'no response');
    // Older results beat no results.
    if (hit) return res.json({ results: hit.results, stale: true });
    if (response?.status === 429) {
      throw new HttpError(429, "You've used this hour's free GIFs. They'll be back within the hour.", 'gifs_rate_limited');
    }
    throw new HttpError(502, 'GIF search is unavailable right now', 'gifs_unavailable');
  }
  const data = (await response.json()) as { data: GiphyItem[] };
  const results: Gif[] = data.data.map((g) => ({
    id: g.id,
    title: g.title,
    url: (g.images.downsized_medium ?? g.images.fixed_width).url,
    preview: (g.images.fixed_width_small ?? g.images.fixed_width).url,
    width: Number(g.images.fixed_width.width),
    height: Number(g.images.fixed_width.height),
  }));
  remember(key, results);
  res.json({ results });
});

export default router;
