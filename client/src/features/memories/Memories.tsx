import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Heart, Lock, MoreHorizontal, Play, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { del, errorMessage, patch, post } from '@/lib/api';
import { formatMonth } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Album, Memory } from '@/lib/types';
import { confirm, toast } from '@/store/ui';
import { Button, Chip, EmojiButton, EmptyState, ErrorState, IconButton, Input, Segmented, Select, Sheet, Skeleton, Spinner } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { useAlbums, useFacets, useMemories, useOnThisDay, type MemoryFilters } from './api';
import { MemoryViewer } from './MemoryViewer';
import { UploadSheet } from './UploadSheet';

function Tile({ memory, onOpen }: { memory: Memory; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group relative aspect-square overflow-hidden rounded-2xl bg-surface-2" aria-label={memory.caption || `Memory from ${memory.date}`}>
      {memory.media?.thumbUrl ? (
        <img src={memory.media.thumbUrl} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />
      ) : (
        <span className="grid size-full place-items-center bg-ink/80 text-3xl">🎬</span>
      )}
      {memory.kind === 'video' && <Play className="absolute left-2 top-2 size-4 fill-white text-white drop-shadow" />}
      <span className="absolute right-1.5 top-1.5 flex gap-1">
        {memory.visibility === 'private' && (
          <span className="grid size-6 place-items-center rounded-full bg-black/50 text-white backdrop-blur" title="Private">
            <Lock className="size-3" />
          </span>
        )}
        {memory.favorite && (
          <span className="grid size-6 place-items-center rounded-full bg-white/90 text-rose-500">
            <Heart className="size-3 fill-current" />
          </span>
        )}
      </span>
      {memory.reactions.length > 0 && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-xs backdrop-blur">{memory.reactions.map((r) => r.emoji).join('')}</span>}
    </button>
  );
}

function AlbumSheet({ open, onClose, album }: { open: boolean; onClose: () => void; album: Album | null }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('❤️');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(album?.name ?? '');
      setEmoji(album?.emoji ?? '❤️');
    }
  }, [open, album]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (album) await patch(`/albums/${album.id}`, { name: name.trim(), emoji });
      else await post('/albums', { name: name.trim(), emoji });
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!album) return;
    if (!(await confirm({ title: `Delete "${album.name}"?`, body: 'The photos stay in your memories. Only the album is removed.', confirmLabel: 'Delete album', danger: true }))) return;
    try {
      await del(`/albums/${album.id}`);
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={album ? 'Edit album' : 'New album'}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-end gap-3">
          <EmojiButton value={emoji} onChange={setEmoji} />
          <div className="flex-1">
            <Input label="Album name" placeholder="Holidays" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} data-autofocus />
          </div>
        </div>
        <Button type="submit" block size="lg" loading={busy} disabled={!name.trim()}>
          {album ? 'Save' : 'Create album'}
        </Button>
        {album && (
          <Button variant="ghost" block className="text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
            Delete album
          </Button>
        )}
      </form>
    </Sheet>
  );
}

type View = 'timeline' | 'albums';

export default function Memories() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('timeline');
  const [filters, setFilters] = useState<MemoryFilters>({});
  const [onThisDay, setOnThisDay] = useState(params.get('view') === 'on-this-day');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(params.get('add') === '1');
  const [albumSheet, setAlbumSheet] = useState<{ open: boolean; album: Album | null }>({ open: false, album: null });
  const [viewer, setViewer] = useState<{ index: number | null; slideshow: boolean }>({ index: null, slideshow: false });
  const sentinel = useRef<HTMLDivElement>(null);

  const albums = useAlbums();
  const facets = useFacets();
  const list = useMemories(filters, !onThisDay);
  const today = useOnThisDay(onThisDay);

  useEffect(() => {
    if (params.has('add') || params.has('view')) setParams({}, { replace: true });
    // Viewing the gallery clears the "new memories" count on the home screen.
    void post('/memories/seen').catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: search.trim() || undefined })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load the next page as the end of the grid scrolls into view
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
    }, { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const memories = useMemo(() => (onThisDay ? (today.data ?? []) : (list.data?.pages.flatMap((p) => p.memories) ?? [])), [onThisDay, today.data, list.data]);

  const groups = useMemo(() => {
    const out: { month: string; items: { memory: Memory; index: number }[] }[] = [];
    memories.forEach((memory, index) => {
      const month = memory.date.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.month === month) last.items.push({ memory, index });
      else out.push({ month, items: [{ memory, index }] });
    });
    return out;
  }, [memories]);

  const activeAlbum = albums.data?.find((a) => a.id === filters.album);
  const loading = onThisDay ? today.isLoading : list.isLoading;
  const failed = onThisDay ? today.isError : list.isError;
  const filtered = Boolean(filters.album || filters.month || filters.year || filters.event || filters.favorite || filters.q || onThisDay);
  const years = useMemo(() => [...new Set((facets.data?.months ?? []).map((m) => m.month.slice(0, 4)))], [facets.data]);

  const clear = () => {
    setFilters({});
    setSearch('');
    setOnThisDay(false);
  };

  return (
    <Page
      title={activeAlbum ? `${activeAlbum.emoji} ${activeAlbum.name}` : 'Memories'}
      subtitle={facets.data ? `${facets.data.total.toLocaleString()} ${facets.data.total === 1 ? 'memory' : 'memories'} together` : undefined}
      wide
      actions={
        <>
          <IconButton label="Search memories" active={searching} onClick={() => setSearching((s) => !s)}>
            <Search className="size-5" />
          </IconButton>
          <IconButton label="Filter by date or event" active={Boolean(filters.month || filters.year || filters.event)} onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="size-5" />
          </IconButton>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setUploadOpen(true)}>
            Add
          </Button>
        </>
      }
    >
      {searching && (
        <div className="mb-3 animate-fade-up">
          <Input aria-label="Search memories" placeholder="Search captions, places and events" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <Segmented
          label="View"
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'albums', label: 'Albums' },
          ]}
        />
        {view === 'timeline' && (
          <div className="no-scrollbar -mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4">
            <Chip active={Boolean(filters.favorite)} onClick={() => { setOnThisDay(false); setFilters((f) => ({ ...f, favorite: !f.favorite })); }}>
              <Heart className="size-3.5" /> Favourites
            </Chip>
            <Chip active={onThisDay} onClick={() => setOnThisDay((v) => !v)}>
              📸 On this day
            </Chip>
            {filtered && (
              <Chip onClick={clear}>
                <X className="size-3.5" /> Clear
              </Chip>
            )}
          </div>
        )}
      </div>

      {view === 'albums' ? (
        albums.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {albums.data?.map((album) => (
              <div key={album.id} className="group relative">
                <button
                  onClick={() => {
                    setOnThisDay(false);
                    setFilters({ album: album.id });
                    setView('timeline');
                  }}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[24px] bg-accent-soft shadow-card">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />
                    ) : (
                      <span className="grid size-full place-items-center text-5xl">{album.emoji}</span>
                    )}
                  </div>
                  <p className="mt-2 truncate font-semibold">
                    {album.emoji} {album.name}
                  </p>
                  <p className="text-sm text-muted">
                    {album.count} {album.count === 1 ? 'memory' : 'memories'}
                  </p>
                </button>
                <button
                  aria-label={`Edit album ${album.name}`}
                  onClick={() => setAlbumSheet({ open: true, album })}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setAlbumSheet({ open: true, album: null })}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-line text-muted transition hover:border-accent hover:text-accent"
            >
              <Plus className="size-7" />
              <span className="text-sm font-medium">New album</span>
            </button>
          </div>
        )
      ) : loading ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5" role="status" aria-label="Loading memories">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : failed ? (
        <ErrorState onRetry={() => (onThisDay ? today.refetch() : list.refetch())} />
      ) : memories.length === 0 ? (
        onThisDay ? (
          <EmptyState emoji="🗓️" title="Nothing from this day, yet" body="When you have memories from this date in earlier years, they'll resurface here." />
        ) : filtered ? (
          <EmptyState emoji="🔎" title="No memories match" body="Try a different search or clear the filters." action={<Button variant="soft" onClick={clear}>Clear filters</Button>} />
        ) : (
          <EmptyState emoji="📸" title="Your gallery starts here" body="Add the photos and videos you never want to lose. Only the two of you can see them." action={<Button onClick={() => setUploadOpen(true)}>Add your first memory</Button>} />
        )
      ) : (
        <>
          {memories.length > 1 && (
            <div className="mb-3 flex justify-end">
              <Button variant="soft" size="sm" icon={<Play className="size-4" />} onClick={() => setViewer({ index: 0, slideshow: true })}>
                Slideshow
              </Button>
            </div>
          )}
          {groups.map((group) => (
            <section key={group.month} className="mb-6">
              <h2 className="mb-2 px-1 font-display text-lg">{formatMonth(group.month)}</h2>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
                {group.items.map(({ memory, index }) => (
                  <Tile key={memory.id} memory={memory} onOpen={() => setViewer({ index, slideshow: false })} />
                ))}
              </div>
            </section>
          ))}
          <div ref={sentinel} className="grid h-10 place-items-center text-accent">
            {list.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter memories">
        <div className="space-y-4">
          <Select label="Year" value={filters.year ?? ''} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value || undefined, month: undefined }))}>
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </Select>
          <Select label="Month" value={filters.month ?? ''} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value || undefined }))}>
            <option value="">Any month</option>
            {facets.data?.months
              .filter((m) => !filters.year || m.month.startsWith(filters.year))
              .map((m) => (
                <option key={m.month} value={m.month}>
                  {formatMonth(m.month)} ({m.count})
                </option>
              ))}
          </Select>
          <Select label="Event" value={filters.event ?? ''} onChange={(e) => setFilters((f) => ({ ...f, event: e.target.value || undefined }))}>
            <option value="">Any event</option>
            {facets.data?.events.map((ev) => (
              <option key={ev.event} value={ev.event}>
                {ev.event} ({ev.count})
              </option>
            ))}
          </Select>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" block onClick={() => setFilters((f) => ({ ...f, year: undefined, month: undefined, event: undefined }))}>
              Reset
            </Button>
            <Button block onClick={() => { setOnThisDay(false); setFilterOpen(false); }}>
              Show memories
            </Button>
          </div>
        </div>
      </Sheet>

      <UploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} albums={albums.data ?? []} defaultAlbum={filters.album} />
      <AlbumSheet open={albumSheet.open} album={albumSheet.album} onClose={() => setAlbumSheet((s) => ({ ...s, open: false }))} />
      <MemoryViewer
        memories={memories}
        index={viewer.index !== null && viewer.index < memories.length ? viewer.index : null}
        onIndex={(index) => setViewer((v) => ({ index, slideshow: index === null ? false : v.slideshow }))}
        albums={albums.data ?? []}
        startSlideshow={viewer.slideshow}
      />
    </Page>
  );
}
