import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { COUNTDOWN_BACKGROUNDS } from '@/lib/constants';
import { addDays, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Countdown, Media } from '@/lib/types';
import { useCouple } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, EmojiButton, EmptyState, ErrorState, Input, PhotoPicker, Sheet, Skeleton } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { CountdownTile } from './CountdownTile';

function CountdownSheet({ open, onClose, countdown }: { open: boolean; onClose: () => void; countdown: Countdown | null }) {
  const couple = useCouple();
  const queryClient = useQueryClient();
  const today = todayIn(couple.timezone);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [date, setDate] = useState('');
  const [background, setBackground] = useState('sunset');
  const [photo, setPhoto] = useState<Media[]>([]);
  const [keepImage, setKeepImage] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setTitle(countdown?.title ?? '');
    setEmoji(countdown?.emoji ?? '✈️');
    setDate(countdown?.date ?? addDays(today, 30));
    setBackground(countdown?.background === 'photo' ? 'sunset' : (countdown?.background ?? 'sunset'));
    setPhoto([]);
    setKeepImage(Boolean(countdown?.imageUrl));
  }, [open, countdown, today]);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['countdowns'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);

  async function save() {
    if (!title.trim()) return setError('Give it a name');
    setBusy(true);
    const body: Record<string, unknown> = { title: title.trim(), emoji, date, background };
    if (photo[0]) body.mediaId = photo[0].id;
    else if (countdown?.imageUrl && !keepImage) body.mediaId = null;
    try {
      if (countdown) await patch(`/countdowns/${countdown.id}`, body);
      else await post('/countdowns', body);
      await refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!countdown) return;
    if (!(await confirm({ title: `Delete "${countdown.title}"?`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await del(`/countdowns/${countdown.id}`);
      await refresh();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const preview: Countdown = { id: 'preview', title: title || 'Japan trip', emoji, date: date || today, background, imageUrl: photo[0]?.url ?? (keepImage ? (countdown?.imageUrl ?? null) : null) };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={countdown ? 'Edit countdown' : 'New countdown'}
      footer={
        <div className="flex gap-2">
          {countdown && (
            <Button variant="outline" aria-label="Delete countdown" className="text-danger" onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button block size="lg" loading={busy} onClick={save}>
            {countdown ? 'Save changes' : 'Start counting'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="mx-auto w-40">
          <CountdownTile countdown={preview} today={today} />
        </div>
        <div className="flex items-end gap-3">
          <EmojiButton value={emoji} onChange={setEmoji} />
          <div className="flex-1">
            <Input label="What are you counting down to?" placeholder="Japan trip" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} error={error} data-autofocus />
          </div>
        </div>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div>
          <p className="mb-1.5 px-1 text-sm font-medium">Background</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Background">
            {Object.entries(COUNTDOWN_BACKGROUNDS).map(([id, gradient]) => (
              <button
                key={id}
                role="radio"
                aria-checked={background === id}
                aria-label={id}
                onClick={() => setBackground(id)}
                className={cn('size-10 rounded-2xl border-2 transition', background === id ? 'scale-110 border-ink' : 'border-transparent')}
                style={{ background: gradient }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 px-1 text-sm font-medium">Or use a photo</p>
          {keepImage && !photo.length ? (
            <Button variant="outline" size="sm" onClick={() => setKeepImage(false)}>
              Remove current photo
            </Button>
          ) : (
            <PhotoPicker value={photo} onChange={setPhoto} purpose="countdown" max={1} />
          )}
        </div>
      </div>
    </Sheet>
  );
}

export default function Countdowns() {
  const couple = useCouple();
  const today = todayIn(couple.timezone);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['countdowns'], queryFn: () => get<{ countdowns: Countdown[] }>('/countdowns').then((r) => r.countdowns) });
  const [sheet, setSheet] = useState<{ open: boolean; countdown: Countdown | null }>({ open: false, countdown: null });

  return (
    <Page
      title="Countdowns"
      subtitle="The days between now and the good stuff"
      back={<BackButton />}
      wide
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, countdown: null })}>
          New
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-[26px]" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState emoji="⏳" title="What are you looking forward to?" body="A trip, a holiday, a birthday, the next time you see each other." action={<Button onClick={() => setSheet({ open: true, countdown: null })}>Create a countdown</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c) => (
            <CountdownTile key={c.id} countdown={c} today={today} onClick={() => setSheet({ open: true, countdown: c })} />
          ))}
        </div>
      )}
      <CountdownSheet open={sheet.open} countdown={sheet.countdown} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Page>
  );
}
