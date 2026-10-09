import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { api, del, errorMessage, get } from '@/lib/api';
import { formatDate, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { JournalDay, Media } from '@/lib/types';
import { useCouple, useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Avatar, Button, Card, EmojiButton, EmptyState, ErrorState, IconButton, Lightbox, PhotoPicker, Skeleton, Spinner, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';


interface Page_ {
  days: JournalDay[];
  hasMore: boolean;
  today: string;
}

function Editor({ date, existing, onDone }: { date: string; existing?: { text: string; mood: string | null; media: Media[] }; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(existing?.text ?? '');
  const [mood, setMood] = useState(existing?.mood ?? '🥰');
  const [media, setMedia] = useState<Media[]>(existing?.media ?? []);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!text.trim() && !media.length) return toast.error('Write something or add a photo');
    setBusy(true);
    try {
      await api(`/journal/${date}`, { method: 'PUT', body: { text: text.trim(), mood, mediaIds: media.map((m) => m.id) } });
      await queryClient.invalidateQueries({ queryKey: ['journal'] });
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <EmojiButton value={mood} onChange={setMood} label="Mood for the day" />
        <div className="flex-1">
          <Textarea aria-label="Your part of today's page" rows={4} placeholder="What happened today? What do you want to remember?" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
        </div>
      </div>
      <PhotoPicker value={media} onChange={setMedia} purpose="journal" max={4} />
      <div className="flex justify-end gap-2">
        {existing && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button loading={busy} onClick={save}>
          {existing ? 'Save' : 'Add to today'}
        </Button>
      </div>
    </div>
  );
}

function DayCard({ day, today }: { day: JournalDay; today: string }) {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [viewer, setViewer] = useState<Media | null>(null);
  const mine = day.parts.find((p) => p.userId === me.id);
  const order = [...day.parts].sort((a) => (a.userId === me.id ? -1 : 1));

  async function remove() {
    if (!(await confirm({ title: 'Delete your part of this page?', body: "Your partner's part stays.", confirmLabel: 'Delete', danger: true }))) return;
    try {
      await del(`/journal/${day.date}`);
      await queryClient.invalidateQueries({ queryKey: ['journal'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line/70 px-5 py-3">
        <h2 className="text-lg">{day.date === today ? 'Today' : formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        {day.date.slice(0, 4) !== today.slice(0, 4) && <span className="text-sm text-muted">{day.date.slice(0, 4)}</span>}
      </div>
      <div className="divide-y divide-line/70">
        {order.map((part) => {
          const isMe = part.userId === me.id;
          if (isMe && editing) {
            return (
              <div key={part.userId} className="p-5">
                <Editor date={day.date} existing={part} onDone={() => setEditing(false)} />
              </div>
            );
          }
          return (
            <div key={part.userId} className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <Avatar name={isMe ? me.name : (partner?.name ?? '?')} src={isMe ? me.avatarUrl : partner?.avatarUrl} size="xs" />
                <p className="flex-1 text-sm font-semibold text-muted">
                  {isMe ? 'You' : partner?.name} {part.mood}
                </p>
                {isMe && (
                  <>
                    <IconButton size="sm" label="Edit" onClick={() => setEditing(true)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton size="sm" label="Delete" onClick={remove}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </>
                )}
              </div>
              {part.text && <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{part.text}</p>}
              {part.media.length > 0 && (
                <div className={cn('mt-3 grid gap-1.5', part.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                  {part.media.map((m) => (
                    <button key={m.id} onClick={() => setViewer(m)} className="overflow-hidden rounded-2xl" aria-label="Open photo">
                      <img src={m.thumbUrl ?? m.url} alt="" className={cn('w-full object-cover', part.media.length === 1 ? 'max-h-80' : 'aspect-square')} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!mine && day.date === today && (
          <div className="p-5">
            <Editor date={day.date} onDone={() => undefined} />
          </div>
        )}
      </div>
      <Lightbox media={viewer} onClose={() => setViewer(null)} />
    </Card>
  );
}

export default function Journal() {
  const couple = useCouple();
  const today = todayIn(couple.timezone);
  const query = useInfiniteQuery({
    queryKey: ['journal'],
    queryFn: ({ pageParam }) => get<Page_>(`/journal?limit=20${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => (last.hasMore ? last.days[last.days.length - 1]?.date : undefined),
  });
  const days = query.data?.pages.flatMap((p) => p.days) ?? [];
  const hasToday = days[0]?.date === today;

  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY > document.body.scrollHeight - 600 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [query]);

  return (
    <Page title="Our journal" subtitle="A page a day, written by both of you" back={<BackButton />}>
      {query.isLoading ? (
        <Skeleton className="h-56 rounded-card" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-4">
          {!hasToday && <DayCard day={{ id: 'today', date: today, parts: [] }} today={today} />}
          {days.map((day) => (
            <DayCard key={day.id} day={day} today={today} />
          ))}
          {days.length === 0 && <EmptyState emoji="📔" title="Page one" body="Write a few lines about today. Your partner adds theirs, and over time it becomes the story of you two." />}
          {query.isFetchingNextPage && (
            <div className="grid place-items-center py-4 text-accent">
              <Spinner />
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
