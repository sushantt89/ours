import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { del, errorMessage, get, post } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Song } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Avatar, Button, Card, EmptyState, ErrorState, IconButton, Input, SectionTitle, SkeletonList, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { SongEmbed } from './SongEmbed';

const REACTIONS = ['❤️', '🥹', '💃', '🔥', '🎶'];

export const useSongs = () => useQuery({ queryKey: ['songs'], queryFn: () => get<{ today: string; mine: Song | null; partner: Song | null; history: Song[] }>('/songs') });

function SongCard({ song, who, avatar, mine }: { song: Song; who: string; avatar?: string | null; mine: boolean }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['songs'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
  const myReaction = song.reactions.find((r) => r.userId === me.id)?.emoji;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar name={who} src={avatar} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{mine ? 'Your song today' : `${who}'s song for you`}</p>
          {(song.title || song.artist) && <p className="truncate text-sm text-muted">{[song.title, song.artist].filter(Boolean).join(' · ')}</p>}
        </div>
        {mine && (
          <IconButton
            label="Remove song"
            onClick={async () => {
              if (!(await confirm({ title: 'Remove today’s song?', confirmLabel: 'Remove', danger: true }))) return;
              await del(`/songs/${song.id}`).catch((err) => toast.error(errorMessage(err)));
              await refresh();
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
      {song.note && <p className="mb-3 font-display text-lg leading-snug">"{song.note}"</p>}
      <SongEmbed song={song} />
      <div className="mt-3 flex items-center gap-1.5">
        {mine ? (
          song.reactions.length > 0 && <p className="text-sm text-muted">They reacted {song.reactions.map((r) => r.emoji).join(' ')}</p>
        ) : (
          REACTIONS.map((emoji) => (
            <button
              key={emoji}
              aria-label={`React with ${emoji}`}
              aria-pressed={myReaction === emoji}
              onClick={async () => {
                await post(`/songs/${song.id}/react`, { emoji }).catch((err) => toast.error(errorMessage(err)));
                await refresh();
              }}
              className={cn('grid size-10 place-items-center rounded-full text-xl transition active:scale-125', myReaction === emoji ? 'bg-accent-soft' : 'hover:bg-surface-2')}
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

export default function MusicPage() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useSongs();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacing, setReplacing] = useState(false);

  async function share(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError('Paste a Spotify, YouTube, Apple Music or SoundCloud link');
    setBusy(true);
    setError('');
    try {
      await post('/songs', { url: url.trim(), note: note.trim() });
      setUrl('');
      setNote('');
      setReplacing(false);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['songs'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success(partner ? `Shared with ${partner.name}` : 'Saved', '🎵');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const history = (data?.history ?? []).filter((s) => s.date !== data?.today);

  return (
    <Page title="Song of the day" subtitle="One song each, every day" back={<BackButton />}>
      {isLoading ? (
        <SkeletonList rows={2} className="h-56" />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          {data.partner ? (
            <SongCard song={data.partner} who={partner?.name ?? 'Your partner'} avatar={partner?.avatarUrl} mine={false} />
          ) : (
            partner && (
              <Card className="p-5 text-center text-muted">
                <p className="text-3xl" aria-hidden>
                  🎧
                </p>
                <p className="mt-2">{partner.name} hasn't picked a song today yet.</p>
              </Card>
            )
          )}

          {data.mine && !replacing ? (
            <>
              <SongCard song={data.mine} who={me.name} avatar={me.avatarUrl} mine />
              <Button variant="ghost" block onClick={() => setReplacing(true)}>
                Pick a different song
              </Button>
            </>
          ) : (
            <Card className="p-5">
              <h2 className="text-xl">{data.mine ? 'Change today’s song' : 'Pick today’s song'}</h2>
              <p className="mt-1 text-sm text-muted">Paste a link from Spotify, YouTube, Apple Music or SoundCloud.</p>
              <form onSubmit={share} className="mt-4 space-y-3">
                <Input aria-label="Song link" placeholder="https://open.spotify.com/track/…" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" error={error} />
                <Textarea aria-label="Why this song?" rows={2} placeholder="Why this one? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
                <div className="flex gap-2">
                  {replacing && (
                    <Button variant="outline" onClick={() => setReplacing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" block loading={busy}>
                    Share song
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <div className="pt-4">
            <SectionTitle>Our soundtrack</SectionTitle>
            {history.length === 0 ? (
              <EmptyState emoji="🎶" title="Your soundtrack starts today" body="Every song you share is kept here, a playlist of your relationship." />
            ) : (
              <Card className="divide-y divide-line/70 overflow-hidden">
                {history.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                    {s.thumbnail ? (
                      <img src={s.thumbnail} alt="" className="size-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-xl">🎵</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.title || s.url}</span>
                      <span className="block truncate text-sm text-muted">
                        {s.userId === me.id ? 'You' : partner?.name} · {formatDate(s.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {s.note && ` · “${s.note}”`}
                      </span>
                    </span>
                    {s.reactions.length > 0 && <span className="shrink-0 text-sm">{s.reactions.map((r) => r.emoji).join('')}</span>}
                  </a>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
