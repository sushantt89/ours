import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import type { Album, Memory } from '@/lib/types';

export interface MemoryFilters {
  album?: string;
  month?: string;
  year?: string;
  event?: string;
  favorite?: boolean;
  q?: string;
}

function toQuery(filters: MemoryFilters, page: number) {
  const params = new URLSearchParams({ page: String(page), limit: '60' });
  if (filters.album) params.set('album', filters.album);
  if (filters.month) params.set('month', filters.month);
  else if (filters.year) params.set('year', filters.year);
  if (filters.event) params.set('event', filters.event);
  if (filters.favorite) params.set('favorite', '1');
  if (filters.q) params.set('q', filters.q);
  return params.toString();
}

export const useMemories = (filters: MemoryFilters, enabled = true) =>
  useInfiniteQuery({
    queryKey: ['memories', 'list', filters],
    queryFn: ({ pageParam }) => get<{ memories: Memory[]; hasMore: boolean }>(`/memories?${toQuery(filters, pageParam)}`),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled,
  });

export const useOnThisDay = (enabled = true) =>
  useQuery({ queryKey: ['memories', 'on-this-day'], queryFn: () => get<{ memories: Memory[] }>('/memories/on-this-day').then((r) => r.memories), enabled });

export const useAlbums = () => useQuery({ queryKey: ['albums'], queryFn: () => get<{ albums: Album[] }>('/albums').then((r) => r.albums) });

export const useFacets = () =>
  useQuery({
    queryKey: ['memories', 'facets'],
    queryFn: () => get<{ total: number; months: { month: string; count: number }[]; events: { event: string; count: number }[] }>('/memories/facets'),
  });
