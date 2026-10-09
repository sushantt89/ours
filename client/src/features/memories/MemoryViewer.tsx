import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Heart, Lock, MessageCircle, Pause, Pencil, Play, SendHorizontal, Trash2, X } from 'lucide-react';
import { del, errorMessage, patch, post } from '@/lib/api';
import { REACTIONS } from '@/lib/constants';
import { formatDate, timeAgo, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Album, Memory } from '@/lib/types';
import { useCouple, useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Chip, Input, PlaceInput, Sheet, StorageBadge, Switch, Textarea, type PlaceValue } from '@/components/ui';

interface Props {
  memories: Memory[];
  index: number | null;
  onIndex: (index: number | null) => void;
  albums: Album[];
  startSlideshow?: boolean;
}

function EditSheet({ memory, albums, onClose }: { memory: Memory | null; albums: Album[]; onClose: () => void }) {
  const me = useMe();
  const couple = useCouple();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ caption: '', event: '', location: '', date: '', albumIds: [] as string[], isPrivate: false });
  const [place, setPlace] = useState<PlaceValue>({ label: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (memory) {
      setForm({ caption: memory.caption, event: memory.event, location: memory.location, date: memory.date, albumIds: memory.albumIds, isPrivate: memory.visibility === 'private' });
      setPlace({ label: memory.location });
    }
  }, [memory]);

  async function save() {
    if (!memory) return;
    setBusy(true);
    try {
      const { isPrivate, ...rest } = form;
      await patch(`/memories/${memory.id}`, {
        ...rest,
        location: place.label.trim(),
        ...(place.lat !== undefined ? { lat: place.lat, lng: place.lng } : {}),
        ...(memory.authorId === me.id ? { visibility: isPrivate ? 'private' : 'shared' } : {}),
      });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['memories'] }), queryClient.invalidateQueries({ queryKey: ['albums'] })]);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(memory)} onClose={onClose} title="Edit memory" footer={<Button block size="lg" loading={busy} onClick={save}>Save</Button>}>
      <div className="space-y-4">
        <Textarea label="Caption" rows={2} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} maxLength={1000} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="When" type="date" max={todayIn(couple.timezone)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <PlaceInput value={place} onChange={setPlace} />
        </div>
        <Input label="Event" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} maxLength={80} />
        {albums.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {albums.map((a) => (
              <Chip
                key={a.id}
                active={form.albumIds.includes(a.id)}
                onClick={() => setForm((f) => ({ ...f, albumIds: f.albumIds.includes(a.id) ? f.albumIds.filter((x) => x !== a.id) : [...f.albumIds, a.id] }))}
              >
                {a.emoji} {a.name}
              </Chip>
            ))}
          </div>
        )}
        {memory?.authorId === me.id && <Switch label="Keep private" hint="Only you can see this memory." checked={form.isPrivate} onChange={(v) => setForm({ ...form, isPrivate: v })} />}
      </div>
    </Sheet>
  );
}

/** Full-screen gallery: swipe or arrow through memories, react, comment, or sit back for a slideshow. */
export function MemoryViewer({ memories, index, onIndex, albums, startSlideshow }: Props) {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const memory = index !== null ? memories[index] : null;
  const [playing, setPlaying] = useState(false);
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [comment, setComment] = useState('');
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (by: number) => {
      if (index === null) return;
      const next = index + by;
      if (next >= 0 && next < memories.length) onIndex(next);
      else if (by > 0) setPlaying(false);
    },
    [index, memories.length, onIndex],
  );

  useEffect(() => {
    if (index !== null && startSlideshow) setPlaying(true);
    if (index === null) {
      setPlaying(false);
      setDetails(false);
    }
  }, [index === null, startSlideshow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (editing || details) return;
      if (e.key === 'Escape') onIndex(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, go, onIndex, editing, details]);

  // Slideshow: photos advance on a timer, videos when they finish.
  useEffect(() => {
    if (!playing || !memory || memory.kind === 'video') return;
    const timer = setTimeout(() => go(1), 4000);
    return () => clearTimeout(timer);
  }, [playing, memory, go]);

  if (!memory || !memory.media) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['memories'] });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const myReaction = memory.reactions.find((r) => r.userId === me.id)?.emoji;
  const nameOf = (id: string) => (id === me.id ? 'You' : (partner?.name ?? 'Partner'));

  async function remove() {
    if (!(await confirm({ title: 'Delete this memory?', body: 'The photo or video will be permanently removed for both of you.', confirmLabel: 'Delete', danger: true }))) return;
    await run(() => del(`/memories/${memory!.id}`));
    await queryClient.invalidateQueries({ queryKey: ['albums'] });
    if (memories.length <= 1) onIndex(null);
    else if (index === memories.length - 1) onIndex(index - 1);
  }

  function addComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment('');
    void run(() => post(`/memories/${memory!.id}/comments`, { text }));
  }

  const iconButton = 'grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-90';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Memory" className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button aria-label="Close" className={iconButton} onClick={() => onIndex(null)}>
          <X className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium opacity-90">
          {formatDate(memory.date)} · {index! + 1} of {memories.length}
        </p>
        <button aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} className={iconButton} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          if (!touch.current) return;
          const dx = e.changedTouches[0].clientX - touch.current.x;
          const dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) onIndex(null);
          touch.current = null;
        }}
      >
        {memory.kind === 'video' ? (
          <video key={memory.id} src={memory.media.url} poster={memory.media.thumbUrl ?? undefined} controls autoPlay playsInline className="max-h-full max-w-full" onEnded={() => playing && go(1)} />
        ) : (
          <img key={memory.id} src={memory.media.url} alt={memory.caption || 'Memory'} className="max-h-full max-w-full animate-fade-up object-contain" />
        )}
        {index! > 0 && (
          <button aria-label="Previous" className={cn(iconButton, 'absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid')} onClick={() => go(-1)}>
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index! < memories.length - 1 && (
          <button aria-label="Next" className={cn(iconButton, 'absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid')} onClick={() => go(1)}>
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {!playing && (
        <div className="safe-bottom bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-4 pt-10">
          <div className="mx-auto max-w-2xl">
            {(memory.caption || memory.location || memory.event) && (
              <div className="mb-3">
                {memory.caption && <p className="text-[15px] leading-snug">{memory.caption}</p>}
                <p className="mt-1 text-sm text-white/70">{[memory.event, memory.location && `📍 ${memory.location}`].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                aria-label={memory.favorite ? 'Remove from favourites' : 'Add to favourites'}
                aria-pressed={memory.favorite}
                className={cn(iconButton, memory.favorite && 'bg-white text-rose-500 hover:bg-white')}
                onClick={() => run(() => post(`/memories/${memory.id}/favorite`, { favorite: !memory.favorite }))}
              >
                <Heart className={cn('size-5', memory.favorite && 'fill-current')} />
              </button>
              <button aria-label="Comments and details" className="flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-white backdrop-blur transition hover:bg-white/20 active:scale-90" onClick={() => setDetails(true)}>
                <MessageCircle className="size-5" />
                {memory.comments.length > 0 && <span className="text-sm font-medium">{memory.comments.length}</span>}
              </button>
              {memory.reactions.length > 0 && (
                <span className="rounded-full bg-white/10 px-2.5 py-2 text-lg leading-none backdrop-blur">{memory.reactions.map((r) => r.emoji).join('')}</span>
              )}
              {memory.visibility === 'private' && (
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 text-xs backdrop-blur">
                  <Lock className="size-3.5" /> Private
                </span>
              )}
              <span className="flex-1" />
              <button aria-label="Edit details" className={iconButton} onClick={() => setEditing(memory)}>
                <Pencil className="size-5" />
              </button>
              <a aria-label="Download" className={iconButton} href={`${memory.media.url}?download=1`} download={memory.media.name}>
                <Download className="size-5" />
              </a>
              <button aria-label="Delete" className={iconButton} onClick={remove}>
                <Trash2 className="size-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={details} onClose={() => setDetails(false)} title="Reactions & comments">
        <div className="flex justify-between gap-1" role="group" aria-label="React">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              aria-label={`React with ${emoji}`}
              aria-pressed={myReaction === emoji}
              onClick={() => run(() => post(`/memories/${memory.id}/react`, { emoji }))}
              className={cn('grid size-10 place-items-center rounded-full text-2xl transition hover:scale-110 active:scale-125', myReaction === emoji ? 'bg-accent-soft' : 'bg-surface-2')}
            >
              {emoji}
            </button>
          ))}
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          Added by {nameOf(memory.authorId).toLowerCase() === 'you' ? 'you' : nameOf(memory.authorId)} · {timeAgo(memory.createdAt)} <StorageBadge storage={memory.media.storage} />
        </p>
        <ul className="mt-4 space-y-3">
          {memory.comments.length === 0 && <li className="py-4 text-center text-muted">No comments yet. Say something sweet.</li>}
          {memory.comments.map((c) => (
            <li key={c.id} className="group flex items-start gap-2">
              <div className="min-w-0 flex-1 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                <p className="text-xs font-semibold text-muted">
                  {nameOf(c.userId)} · {timeAgo(c.createdAt)}
                </p>
                <p className="break-words">{c.text}</p>
              </div>
              {c.userId === me.id && (
                <button aria-label="Delete comment" className="mt-2 text-faint hover:text-danger" onClick={() => run(() => del(`/memories/${memory.id}/comments/${c.id}`))}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addComment} className="mt-4 flex gap-2">
          <div className="flex-1">
            <Input aria-label="Add a comment" placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
          </div>
          <Button type="submit" className="h-12 w-12 px-0" aria-label="Post comment" disabled={!comment.trim()}>
            <SendHorizontal className="size-5" />
          </Button>
        </form>
      </Sheet>

      <EditSheet memory={editing} albums={albums} onClose={() => setEditing(null)} />
    </div>,
    document.body,
  );
}
