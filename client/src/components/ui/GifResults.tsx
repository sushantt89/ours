import { useEffect, useState } from 'react';
import { errorMessage, get } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export interface Gif {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title: string;
}

const cache = new Map<string, { at: number; results: Gif[] }>();
const CACHE_MS = 10 * 60_000;

/** GIPHY search through our server (the free key has an hourly limit, so results are cached briefly). */
export async function searchGifs(query: string, type: 'gifs' | 'stickers' = 'gifs', signal?: AbortSignal): Promise<Gif[]> {
  const key = `${type}:${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  const { results } = await get<{ results: Gif[] }>(`/gifs?type=${type}&q=${encodeURIComponent(query)}`, signal);
  cache.set(key, { at: Date.now(), results });
  return results;
}

/** A random GIF for a phrase, picked from the top results so it stays on topic. */
export async function randomGif(query: string): Promise<Gif | null> {
  const results = await searchGifs(query);
  const pool = results.slice(0, 15);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export function GifResults({
  type,
  onPick,
  initialQuery = '',
  className,
}: {
  type: 'gifs' | 'stickers';
  onPick: (gif: Gif) => void;
  initialQuery?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Gif[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // A single letter isn't worth one of the hour's GIF searches.
    if (query.trim().length === 1) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError('');
      searchGifs(query, type, controller.signal)
        .then(setResults)
        .catch((err) => err.name !== 'AbortError' && setError(errorMessage(err)));
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, type]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${type === 'gifs' ? 'GIFs' : 'stickers'}`}
        aria-label={`Search ${type}`}
        className="mb-2 h-10 w-full rounded-full border border-line bg-surface-2 px-4 text-sm outline-none focus:border-accent"
      />
      {error ? (
        <p className="py-6 text-center text-sm text-muted">{error}</p>
      ) : !results ? (
        <div className="grid place-items-center py-8 text-accent">
          <Spinner />
        </div>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing found. Try another word.</p>
      ) : (
        <div className={cn('grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain', className)}>
          {results.map((gif) => (
            <button key={gif.id} onClick={() => onPick(gif)} className="overflow-hidden rounded-xl bg-surface-2" aria-label={gif.title || 'GIF'}>
              <img src={gif.preview} alt="" loading="lazy" className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-right text-[10px] uppercase tracking-wider text-faint">Powered by GIPHY</p>
    </div>
  );
}
