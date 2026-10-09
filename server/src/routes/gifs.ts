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

router.get('/', async (req, res) => {
  if (!env.gifsEnabled) throw new HttpError(503, 'GIF search is not configured on this server', 'gifs_disabled');
  const query = z
    .object({ q: z.string().trim().max(60).default(''), type: z.enum(['gifs', 'stickers']).default('gifs') })
    .parse(req.query);
  const params = new URLSearchParams({ api_key: env.GIPHY_API_KEY!, limit: '24', rating: 'pg-13' });
  if (query.q) params.set('q', query.q);
  const endpoint = `https://api.giphy.com/v1/${query.type}/${query.q ? 'search' : 'trending'}?${params}`;
  const response = await fetch(endpoint).catch(() => null);
  if (!response?.ok) throw new HttpError(502, 'GIF search is unavailable right now', 'gifs_unavailable');
  const data = (await response.json()) as { data: GiphyItem[] };
  res.json({
    results: data.data.map((g) => ({
      id: g.id,
      title: g.title,
      url: (g.images.downsized_medium ?? g.images.fixed_width).url,
      preview: (g.images.fixed_width_small ?? g.images.fixed_width).url,
      width: Number(g.images.fixed_width.width),
      height: Number(g.images.fixed_width.height),
    })),
  });
});

export default router;
