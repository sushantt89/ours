import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Lock, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { daysBetween, formatDate, nextOccurrence, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Gift, Media } from '@/lib/types';
import { useCouple, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, EmptyState, ErrorState, Input, PhotoPicker, Segmented, Sheet, SkeletonList, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

type Tab = 'theirs' | 'mine' | 'ideas';
const KEY = ['gifts'];

function GiftSheet({ open, onClose, gift, kind }: { open: boolean; onClose: () => void; gift: Gift | null; kind: 'wish' | 'idea' }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', url: '', price: '', notes: '', occasion: '', priority: 2, status: 'open' as Gift['status'] });
  const [image, setImage] = useState<Media[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ title: gift?.title ?? '', url: gift?.url ?? '', price: gift?.price ?? '', notes: gift?.notes ?? '', occasion: gift?.occasion ?? '', priority: gift?.priority ?? 2, status: gift?.status ?? 'open' });
    setImage(gift?.image ? [gift.image] : []);
  }, [open, gift]);

  async function save() {
    if (!form.title.trim()) return setError('What is it?');
    if (form.url && !/^https?:\/\//.test(form.url)) return setError('Links start with https://');
    setBusy(true);
    const body = { ...form, title: form.title.trim(), url: form.url || null, price: form.price || null, mediaId: image[0]?.id ?? null };
    try {
      const { items } = gift ? await patch<{ items: Gift[] }>(`/gifts/${gift.id}`, body) : await post<{ items: Gift[] }>('/gifts', { ...body, kind });
      queryClient.setQueryData(KEY, items);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!gift || !(await confirm({ title: `Remove "${gift.title}"?`, confirmLabel: 'Remove', danger: true }))) return;
    try {
      await del(`/gifts/${gift.id}`);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const isIdea = (gift?.kind ?? kind) === 'idea';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={gift ? 'Edit' : isIdea ? 'New secret gift idea' : 'Add to my wishlist'}
      footer={
        <div className="flex gap-2">
          {gift && (
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
        {isIdea && (
          <p className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
            <Lock className="size-4 shrink-0" /> Only you can see your gift ideas.
          </p>
        )}
        <Input label="What is it?" placeholder={isIdea ? 'Pottery class' : 'Film camera'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} error={error} data-autofocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Price" placeholder="$150" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} maxLength={40} />
          <Input label="For" placeholder="Birthday" value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} maxLength={60} />
        </div>
        <Input label="Link" placeholder="https://" inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <Textarea label="Notes" rows={2} placeholder={isIdea ? 'Where to buy, size, colour…' : 'Size, colour, the exact one…'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
        <div>
          <p className="mb-1.5 px-1 text-sm font-medium">{isIdea ? 'How good an idea?' : 'How much do you want it?'}</p>
          <Segmented
            label="Priority"
            className="w-full"
            value={String(form.priority)}
            onChange={(v) => setForm({ ...form, priority: Number(v) })}
            options={[
              { value: '1', label: 'Nice' },
              { value: '2', label: 'Really' },
              { value: '3', label: isIdea ? 'Perfect' : 'Dream' },
            ]}
          />
        </div>
        {!isIdea && gift && (
          <Segmented
            label="Status"
            className="w-full"
            value={form.status === 'given' ? 'given' : 'open'}
            onChange={(status) => setForm({ ...form, status })}
            options={[
              { value: 'open', label: 'Still wanted' },
              { value: 'given', label: 'Received 🎉' },
            ]}
          />
        )}
        {isIdea && (
          <Segmented
            label="Status"
            className="w-full"
            value={form.status}
            onChange={(status) => setForm({ ...form, status })}
            options={[
              { value: 'open', label: 'Idea' },
              { value: 'bought', label: 'Bought' },
              { value: 'given', label: 'Given' },
            ]}
          />
        )}
        <div>
          <p className="mb-1.5 px-1 text-sm font-medium">Photo</p>
          <PhotoPicker value={image} onChange={setImage} purpose="gift" max={1} />
        </div>
      </div>
    </Sheet>
  );
}

function GiftCard({ gift, onOpen, onClaim }: { gift: Gift; onOpen?: () => void; onClaim?: () => void }) {
  const done = gift.status === 'given' || (gift.kind === 'idea' && gift.status === 'bought');
  return (
    <Card className={cn('flex gap-3 p-3.5', done && 'opacity-70')}>
      {gift.image ? (
        <img src={gift.image.thumbUrl ?? gift.image.url} alt="" className="size-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl">{gift.kind === 'idea' ? '💡' : '🎁'}</span>
      )}
      <button className="min-w-0 flex-1 text-left" onClick={onOpen} disabled={!onOpen}>
        <p className="font-semibold leading-snug">
          {gift.title} {gift.priority === 3 && <span title="Top priority">⭐</span>}
        </p>
        <p className="mt-0.5 text-sm text-muted">{[gift.price, gift.occasion && `for ${gift.occasion}`].filter(Boolean).join(' · ')}</p>
        {gift.notes && <p className="mt-1 line-clamp-2 text-sm text-muted">{gift.notes}</p>}
        {gift.kind === 'idea' && gift.status !== 'open' && <p className="mt-1 text-xs font-semibold text-success">{gift.status === 'bought' ? 'Bought ✓' : 'Given 🎉'}</p>}
        {gift.mine && gift.status === 'given' && <p className="mt-1 text-xs font-semibold text-success">Received 🎉</p>}
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {gift.url && (
          <a href={gift.url} target="_blank" rel="noopener noreferrer" aria-label="Open link" className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2">
            <ExternalLink className="size-4" />
          </a>
        )}
        {onClaim && (
          <Button size="sm" variant={gift.claimedByMe ? 'soft' : 'outline'} disabled={gift.claimed && !gift.claimedByMe} onClick={onClaim} icon={gift.claimedByMe ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}>
            {gift.claimedByMe ? (gift.status === 'bought' ? 'Bought' : "I'll get it") : gift.claimed ? 'Taken' : 'Get it'}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Gifts() {
  const couple = useCouple();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => get<{ items: Gift[] }>('/gifts').then((r) => r.items) });
  const [tab, setTab] = useState<Tab>('theirs');
  const [sheet, setSheet] = useState<{ open: boolean; gift: Gift | null; kind: 'wish' | 'idea' }>({ open: false, gift: null, kind: 'wish' });
  const partnerName = partner?.name ?? 'Partner';

  const lists = useMemo(
    () => ({
      theirs: (data ?? []).filter((g) => g.kind === 'wish' && !g.mine),
      mine: (data ?? []).filter((g) => g.kind === 'wish' && g.mine),
      ideas: (data ?? []).filter((g) => g.kind === 'idea'),
    }),
    [data],
  );

  // The next occasion to shop for: their birthday or your anniversary.
  const today = todayIn(couple.timezone);
  const occasions = [
    partner?.birthday && { label: `${partnerName}'s birthday`, date: nextOccurrence(partner.birthday, 'yearly', today)! },
    couple.startDate && { label: 'Your anniversary', date: nextOccurrence(couple.startDate, 'yearly', today)! },
  ].filter(Boolean) as { label: string; date: string }[];
  const nextOccasion = occasions.sort((a, b) => a.date.localeCompare(b.date))[0];

  async function claim(gift: Gift) {
    const next = !gift.claimedByMe ? { claimed: true, status: 'open' } : gift.status === 'open' ? { claimed: true, status: 'bought' } : { claimed: false };
    try {
      const { items } = await post<{ items: Gift[] }>(`/gifts/${gift.id}/claim`, next);
      queryClient.setQueryData(KEY, items);
      if (next.claimed && next.status === 'open') toast.success(`Claimed. ${partnerName} won't know.`, '🤫');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const list = lists[tab];
  const add = () => setSheet({ open: true, gift: null, kind: tab === 'ideas' ? 'idea' : 'wish' });

  return (
    <Page
      title="Gifts"
      back={<BackButton />}
      actions={
        tab !== 'theirs' && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={add}>
            Add
          </Button>
        )
      }
    >
      {nextOccasion && (
        <Card className="mb-4 flex items-center gap-3 p-4">
          <span className="text-2xl">🗓️</span>
          <p className="flex-1 text-sm">
            <span className="font-semibold">{nextOccasion.label}</span> is in {daysBetween(today, nextOccasion.date)} days · {formatDate(nextOccasion.date, { day: 'numeric', month: 'long' })}
          </p>
        </Card>
      )}
      <Segmented
        label="Gift lists"
        className="mb-4 w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'theirs', label: `${partnerName}'s wishes` },
          { value: 'mine', label: 'My wishes' },
          { value: 'ideas', label: '🔒 Ideas' },
        ]}
      />
      <p className="mb-3 px-1 text-sm text-muted">
        {tab === 'theirs'
          ? `Tap "Get it" to secretly claim something. ${partnerName} will never see what you've claimed.`
          : tab === 'mine'
            ? `${partnerName} can see this list. You'll never see what they've claimed, so it stays a surprise.`
            : `Only you can see these. Perfect for things ${partnerName} mentions in passing.`}
      </p>

      {isLoading ? (
        <SkeletonList rows={3} className="h-24" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          emoji={tab === 'ideas' ? '💡' : '🎁'}
          title={tab === 'theirs' ? `${partnerName}'s wishlist is empty` : tab === 'mine' ? 'What would make you smile?' : 'No secret ideas yet'}
          body={tab === 'theirs' ? 'Ask them to add a few things, or keep secret ideas of your own.' : undefined}
          action={tab !== 'theirs' ? <Button onClick={add}>Add one</Button> : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((gift) => (
            <GiftCard key={gift.id} gift={gift} onOpen={gift.mine ? () => setSheet({ open: true, gift, kind: gift.kind }) : undefined} onClaim={tab === 'theirs' ? () => claim(gift) : undefined} />
          ))}
        </div>
      )}
      <GiftSheet open={sheet.open} gift={sheet.gift} kind={sheet.kind} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Page>
  );
}
