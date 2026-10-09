import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import type { Media } from '@/lib/types';

/** Full-screen viewer for a single photo or video. */
export function Lightbox({ media, onClose }: { media: Media | null; onClose: () => void }) {
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [media, onClose]);

  if (!media) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Media viewer" className="fixed inset-0 z-[65] flex animate-fade-up items-center justify-center bg-black/95" onClick={onClose}>
      <div className="absolute inset-x-0 top-0 z-10 flex justify-end gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <a
          href={media.url.startsWith('blob:') ? media.url : `${media.url}?download=1`}
          download={media.name}
          onClick={(e) => e.stopPropagation()}
          aria-label="Download"
          className="grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
        >
          <Download className="size-5" />
        </a>
        <button aria-label="Close" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20">
          <X className="size-5" />
        </button>
      </div>
      {media.kind === 'video' ? (
        <video src={media.url} poster={media.thumbUrl ?? undefined} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={media.url} alt={media.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      )}
    </div>,
    document.body,
  );
}
