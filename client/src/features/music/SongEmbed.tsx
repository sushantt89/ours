import { ExternalLink, Music } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Song } from '@/lib/types';

/** Plays the song inline when the service allows embedding, otherwise links out. */
export function SongEmbed({ song, compact }: { song: Song; compact?: boolean }) {
  const height = compact ? 80 : 152;
  if (song.provider === 'spotify' && song.embedId) {
    return (
      <iframe
        title={song.title || 'Spotify'}
        src={`https://open.spotify.com/embed/${song.embedId}?utm_source=generator&theme=0`}
        height={height}
        className="w-full rounded-2xl border-0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  }
  if (song.provider === 'youtube' && song.embedId) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          title={song.title || 'YouTube'}
          src={`https://www.youtube-nocookie.com/embed/${song.embedId}?rel=0`}
          className="absolute inset-0 size-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  if (song.provider === 'apple' && song.embedId) {
    return (
      <iframe
        title={song.title || 'Apple Music'}
        src={`https://embed.music.apple.com${song.embedId}`}
        height={compact ? 150 : 175}
        className="w-full rounded-2xl border-0"
        allow="autoplay *; encrypted-media *;"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        loading="lazy"
      />
    );
  }
  if (song.provider === 'soundcloud') {
    return (
      <iframe
        title={song.title || 'SoundCloud'}
        src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(song.url)}&color=%23d6456b&visual=false`}
        height={compact ? 120 : 166}
        className="w-full rounded-2xl border-0"
        allow="autoplay"
        loading="lazy"
      />
    );
  }
  return (
    <a href={song.url} target="_blank" rel="noopener noreferrer" className={cn('flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition hover:bg-line')}>
      <span className="grid size-12 shrink-0 place-items-center rounded-xl accent-gradient text-on-accent">
        <Music className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{song.title || 'Listen'}</span>
        <span className="block truncate text-sm text-muted">{new URL(song.url).hostname.replace(/^www\./, '')}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted" />
    </a>
  );
}
