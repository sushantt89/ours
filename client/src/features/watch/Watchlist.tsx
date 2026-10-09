import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, Plus, Star, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { WATCH_KINDS } from '@/lib/constants';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { WatchItem } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, Chip, EmptyState, ErrorState, Input, Segmented, Sheet, SkeletonList, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const KEY = ['watchlist'];
const kindOf = (id: string) => WATCH_KINDS.find((k) => k.id === id) ?? WATCH_KINDS[WATCH_KINDS.length - 1];

function Stars({ value, onChange, label }: { value: number; onChange?: (v: number) => void; label: string }) {
  return (
    <span className="inline-flex items-center" role={onChange ? 'radiogroup' : 'img'} aria-label={`${label}: ${value || 'not rated'}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={onChange ? `${n} star${n > 1 ? 's' : ''}` : undefined}
          onClick={() => onChange?.(value === n ? 0 : n)}
          className={cn('p-0.5 transition', onChange && 'active:scale-125')}
        >
          <Star className={cn('size-[18px]', n <= value ? 'fill-amber-400 text-amber-400' : 'text-line')} />
        </button>
      ))}
    </span>
  );
}

function ItemSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: WatchItem | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', kind: 'movie', year: '', whereToWatch: '', notes: '', status: 'want' as WatchItem['status'] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ title: item?.title ?? '', kind: item?.kind ?? 'movie', year: item?.year ? String(item.year) : '', whereToWatch: item?.whereToWatch ?? '', notes: item?.notes ?? '', status: item?.status ?? 'want' });
  }, [open, item]);

  async function save() {
    if (!form.title.trim()) return setError('What should you watch?');
    setBusy(true);
    const body = { ...form, title: form.title.trim(), year: form.year ? Number(form.year) : null };
    try {
      if (item) await patch(`/watchlist/${item.id}`, body);
      else await post('/watchlist', body);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item || !(await confirm({ title: `Remove "${item.title}"?`, confirmLabel: 'Remove', danger: true }))) return;
    await del(`/watchlist/${item.id}`).catch((err) => toast.error(errorMessage(err)));
    await queryClient.invalidateQueries({ queryKey: KEY });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Edit' : 'Add to watchlist'}
      footer={
        <div className="flex gap-2">
          {item && (
            <Button variant="outline" className="text-danger" aria-label="Remove" onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button block size="lg" loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Title" placeholder="Past Lives" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} error={error} data-autofocus />
        <div className="flex flex-wrap gap-2">
          {WATCH_KINDS.map((k) => (
            <Chip key={k.id} active={form.kind === k.id} onClick={() => setForm({ ...form, kind: k.id })}>
              {k.emoji} {k.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Year" inputMode="numeric" placeholder="2023" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          <Input label="Where to watch" placeholder="Netflix" value={form.whereToWatch} onChange={(e) => setForm({ ...form, whereToWatch: e.target.value })} maxLength={60} />
        </div>
        <Textarea label="Notes" rows={2} placeholder="Who recommended it, why you want to see it…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
        <Segmented
          label="Status"
          className="w-full"
          value={form.status}
          onChange={(status) => setForm({ ...form, status })}
          options={[
            { value: 'want', label: 'To watch' },
            { value: 'watching', label: 'Watching' },
            { value: 'watched', label: 'Watched' },
          ]}
        />
      </div>
    </Sheet>
  );
}

export default function Watchlist() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => get<{ items: WatchItem[] }>('/watchlist').then((r) => r.items) });
  const [tab, setTab] = useState<WatchItem['status']>('want');
  const [sheet, setSheet] = useState<{ open: boolean; item: WatchItem | null }>({ open: false, item: null });
  const [pick, setPick] = useState<WatchItem | null>(null);

  const list = useMemo(() => (data ?? []).filter((i) => i.status === tab), [data, tab]);
  const counts = useMemo(() => ({ want: 0, watching: 0, watched: 0, ...Object.fromEntries(['want', 'watching', 'watched'].map((s) => [s, (data ?? []).filter((i) => i.status === s).length])) }), [data]);

  const run = (fn: () => Promise<unknown>) => fn().then(() => queryClient.invalidateQueries({ queryKey: KEY })).catch((err) => toast.error(errorMessage(err)));

  function surprise() {
    const pool = (data ?? []).filter((i) => i.status === 'want');
    if (!pool.length) return toast.info('Add a few things to watch first', '🍿');
    setPick(pool[Math.floor(Math.random() * pool.length)]);
  }

  return (
    <Page
      title="Watchlist"
      subtitle="Films and series to watch together"
      back={<BackButton />}
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, item: null })}>
          Add
        </Button>
      }
    >
      <Card className="mb-4 flex items-center gap-3 p-4">
        <span className="text-3xl">🍿</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Can't decide what to watch?</p>
          <p className="text-sm text-muted">Let the app pick from your list.</p>
        </div>
        <Button variant="soft" size="sm" icon={<Dices className="size-4" />} onClick={surprise}>
          Pick
        </Button>
      </Card>

      <Segmented
        label="Show"
        className="mb-4 w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'want', label: `To watch${counts.want ? ` · ${counts.want}` : ''}` },
          { value: 'watching', label: `Watching${counts.watching ? ` · ${counts.watching}` : ''}` },
          { value: 'watched', label: `Watched${counts.watched ? ` · ${counts.watched}` : ''}` },
        ]}
      />

      {isLoading ? (
        <SkeletonList rows={4} className="h-20" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState emoji={tab === 'watched' ? '🎞️' : '🎬'} title={tab === 'watched' ? 'Nothing watched yet' : tab === 'watching' ? 'Nothing on the go' : 'Your watchlist is empty'} body={tab === 'want' ? 'Add the films and shows you keep saying you should watch together.' : undefined} />
      ) : (
        <div className="space-y-2.5">
          {list.map((item) => {
            const mine = item.ratings.find((r) => r.userId === me.id)?.stars ?? 0;
            const theirs = item.ratings.find((r) => r.userId !== me.id)?.stars ?? 0;
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl">{kindOf(item.kind).emoji}</span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ open: true, item })}>
                    <p className="font-semibold leading-snug">
                      {item.title} {item.year && <span className="font-normal text-muted">({item.year})</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {[kindOf(item.kind).label, item.whereToWatch, item.watchedAt && `watched ${formatDate(item.watchedAt, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · ')}
                    </p>
                    {item.notes && <p className="mt-1 line-clamp-2 text-sm text-muted">{item.notes}</p>}
                  </button>
                  {item.status !== 'watched' && (
                    <Button size="sm" variant="soft" onClick={() => run(() => patch(`/watchlist/${item.id}`, { status: item.status === 'want' ? 'watching' : 'watched' }))}>
                      {item.status === 'want' ? 'Start' : 'Done'}
                    </Button>
                  )}
                </div>
                {item.status === 'watched' && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line/70 pt-3 text-sm">
                    <span className="flex items-center gap-2">
                      You <Stars label="Your rating" value={mine} onChange={(stars) => run(() => post(`/watchlist/${item.id}/rate`, { stars }))} />
                    </span>
                    <span className="flex items-center gap-2 text-muted">
                      {partner?.name ?? 'Partner'} <Stars label={`${partner?.name ?? 'Partner'}'s rating`} value={theirs} />
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ItemSheet open={sheet.open} item={sheet.item} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
      <Sheet open={Boolean(pick)} onClose={() => setPick(null)} variant="center">
        {pick && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-4 text-center">
            <p className="text-6xl">{kindOf(pick.kind).emoji}</p>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted">Tonight you're watching</p>
            <p className="mt-1 font-display text-3xl leading-tight">{pick.title}</p>
            {pick.whereToWatch && <p className="mt-1 text-muted">on {pick.whereToWatch}</p>}
            <div className="mt-6 flex gap-2">
              <Button variant="outline" block onClick={surprise}>
                Another
              </Button>
              <Button
                block
                onClick={() => {
                  void run(() => patch(`/watchlist/${pick.id}`, { status: 'watching' }));
                  setPick(null);
                  setTab('watching');
                }}
              >
                Let's watch
              </Button>
            </div>
          </motion.div>
        )}
      </Sheet>
    </Page>
  );
}
