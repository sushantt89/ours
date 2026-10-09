import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Play, X } from 'lucide-react';
import { errorMessage, upload } from '@/lib/api';
import { todayIn } from '@/lib/dates';
import { videoPoster } from '@/lib/media';
import { cn } from '@/lib/cn';
import type { Album } from '@/lib/types';
import { useAuth, useCouple, useMe } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Chip, Input, PlaceInput, Sheet, StorageBadge, Switch, Textarea, type PlaceValue } from '@/components/ui';

interface Picked {
  file: File;
  preview: string;
  isVideo: boolean;
}

export function UploadSheet({ open, onClose, albums, defaultAlbum }: { open: boolean; onClose: () => void; albums: Album[]; defaultAlbum?: string }) {
  const me = useMe();
  const couple = useCouple();
  const maxMb = useAuth((s) => s.config?.maxUploadMb ?? 25);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [caption, setCaption] = useState('');
  const [event, setEvent] = useState('');
  const [place, setPlace] = useState<PlaceValue>({ label: '' });
  const [date, setDate] = useState('');
  const [albumIds, setAlbumIds] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCaption('');
    setEvent('');
    setPlace({ label: '' });
    setDate(todayIn(couple.timezone));
    setAlbumIds(defaultAlbum ? [defaultAlbum] : []);
    setIsPrivate(me.privacy.memoryDefault === 'private');
    setPicked((old) => {
      old.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
  }, [open, couple.timezone, defaultAlbum, me.privacy.memoryDefault]);

  function add(files: FileList | null) {
    if (!files) return;
    const next: Picked[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxMb * 1024 * 1024) {
        toast.error(`${file.name} is larger than ${maxMb} MB`);
        continue;
      }
      next.push({ file, preview: URL.createObjectURL(file), isVideo: file.type.startsWith('video/') });
    }
    setPicked((old) => [...old, ...next].slice(0, 12));
    if (input.current) input.current.value = '';
  }

  async function save() {
    if (!picked.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      const posterFor: number[] = [];
      for (const [index, item] of picked.entries()) {
        form.append('files', item.file);
        if (item.isVideo) {
          const { blob } = await videoPoster(item.file);
          if (blob) {
            form.append('posters', blob, 'poster.jpg');
            posterFor.push(index);
          }
        }
      }
      form.append('posterFor', JSON.stringify(posterFor));
      form.append('caption', caption.trim());
      form.append('event', event.trim());
      form.append('location', place.label.trim());
      if (place.lat !== undefined && place.lng !== undefined) {
        form.append('lat', String(place.lat));
        form.append('lng', String(place.lng));
      }
      form.append('date', date);
      form.append('albumIds', JSON.stringify(albumIds));
      form.append('visibility', isPrivate ? 'private' : 'shared');
      await upload('/memories', form);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['memories'] }), queryClient.invalidateQueries({ queryKey: ['albums'] })]);
      toast.success(picked.length === 1 ? 'Memory saved' : `${picked.length} memories saved`, '📸');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Add memories"
      wide
      footer={
        <Button block size="lg" loading={busy} disabled={!picked.length} onClick={save}>
          {busy ? 'Uploading…' : picked.length > 1 ? `Save ${picked.length} memories` : 'Save memory'}
        </Button>
      }
    >
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {picked.length === 0 ? (
        <button
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-[24px] border-2 border-dashed border-line px-6 py-12 text-muted transition hover:border-accent hover:text-accent"
        >
          <ImagePlus className="size-9" />
          <span className="font-medium">Choose photos or videos</span>
          <span className="text-sm">Up to 12 at once, {maxMb} MB each</span>
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {picked.map((item, index) => (
            <div key={item.preview} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
              {item.isVideo ? (
                <>
                  <video src={item.preview} muted playsInline preload="metadata" className="size-full object-cover" />
                  <Play className="absolute left-1.5 top-1.5 size-4 fill-white text-white drop-shadow" />
                </>
              ) : (
                <img src={item.preview} alt="" className="size-full object-cover" />
              )}
              <button
                aria-label="Remove"
                onClick={() => setPicked((old) => old.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {picked.length < 12 && (
            <button onClick={() => input.current?.click()} aria-label="Add more" className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-muted hover:border-accent hover:text-accent">
              <ImagePlus className="size-6" />
            </button>
          )}
        </div>
      )}

      <div className={cn('mt-5 space-y-4', !picked.length && 'pointer-events-none opacity-50')}>
        <Textarea label="Caption" rows={2} placeholder="What was happening?" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={1000} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="When" type="date" value={date} max={todayIn(couple.timezone)} onChange={(e) => setDate(e.target.value)} />
          <PlaceInput value={place} onChange={setPlace} />
        </div>
        <p className="-mt-2 px-1 text-xs text-faint">Photos taken with location turned on are pinned on your map automatically.</p>
        <Input label="Event" placeholder="Anniversary weekend" value={event} onChange={(e) => setEvent(e.target.value)} maxLength={80} />
        {albums.length > 0 && (
          <div>
            <p className="mb-1.5 px-1 text-sm font-medium">Albums</p>
            <div className="flex flex-wrap gap-2">
              {albums.map((a) => (
                <Chip key={a.id} active={albumIds.includes(a.id)} onClick={() => setAlbumIds((ids) => (ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}>
                  {a.emoji} {a.name}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <Switch label="Keep private" hint="Only you will see these. Your partner won't be notified." checked={isPrivate} onChange={setIsPrivate} />
        <p className="flex items-center gap-2 text-sm text-muted">
          Saving to <StorageBadge storage={couple.storage} />
        </p>
      </div>
    </Sheet>
  );
}
