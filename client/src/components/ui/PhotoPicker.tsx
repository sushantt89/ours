import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { errorMessage, upload } from '@/lib/api';
import type { Media } from '@/lib/types';
import { toast } from '@/store/ui';
import { Spinner } from './Spinner';

/** Attach a few photos to something (a note, a bucket list item). Uploads as you pick. */
export function PhotoPicker({
  value,
  onChange,
  purpose,
  max = 6,
}: {
  value: Media[];
  onChange: (media: Media[]) => void;
  purpose: 'note' | 'bucket' | 'countdown' | 'journal' | 'gift';
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Media[] = [];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) {
        const form = new FormData();
        form.append('file', file);
        added.push((await upload<{ media: Media }>(`/uploads?purpose=${purpose}`, form)).media);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      onChange([...value, ...added]);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((m) => (
        <div key={m.id} className="relative size-20 overflow-hidden rounded-2xl bg-surface-2">
          <img src={m.thumbUrl ?? m.url} alt="" className="size-full object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => onChange(value.filter((x) => x.id !== m.id))}
            className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="grid size-20 place-items-center rounded-2xl border-2 border-dashed border-line text-muted transition hover:border-accent hover:text-accent"
          aria-label="Add a photo"
        >
          {busy ? <Spinner /> : <ImagePlus className="size-6" />}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple={max > 1} hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}
