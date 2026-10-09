import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { BUCKET_CATEGORIES } from '@/lib/constants';
import { formatDate, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { BucketItem, Media } from '@/lib/types';
import { useCouple } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, Chip, EmptyState, ErrorState, Input, Lightbox, PhotoPicker, Sheet, SkeletonList, Switch, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const KEY = ['bucket'];
const category = (id: string) => BUCKET_CATEGORIES.find((c) => c.id === id) ?? BUCKET_CATEGORIES[BUCKET_CATEGORIES.length - 1];

function ItemSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: BucketItem | null }) {
  const couple = useCouple();
  const queryClient = useQueryClient();
  const today = todayIn(couple.timezone);
  const [form, setForm] = useState({ title: '', category: 'travel', notes: '', done: false, completedAt: '' });
  const [media, setMedia] = useState<Media[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ title: item?.title ?? '', category: item?.category ?? 'travel', notes: item?.notes ?? '', done: item?.done ?? false, completedAt: item?.completedAt ?? '' });
    setMedia(item?.media ?? []);
  }, [open, item]);

  async function save() {
    if (!form.title.trim()) return setError('What do you want to do together?');
    setBusy(true);
    const body = { ...form, title: form.title.trim(), completedAt: form.done ? form.completedAt || today : null, mediaIds: media.map((m) => m.id) };
    try {
      const { items } = item ? await patch<{ items: BucketItem[] }>(`/bucket/${item.id}`, body) : await post<{ items: BucketItem[] }>('/bucket', body);
      queryClient.setQueryData(KEY, items);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!(await confirm({ title: `Remove "${item.title}"?`, body: 'It will be removed from your bucket list for both of you.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await del(`/bucket/${item.id}`);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Bucket list item' : 'Add to bucket list'}
      wide
      footer={
        <div className="flex gap-2">
          {item && (
            <Button variant="outline" aria-label="Remove item" className="text-danger" onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button block size="lg" loading={busy} onClick={save}>
            {item ? 'Save' : 'Add it'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="What's the dream?" placeholder="Watch the sunrise together" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} error={error} data-autofocus />
        <div className="flex flex-wrap gap-2">
          {BUCKET_CATEGORIES.map((c) => (
            <Chip key={c.id} active={form.category === c.id} onClick={() => setForm({ ...form, category: c.id })}>
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>
        <Textarea label="Notes" rows={3} placeholder="Ideas, links, the plan…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
        <Switch label="We did it!" checked={form.done} onChange={(done) => setForm({ ...form, done, completedAt: done ? form.completedAt || today : '' })} />
        {form.done && (
          <>
            <Input label="When" type="date" max={today} value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} />
            <div>
              <p className="mb-1.5 px-1 text-sm font-medium">Photos from the day</p>
              <PhotoPicker value={media} onChange={setMedia} purpose="bucket" />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

export default function BucketList() {
  const queryClient = useQueryClient();
  const { data: items, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => get<{ items: BucketItem[] }>('/bucket').then((r) => r.items) });
  const [filter, setFilter] = useState<string>('all');
  const [sheet, setSheet] = useState<{ open: boolean; item: BucketItem | null }>({ open: false, item: null });
  const [viewer, setViewer] = useState<Media | null>(null);

  const visible = useMemo(() => (items ?? []).filter((i) => filter === 'all' || i.category === filter), [items, filter]);
  const total = items?.length ?? 0;
  const doneCount = items?.filter((i) => i.done).length ?? 0;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;
  const used = new Set(items?.map((i) => i.category));

  async function toggle(item: BucketItem) {
    try {
      const { items: next } = await patch<{ items: BucketItem[] }>(`/bucket/${item.id}`, { done: !item.done });
      queryClient.setQueryData(KEY, next);
      if (!item.done) toast.success('One more off the list!', '🎉');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Page
      title="Bucket list"
      subtitle="Everything you want to do together"
      back={<BackButton />}
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, item: null })}>
          Add
        </Button>
      }
    >
      {isLoading ? (
        <SkeletonList rows={5} className="h-16" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : total === 0 ? (
        <EmptyState emoji="✨" title="Dream a little" body="Travel to Japan. Watch a sunrise. Get matching tattoos. Start your list of things to do together." action={<Button onClick={() => setSheet({ open: true, item: null })}>Add your first dream</Button>} />
      ) : (
        <>
          <Card className="mb-4 p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-display text-3xl leading-none">
                  {doneCount} <span className="text-lg text-muted">of {total}</span>
                </p>
                <p className="mt-1 text-sm text-muted">{doneCount === total ? 'Every single one. Time to dream bigger.' : 'done together so far'}</p>
              </div>
              <p className="font-display text-2xl text-accent">{percent}%</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Bucket list progress">
              <div className="h-full rounded-full accent-gradient transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
          </Card>

          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </Chip>
            {BUCKET_CATEGORIES.filter((c) => used.has(c.id)).map((c) => (
              <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
                {c.emoji} {c.label}
              </Chip>
            ))}
          </div>

          <ul className="space-y-2.5">
            {visible.map((item) => (
              <li key={item.id}>
                <Card className="flex items-start gap-3 p-4">
                  <button
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={`Mark "${item.title}" as ${item.done ? 'not done' : 'done'}`}
                    onClick={() => toggle(item)}
                    className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90', item.done ? 'border-accent bg-accent text-on-accent' : 'border-faint hover:border-accent')}
                  >
                    {item.done && <Check className="size-4" strokeWidth={3} />}
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ open: true, item })}>
                    <p className={cn('font-semibold', item.done && 'text-muted line-through')}>{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {category(item.category).emoji} {category(item.category).label}
                      {item.done && item.completedAt && ` · Done ${formatDate(item.completedAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                    {item.notes && <p className="mt-1 line-clamp-2 text-sm text-muted">{item.notes}</p>}
                  </button>
                  {item.media.length > 0 && (
                    <button onClick={() => setViewer(item.media[0])} className="relative size-14 shrink-0 overflow-hidden rounded-xl" aria-label="View photo">
                      <img src={item.media[0].thumbUrl ?? item.media[0].url} alt="" className="size-full object-cover" loading="lazy" />
                      {item.media.length > 1 && <span className="absolute bottom-0 right-0 rounded-tl-lg bg-black/60 px-1 text-[10px] text-white">+{item.media.length - 1}</span>}
                    </button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      <ItemSheet open={sheet.open} item={sheet.item} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
      <Lightbox media={viewer} onClose={() => setViewer(null)} />
    </Page>
  );
}
