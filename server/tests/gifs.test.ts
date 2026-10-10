import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCouple } from './helpers';
import { env } from '../src/config/env';
import { ageGifCache, clearGifCache } from '../src/routes/gifs';

const giphy = (id: string) => ({
  data: [{ id, title: 'hug', images: { fixed_width: { url: `https://media.giphy.com/${id}.gif`, width: '200', height: '150' } } }],
});

describe('GIF search', () => {
  const original = { key: env.GIPHY_API_KEY, enabled: env.gifsEnabled };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.assign(env, { GIPHY_API_KEY: 'test-key', gifsEnabled: true });
    clearGifCache();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    Object.assign(env, { GIPHY_API_KEY: original.key, gifsEnabled: original.enabled });
  });

  it('asks GIPHY once and reuses the answer for both partners', async () => {
    const { one, two } = await makeCouple();
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(giphy('a1')), { status: 200 }));
    const first = await one.get('/api/gifs?q=Hug');
    const second = await two.get('/api/gifs?q=hug');
    expect(first.body.results[0].id).toBe('a1');
    expect(second.body.results[0].id).toBe('a1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("says plainly when the hour's free GIFs are used up", async () => {
    const { one } = await makeCouple();
    fetchSpy.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await one.get('/api/gifs?q=kiss');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('gifs_rate_limited');
    expect(res.body.error.message).toMatch(/back within the hour/);
  });

  it('serves older results when GIPHY refuses', async () => {
    const { one } = await makeCouple();
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(giphy('old')), { status: 200 }));
    await one.get('/api/gifs');
    // Trending is fresh for an hour; pretend that hour has passed.
    ageGifCache(2 * 3600_000);
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const res = await one.get('/api/gifs');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stale: true, results: [{ id: 'old' }] });
  });
});
