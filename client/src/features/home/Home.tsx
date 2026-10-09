import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bell, ChevronRight, Flame, SlidersHorizontal } from 'lucide-react';
import { errorMessage, patch } from '@/lib/api';
import { daysBetween, formatDate, formatShortDate, inDays, timeAgo, todayIn } from '@/lib/dates';
import { timeIn } from '@/lib/timezones';
import { decryptJSON } from '@/lib/e2ee';
import { useE2EE, type Payload } from '@/store/e2ee';
import { shareWidgetData } from '@/lib/pwa';
import { cn } from '@/lib/cn';
import type { Dashboard, User } from '@/lib/types';
import { useAuth, useCouple, useMe, usePartner } from '@/store/auth';
import { useRealtime } from '@/store/realtime';
import { toast } from '@/store/ui';
import { Avatar, Button, Card, CoupleAvatars, ErrorState, IconButton, LinkCard, SectionTitle, Sheet, Skeleton, Switch } from '@/components/ui';
import { coupleTitle } from '@/components/layout/AppShell';
import { useUnreadNotifications } from '@/features/notifications/useNotifications';
import { InviteCard } from '@/features/onboarding/InviteCard';
import { CountdownTile } from '@/features/countdowns/CountdownTile';
import { RelationshipCounter } from './RelationshipCounter';
import { QuickActions } from './QuickActions';
import { useDashboard } from './useDashboard';
import { PushPrompt } from './PushPrompt';

const CARDS = [
  { id: 'daily', label: 'Daily message', hint: "Today's little message from your partner" },
  { id: 'message', label: 'Latest message', hint: 'Your most recent chat message' },
  { id: 'distance', label: 'Long distance', hint: 'Both clocks and the next reunion (when long-distance mode is on)' },
  { id: 'updates', label: "What's new", hint: 'New memories, notes and nudges' },
  { id: 'song', label: 'Song of the day', hint: "Your partner's song for you today" },
  { id: 'next', label: 'Next special date', hint: 'Anniversaries, birthdays and plans' },
  { id: 'question', label: 'Daily question', hint: "Today's question for you both" },
  { id: 'games', label: 'Games', hint: 'When it is your turn to play' },
  { id: 'journal', label: 'Journal', hint: "A nudge to add to today's page" },
  { id: 'countdowns', label: 'Countdowns', hint: "What you're looking forward to" },
  { id: 'onthisday', label: 'On this day', hint: 'Memories from previous years' },
  { id: 'streak', label: 'Love streak', hint: 'Days in a row you both showed up' },
] as const;
type CardId = (typeof CARDS)[number]['id'];

function orderedCards(user: User): CardId[] {
  const known = CARDS.map((c) => c.id) as string[];
  const saved = user.dashboard.order.filter((id) => known.includes(id));
  return [...saved, ...known.filter((id) => !saved.includes(id))] as CardId[];
}

function Hero() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const hasCover = Boolean(couple.coverUrl);

  return (
    <section className={cn('relative overflow-hidden rounded-[32px] shadow-card', hasCover ? 'text-white' : 'border border-line/70 bg-surface')}>
      {hasCover ? (
        <>
          <img src={couple.coverUrl!} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/70" />
        </>
      ) : (
        <div className="absolute inset-x-0 top-0 h-40 opacity-[0.16] accent-gradient [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      )}
      <div className="relative px-6 pb-7 pt-8">
        <div className="flex flex-col items-center text-center">
          <CoupleAvatars a={me} b={partner} size="lg" />
          <h2 className="mt-3 max-w-full truncate text-[26px] leading-tight">{coupleTitle(couple.name, me.name, partner?.name)}</h2>
          {couple.description && <p className={cn('mt-1 max-w-xs text-sm', hasCover ? 'text-white/85' : 'text-muted')}>{couple.description}</p>}
        </div>
        <div className="mt-6">
          {couple.startDate ? (
            <RelationshipCounter startDate={couple.startDate} timezone={couple.timezone} onDark={hasCover} />
          ) : (
            <div className="text-center">
              <p className={cn('text-sm', hasCover ? 'text-white/85' : 'text-muted')}>Add the day it all began to start your counter.</p>
              <Link to="/settings?section=couple" className="mt-3 inline-block">
                <Button variant={hasCover ? 'outline' : 'soft'} size="sm">
                  Set our start date
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PartnerStrip() {
  const partner = usePartner();
  const typing = useRealtime((s) => s.partnerTyping);
  if (!partner) return null;
  const presence = typing
    ? 'typing…'
    : partner.online
      ? 'Online now'
      : partner.lastSeenAt
        ? `Last seen ${timeAgo(partner.lastSeenAt)}`
        : null;
  const statusFresh = partner.status && Date.now() - new Date(partner.status.at).getTime() < 24 * 3600 * 1000;

  return (
    <Card className="flex items-center gap-3.5 p-4">
      <Avatar name={partner.name} src={partner.avatarUrl} online={partner.online} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {statusFresh ? (
            <>
              {partner.status!.emoji} {partner.name}: {partner.status!.text}
            </>
          ) : partner.mood ? (
            <>
              {partner.mood.emoji} {partner.name} is feeling {partner.mood.label.toLowerCase()} today
            </>
          ) : (
            partner.name
          )}
        </p>
        <p className="truncate text-sm text-muted">
          {statusFresh && partner.mood ? `${partner.mood.emoji} Feeling ${partner.mood.label.toLowerCase()}` : partner.mood?.note || presence || 'Your person'}
          {statusFresh && ` · ${timeAgo(partner.status!.at)}`}
        </p>
      </div>
      <Link to="/chat" aria-label={`Message ${partner.name}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-lg">
        💬
      </Link>
    </Card>
  );
}

function Row({ to, emoji, children }: { to: string; emoji: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-surface-2">
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-faint" />
    </Link>
  );
}

interface CardContext {
  partnerName: string;
  messagePreview: string | null;
  longDistance: boolean;
  myZone: string;
  theirZone: string | null;
  reunionDate: string | null;
}

function renderCard(id: CardId, data: Dashboard, ctx: CardContext): ReactNode {
  const { partnerName } = ctx;
  switch (id) {
    case 'distance': {
      if (!ctx.longDistance) return null;
      const now = new Date();
      const days = ctx.reunionDate ? daysBetween(data.today, ctx.reunionDate) : null;
      return (
        <LinkCard to="/distance" className="flex items-center gap-4 p-5">
          <div className="flex flex-1 items-center justify-around text-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">You</p>
              <p className="font-display text-2xl">{timeIn(ctx.myZone, now)}</p>
            </div>
            <span className="text-xl" aria-hidden>
              🌏
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{partnerName}</p>
              <p className="font-display text-2xl">{ctx.theirZone ? timeIn(ctx.theirZone, now) : '—'}</p>
            </div>
          </div>
          {days !== null && days >= 0 && (
            <div className="shrink-0 border-l border-line/70 pl-4 text-center">
              <p className="font-display text-3xl leading-none text-accent">{days === 0 ? '❤️' : days}</p>
              <p className="mt-1 text-xs text-muted">{days === 0 ? 'Together today' : days === 1 ? 'day to go' : 'days to go'}</p>
            </div>
          )}
        </LinkCard>
      );
    }

    case 'song': {
      const song = data.songs.partner;
      if (!song) {
        return data.songs.mine ? null : (
          <LinkCard to="/music" className="flex items-center gap-3 p-5">
            <span className="text-2xl">🎵</span>
            <span className="flex-1 font-medium">Pick a song for {partnerName} today</span>
            <ChevronRight className="size-5 text-faint" />
          </LinkCard>
        );
      }
      return (
        <LinkCard to="/music" className="flex items-center gap-4 p-4">
          {song.thumbnail ? (
            <img src={song.thumbnail} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl accent-gradient text-2xl text-on-accent">🎵</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{partnerName}'s song for you</p>
            <p className="truncate font-display text-lg">{song.title || 'Listen'}</p>
            <p className="truncate text-sm text-muted">{song.note ? `"${song.note}"` : song.artist}</p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-faint" />
        </LinkCard>
      );
    }

    case 'games':
      return data.gamesWaiting > 0 ? (
        <LinkCard to="/games" className="flex items-center gap-3 p-5">
          <span className="text-2xl">🎲</span>
          <span className="flex-1 font-medium">
            Your turn in {data.gamesWaiting} {data.gamesWaiting === 1 ? 'game' : 'games'}
          </span>
          <ChevronRight className="size-5 text-faint" />
        </LinkCard>
      ) : null;

    case 'journal':
      return data.journal.partnerWroteToday && !data.journal.wroteToday ? (
        <LinkCard to="/journal" className="flex items-center gap-3 p-5">
          <span className="text-2xl">📔</span>
          <span className="flex-1 font-medium">{partnerName} wrote in your journal today. Add your side?</span>
          <ChevronRight className="size-5 text-faint" />
        </LinkCard>
      ) : null;

    case 'daily':
      return data.dailyLove ? (
        <Card className="relative overflow-hidden p-6 text-center">
          <span className="absolute -right-3 -top-4 rotate-12 text-7xl opacity-10" aria-hidden>
            💌
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Today's message from {data.dailyLove.from}</p>
          <p className="mt-3 font-display text-2xl leading-snug">"{data.dailyLove.text}"</p>
        </Card>
      ) : null;

    case 'message':
      return (
        <LinkCard to="/chat" className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-xl" aria-hidden>
              💬
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-muted">
                {data.unreadMessages > 0 ? (
                  <span className="font-semibold text-accent">
                    {data.unreadMessages} unread {data.unreadMessages === 1 ? 'message' : 'messages'}
                  </span>
                ) : data.lastMessage ? (
                  <>
                    {data.lastMessage.mine ? 'You' : partnerName} · {timeAgo(data.lastMessage.at)}
                  </>
                ) : (
                  'Chat'
                )}
              </p>
              <p className="truncate text-[17px] font-medium">{data.lastMessage ? (ctx.messagePreview ?? data.lastMessage.preview) : 'Say the first hello 👋'}</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-faint" />
          </div>
        </LinkCard>
      );

    case 'updates': {
      const rows = [
        data.unreadNotes > 0 && (
          <Row key="notes" to="/notes" emoji="📝">
            {partnerName} left you {data.unreadNotes === 1 ? 'a note' : `${data.unreadNotes} notes`}
          </Row>
        ),
        data.newMemories > 0 && (
          <Row key="memories" to="/memories" emoji="📸">
            {data.newMemories} new {data.newMemories === 1 ? 'memory' : 'memories'}
          </Row>
        ),
        data.lastNudge && (
          <Row key="nudge" to="/nudges" emoji={data.lastNudge.emoji}>
            {data.lastNudge.text} <span className="font-normal text-muted">· {timeAgo(data.lastNudge.at)}</span>
          </Row>
        ),
      ].filter(Boolean);
      return rows.length ? <Card className="divide-y divide-line/70 overflow-hidden">{rows}</Card> : null;
    }

    case 'next': {
      const [first, ...rest] = data.upcoming;
      if (!first) {
        return (
          <LinkCard to="/calendar" className="flex items-center gap-3 p-5">
            <span className="text-2xl">📅</span>
            <span className="flex-1 font-medium">Add your first special date</span>
            <ChevronRight className="size-5 text-faint" />
          </LinkCard>
        );
      }
      return (
        <div>
          <SectionTitle to="/calendar">Coming up</SectionTitle>
          <Card className="overflow-hidden">
            <Link to="/calendar" className="flex items-center gap-4 p-5">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-3xl" aria-hidden>
                {first.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-xl">{first.title}</p>
                <p className="text-sm text-muted">{formatDate(first.next, { weekday: 'short', day: 'numeric', month: 'long' })}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-2xl leading-none text-accent">{first.daysUntil === 0 ? 'Today' : first.daysUntil === 1 ? 'Tomorrow' : first.daysUntil}</p>
                {first.daysUntil > 1 && <p className="text-xs font-medium text-muted">days</p>}
              </div>
            </Link>
            {rest.slice(0, 2).map((e) => (
              <Link key={e.id + e.next} to="/calendar" className="flex items-center gap-3 border-t border-line/70 px-5 py-3 text-sm">
                <span aria-hidden>{e.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                <span className="shrink-0 text-muted">
                  {formatShortDate(e.next)} · {inDays(e.daysUntil).toLowerCase()}
                </span>
              </Link>
            ))}
          </Card>
        </div>
      );
    }

    case 'question': {
      const q = data.question;
      const both = q.myAnswer && q.partnerAnswered;
      return (
        <LinkCard to="/question" className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Today's question</p>
          <p className="mt-2 font-display text-xl leading-snug">
            {q.emoji} {q.question}
          </p>
          <p className="mt-3 text-sm font-medium text-accent">
            {both ? 'You both answered. Tap to reveal →' : q.myAnswer ? `Waiting for ${partnerName}…` : q.partnerAnswered ? `${partnerName} answered. Your turn →` : 'Answer to see what they say →'}
          </p>
        </LinkCard>
      );
    }

    case 'countdowns':
      return data.countdowns.length ? (
        <div>
          <SectionTitle to="/countdowns">Counting down</SectionTitle>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:-mx-6 lg:px-6">
            {data.countdowns.map((c) => (
              <Link key={c.id} to="/countdowns" className="w-40 shrink-0 snap-start">
                <CountdownTile countdown={c} today={data.today} />
              </Link>
            ))}
          </div>
        </div>
      ) : null;

    case 'onthisday': {
      const first = data.onThisDay[0];
      if (!first?.media) return null;
      const years = Number(data.today.slice(0, 4)) - Number(first.date.slice(0, 4));
      return (
        <LinkCard to="/memories?view=on-this-day" className="overflow-hidden">
          <div className="relative aspect-[16/9]">
            <img src={first.media.thumbUrl ?? first.media.url} alt={first.caption || 'A memory'} className="absolute inset-0 size-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-90">
                📸 On this day · {years} {years === 1 ? 'year' : 'years'} ago
              </p>
              <p className="mt-1 font-display text-xl">{first.location ? `You were in ${first.location} ❤️` : first.caption || first.event || 'Remember this?'}</p>
            </div>
          </div>
        </LinkCard>
      );
    }

    case 'streak':
      return (
        <LinkCard to="/story" className="flex items-center gap-4 p-5">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', data.streak.days > 0 ? 'accent-gradient text-on-accent' : 'bg-surface-2 text-muted')}>
            <Flame className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl">{data.streak.days > 0 ? `${data.streak.days}-day love streak` : 'Start a love streak'}</p>
            <p className="text-sm text-muted">
              {data.streak.todayDone ? "You've both shown up today 🫶" : 'Counts every day you both say or share something.'}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-faint" />
        </LinkCard>
      );
  }
}

function CustomiseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const [order, setOrder] = useState<CardId[]>(() => orderedCards(me));
  const [hidden, setHidden] = useState<string[]>(me.dashboard.hidden);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setOrder(orderedCards(me));
      setHidden(me.dashboard.hidden);
    }
  }, [open, me]);

  const move = (index: number, by: number) =>
    setOrder((current) => {
      const next = current.slice();
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      const { user } = await patch<{ user: User }>('/me', { dashboard: { order, hidden } });
      useAuth.setState({ user });
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
      onClose={onClose}
      title="Customise home"
      footer={
        <Button block size="lg" loading={busy} onClick={save}>
          Save
        </Button>
      }
    >
      <p className="mb-2 text-sm text-muted">Choose what appears on your home screen and in what order. This is just for you.</p>
      <ul className="divide-y divide-line/70">
        {order.map((id, index) => {
          const card = CARDS.find((c) => c.id === id)!;
          return (
            <li key={id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <IconButton size="sm" label={`Move ${card.label} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton size="sm" label={`Move ${card.label} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
              </div>
              <div className="min-w-0 flex-1">
                <Switch
                  label={card.label}
                  hint={card.hint}
                  checked={!hidden.includes(id)}
                  onChange={(on) => setHidden((h) => (on ? h.filter((x) => x !== id) : [...h, id]))}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export default function Home() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const { data, isLoading, isError, refetch } = useDashboard();
  const unreadNotifications = useUnreadNotifications();
  const [customising, setCustomising] = useState(false);
  const cards = useMemo(() => orderedCards(me).filter((id) => !me.dashboard.hidden.includes(id)), [me]);

  // An encrypted last message is decrypted here, on the device, if this device has the key.
  const keys = useE2EE((s) => s.keys);
  const [messagePreview, setMessagePreview] = useState<string | null>(null);
  const cipher = data?.lastMessage?.cipher;
  useEffect(() => {
    setMessagePreview(null);
    const key = cipher && keys[cipher.keyId];
    if (!cipher || !key) return;
    decryptJSON<Payload>(key, cipher)
      .then((p) => setMessagePreview(p.text || (p.type === 'image' ? '📷 Photo' : p.type === 'video' ? '🎬 Video' : p.type === 'audio' ? '🎤 Voice message' : p.type === 'gif' ? 'GIF' : '🔒 Message')))
      .catch(() => undefined);
  }, [cipher, keys]);

  // Keep installed-app widgets (where supported) in step with what's on screen.
  useEffect(() => {
    if (!data) return;
    const next = data.upcoming[0];
    shareWidgetData({
      title: coupleTitle(couple.name, me.name, partner?.name),
      startDate: couple.startDate,
      timezone: couple.timezone,
      next: next ? { title: next.title, emoji: next.emoji, date: next.next } : null,
    });
  }, [data, couple, me.name, partner?.name]);

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false }).format(new Date()));
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] lg:px-6 lg:pb-12 lg:pt-8">
      <header className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{formatDate(todayIn(couple.timezone), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[26px] leading-tight sm:text-[28px]">
            {greeting}, {me.name.split(' ')[0]}
          </h1>
        </div>
        <IconButton label="Customise home" onClick={() => setCustomising(true)}>
          <SlidersHorizontal className="size-5" />
        </IconButton>
        <Link to="/notifications" className="relative grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink lg:hidden" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}>
          <Bell className="size-5" />
          {unreadNotifications > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-bg bg-accent" />}
        </Link>
      </header>

      <div className="space-y-4">
        {couple.status === 'ended' && (
          <Card className="border-danger/30 bg-danger/5 p-4 text-sm">
            <p className="font-semibold">Your partner has left this space.</p>
            <p className="mt-1 text-muted">Everything is still here for you to look back on or export from Settings. New messages can no longer be sent.</p>
          </Card>
        )}
        {!me.emailVerified && (
          <Card className="flex items-center gap-3 p-4 text-sm">
            <span className="text-xl">✉️</span>
            <p className="flex-1 text-muted">Confirm your email so you can always recover your account. Check your inbox, or resend from Settings.</p>
          </Card>
        )}

        <Hero />
        <InviteCard />
        <PushPrompt />
        <PartnerStrip />
        <QuickActions mood={data?.myMood ?? null} />

        {isLoading && (
          <div className="space-y-4" role="status" aria-label="Loading your space">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-28" />
          </div>
        )}
        {isError && !data && <ErrorState onRetry={() => refetch()} />}
        {data &&
          cards.map((id) => {
            const node = renderCard(id, data, {
              partnerName: partner?.name ?? 'Your partner',
              messagePreview,
              longDistance: couple.longDistance,
              myZone: me.timezone,
              theirZone: partner?.timezone ?? null,
              reunionDate: couple.reunionDate,
            });
            return node ? <div key={id}>{node}</div> : null;
          })}
      </div>

      <CustomiseSheet open={customising} onClose={() => setCustomising(false)} />
    </div>
  );
}
