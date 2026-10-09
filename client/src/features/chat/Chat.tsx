import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronLeft, Copy, Lock, Pencil, Phone, Pin, PinOff, Reply, Search, Trash2, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { REACTIONS } from '@/lib/constants';
import { dayLabel, formatDateTime, timeAgo, todayIn } from '@/lib/dates';
import { copyText } from '@/lib/media';
import { cn } from '@/lib/cn';
import type { Media, Message } from '@/lib/types';
import { useCouple, useMe, usePartner } from '@/store/auth';
import { useChat } from '@/store/chat';
import { useRealtime } from '@/store/realtime';
import { e2eeStatus, encryptPayload, useE2EE } from '@/store/e2ee';
import { useCall } from '@/features/calls/callStore';
import { timeIn } from '@/lib/timezones';
import { toView, type ViewMessage } from './view';
import { UnlockSheet } from './E2EESheets';
import { confirm, toast } from '@/store/ui';
import { Avatar, Button, EmptyState, ErrorState, IconButton, Lightbox, Sheet, Skeleton, Spinner } from '@/components/ui';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';

function ActionRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left font-medium transition hover:bg-surface-2', danger && 'text-danger')}>
      {icon} {label}
    </button>
  );
}

function MessageList({ title, load, open, onClose, empty }: { title: string; load: (q: string) => Promise<ViewMessage[]>; open: boolean; onClose: () => void; empty: string }) {
  const me = useMe();
  const partner = usePartner();
  const searchable = title === 'Search messages';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ViewMessage[] | null>(null);

  useEffect(() => {
    if (!open) return;
    if (searchable && !query.trim()) return setResults([]);
    setResults(null);
    const timer = setTimeout(() => {
      load(query.trim())
        .then(setResults)
        .catch(() => setResults([]));
    }, searchable ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, query, load, searchable]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {searchable && (
        <input
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your conversation"
          aria-label="Search messages"
          className="mb-3 h-11 w-full rounded-full border border-line bg-surface-2 px-4 outline-none focus:border-accent"
        />
      )}
      <div className="min-h-40">
        {!results ? (
          <div className="grid place-items-center py-10 text-accent">
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-muted">{searchable && !query.trim() ? 'Type a word or phrase to find it.' : empty}</p>
        ) : (
          <ul className="space-y-2">
            {results
              .slice()
              .reverse()
              .map((m) => (
                <li key={m.id} className="rounded-2xl bg-surface-2 px-4 py-3">
                  <p className="text-xs font-medium text-muted">
                    {m.senderId === me.id ? 'You' : partner?.name} · {formatDateTime(m.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{m.text || (m.type === 'image' ? '📷 Photo' : m.type === 'video' ? '🎬 Video' : m.type === 'audio' ? '🎤 Voice message' : 'GIF')}</p>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

export default function Chat() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const { messages, loaded, loading, hasMore, load, loadOlder, markRead, retry } = useChat();
  const typing = useRealtime((s) => s.partnerTyping);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<ViewMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ViewMessage | null>(null);
  const [editing, setEditing] = useState<ViewMessage | null>(null);
  const [viewer, setViewer] = useState<Media | null>(null);
  const [panel, setPanel] = useState<'search' | 'pinned' | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const previousHeight = useRef(0);
  const oldestId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!loaded) load().catch(() => setFailed(true));
  }, [loaded, load]);

  // Opening or returning to the chat marks everything as read.
  useEffect(() => {
    const read = () => document.visibilityState === 'visible' && void markRead();
    if (loaded) read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [loaded, markRead, messages.length]);

  // Keep the view pinned to the newest message, and hold position when older ones load in.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = messages[0]?.id;
    if (oldestId.current && first !== oldestId.current && !stick.current) {
      el.scrollTop += el.scrollHeight - previousHeight.current;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    oldestId.current = first;
    previousHeight.current = el.scrollHeight;
  }, [messages, typing]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < 120;
    setAtBottom(distance < 300);
    previousHeight.current = el.scrollHeight;
    if (el.scrollTop < 200 && hasMore && !loading) void loadOlder();
  };

  const toBottom = () => {
    stick.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  };

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  const react = useCallback((m: Message, emoji: string) => act(() => post(`/messages/${m.id}/react`, { emoji })), [act]);
  const onLove = useCallback((m: Message) => void react(m, '❤️'), [react]);
  const onRetry = useCallback((m: Message) => void retry(m.clientId!, me.id), [retry, me.id]);
  const replyName = useCallback((senderId: string) => (senderId === me.id ? 'You' : (partner?.name ?? 'Partner')), [me.id, partner?.name]);

  async function remove(m: Message) {
    setTarget(null);
    const ok = await confirm({ title: 'Delete this message?', body: 'It will be removed for both of you.', confirmLabel: 'Delete', danger: true });
    if (ok) await act(() => del(`/messages/${m.id}`));
  }

  /** Decrypts a batch of messages (if needed) and returns what they say. */
  const readable = useCallback(async (list: Message[]) => {
    const store = useE2EE.getState();
    await Promise.all(list.filter((m) => m.type === 'encrypted').map((m) => store.decrypt(m)));
    const decryptedNow = useE2EE.getState().decrypted;
    return list.map((m) => toView(m, decryptedNow));
  }, []);

  const searchMessages = useCallback(
    async (q: string) => {
      if (!couple.e2ee.keys.length) {
        return get<{ messages: Message[] }>(`/messages?limit=50&q=${encodeURIComponent(q)}`).then((r) => r.messages);
      }
      // Encrypted messages can only be searched here on the device: page back through the
      // history, decrypt, and match locally.
      let all: Message[] = [];
      let before: string | undefined;
      for (let page = 0; page < 10; page++) {
        const r = await get<{ messages: Message[]; hasMore: boolean }>(`/messages?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`);
        all = [...r.messages, ...all];
        if (!r.hasMore || !r.messages.length) break;
        before = r.messages[0].createdAt;
      }
      const needle = q.toLowerCase();
      return (await readable(all)).filter((m) => !m.locked && !m.deleted && m.text.toLowerCase().includes(needle)).slice(-50);
    },
    [couple.e2ee.keys.length, readable],
  );
  const pinnedMessages = useCallback(() => get<{ messages: Message[] }>('/messages/pinned').then((r) => readable(r.messages.reverse())), [readable]);

  const presence = typing ? 'typing…' : partner?.online ? 'Online' : partner?.lastSeenAt ? `Last seen ${timeAgo(partner.lastSeenAt)}` : couple.status === 'pending' ? 'Not joined yet' : '';
  const theirZone = partner?.timezone;
  const showTheirTime = Boolean(partner && theirZone && (couple.longDistance || theirZone !== me.timezone));

  const keys = useE2EE((s) => s.keys);
  const decrypted = useE2EE((s) => s.decrypted);
  const e2ee = e2eeStatus(couple, keys);
  const [unlocking, setUnlocking] = useState(false);
  const startCall = useCall((s) => s.start);
  const inCall = useCall((s) => s.state !== 'idle');

  // Decrypt anything new as it arrives.
  useEffect(() => {
    const store = useE2EE.getState();
    for (const m of messages) if (m.type === 'encrypted') void store.decrypt(m);
  }, [messages, keys]);

  const views = useMemo(() => messages.map((m) => toView(m, decrypted)), [messages, decrypted]);
  const hasLocked = views.some((v) => v.locked);

  const rows = useMemo(() => {
    let lastDay = '';
    return views.map((m, i) => {
      const day = todayIn(undefined, new Date(m.createdAt));
      const showDay = day !== lastDay;
      lastDay = day;
      const prev = views[i - 1];
      const next = views[i + 1];
      const gap = (a?: Message, b?: Message) =>
        !a || !b || a.senderId !== b.senderId || a.type === 'call' || b.type === 'call' || Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) > 5 * 60_000;
      return { m, showDay, first: showDay || gap(prev, m), last: gap(m, next) };
    });
  }, [views]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="safe-top z-10 shrink-0 border-b border-line/70 bg-surface/85 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-2 px-2 lg:px-5">
          <Link to="/" aria-label="Back to home" className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 lg:hidden">
            <ChevronLeft className="size-6" />
          </Link>
          <Avatar name={partner?.name ?? '?'} src={partner?.avatarUrl} size="sm" online={partner?.online} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg leading-tight">{partner?.name ?? 'Waiting for your partner'}</p>
            <p className={cn('truncate text-xs', typing ? 'font-medium text-accent' : 'text-muted')} aria-live="polite">
              {e2ee.enabled && <Lock className="mr-1 inline size-3 -translate-y-px" aria-label="Encrypted" />}
              {presence}
              {showTheirTime && !typing && `${presence ? ' · ' : ''}${timeIn(theirZone!, new Date())} for them`}
            </p>
          </div>
          {partner && couple.status === 'active' && (
            <>
              <IconButton label={`Voice call ${partner.name}`} disabled={inCall} onClick={() => startCall('audio')}>
                <Phone className="size-5" />
              </IconButton>
              <IconButton label={`Video call ${partner.name}`} disabled={inCall} onClick={() => startCall('video')}>
                <Video className="size-5" />
              </IconButton>
            </>
          )}
          <IconButton label="Pinned messages" onClick={() => setPanel('pinned')}>
            <Pin className="size-5" />
          </IconButton>
          <IconButton label="Search messages" onClick={() => setPanel('search')}>
            <Search className="size-5" />
          </IconButton>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-3 lg:px-6" role="log" aria-label="Conversation">
          <div className="mx-auto max-w-3xl">
            {hasMore && (
              <div className="grid place-items-center py-4 text-accent">
                <Spinner />
              </div>
            )}
            {!loaded && !failed && (
              <div className="space-y-3 pt-6" role="status" aria-label="Loading messages">
                {[60, 40, 72, 48, 30].map((width, i) => (
                  <div key={i} className={cn('flex', i % 2 === 1 && 'justify-end')}>
                    <div style={{ width: `${width}%` }}>
                      <Skeleton className="h-10 rounded-[22px]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {failed && !loaded && <ErrorState onRetry={() => { setFailed(false); load().catch(() => setFailed(true)); }} />}
            {loaded && messages.length === 0 && (
              <EmptyState
                emoji="💬"
                title={partner ? `Say hello to ${partner.name}` : 'Your chat is ready'}
                body={partner ? 'This conversation is just for the two of you.' : 'Messages will appear here once your partner joins.'}
              />
            )}
            {rows.map(({ m, showDay, first, last }) => (
              <Fragment key={m.clientId ?? m.id}>
                {showDay && (
                  <div className="sticky top-2 z-[1] my-4 flex justify-center">
                    <span className="rounded-full border border-line/70 bg-surface/90 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <MessageBubble
                  message={m}
                  mine={m.senderId === me.id}
                  first={first}
                  last={last}
                  onAction={setTarget}
                  onLove={onLove}
                  onOpenMedia={setViewer}
                  onRetry={onRetry}
                  onCall={partner && couple.status === 'active' && !inCall ? startCall : undefined}
                  replyName={replyName}
                />
              </Fragment>
            ))}
            {typing && (
              <div className="mt-3 flex" aria-hidden>
                <div className="flex items-center gap-1 rounded-[22px] rounded-bl-md border border-line/70 bg-surface px-4 py-3.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-2 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {!atBottom && (
          <button onClick={toBottom} aria-label="Jump to latest message" className="absolute bottom-3 right-4 grid size-10 place-items-center rounded-full border border-line bg-surface text-ink shadow-float">
            <ArrowDown className="size-5" />
          </button>
        )}
      </div>

      <div className="shrink-0">
        {(e2ee.locked || (hasLocked && couple.e2ee.keys.length > 0)) && (
          <div className="flex items-center gap-3 border-t border-line/70 bg-accent-soft px-4 py-3">
            <Lock className="size-5 shrink-0 text-accent" />
            <p className="min-w-0 flex-1 text-sm">
              {e2ee.locked ? 'Encrypted chat is on. Enter your shared passphrase to read and send messages on this device.' : 'Some messages need an older passphrase to read.'}
            </p>
            <Button size="sm" onClick={() => setUnlocking(true)}>
              Unlock
            </Button>
          </div>
        )}
        <div className={cn(e2ee.locked && 'hidden')}>
          <Composer
            replyTo={replyTo}
            editing={editing}
            replyName={replyTo ? replyName(replyTo.senderId) : ''}
            disabled={couple.status === 'ended'}
            onClearContext={() => {
              setReplyTo(null);
              setEditing(null);
            }}
            onSaveEdit={async (text) => {
              const current = editing as ViewMessage | null;
              setEditing(null);
              if (!current || text === current.text) return;
              if (current.encrypted) {
                const payload = { v: 1 as const, type: 'text' as const, text, reply: current.replyTo ?? undefined };
                await act(async () => {
                  const cipher = await encryptPayload(couple, payload);
                  const { message } = await patch<{ message: Message }>(`/messages/${current.id}`, { cipher });
                  useE2EE.getState().remember(message, payload);
                });
              } else await act(() => patch(`/messages/${current.id}`, { text }));
            }}
          />
        </div>
      </div>

      <Sheet open={Boolean(target)} onClose={() => setTarget(null)}>
        {target && (
          <div>
            <div className="mb-3 flex justify-between gap-1" role="group" aria-label="React">
              {REACTIONS.map((emoji) => {
                const mine = target.reactions.some((r) => r.userId === me.id && r.emoji === emoji);
                return (
                  <button
                    key={emoji}
                    aria-label={`React with ${emoji}`}
                    aria-pressed={mine}
                    onClick={() => {
                      void react(target, emoji);
                      setTarget(null);
                    }}
                    className={cn('grid size-11 place-items-center rounded-full text-2xl transition hover:scale-110 active:scale-125', mine ? 'bg-accent-soft' : 'bg-surface-2')}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <ActionRow icon={<Reply className="size-5" />} label="Reply" onClick={() => { setEditing(null); setReplyTo(target); setTarget(null); }} />
            {target.text && (
              <ActionRow
                icon={<Copy className="size-5" />}
                label="Copy text"
                onClick={async () => {
                  const copied = await copyText(target.text);
                  if (copied) toast.success('Copied');
                  else toast.error('Copy failed');
                  setTarget(null);
                }}
              />
            )}
            <ActionRow
              icon={target.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
              label={target.pinned ? 'Unpin' : 'Pin message'}
              onClick={() => {
                void act(() => post(`/messages/${target.id}/pin`, { pinned: !target.pinned }));
                setTarget(null);
              }}
            />
            {target.senderId === me.id && target.type === 'text' && (
              <ActionRow icon={<Pencil className="size-5" />} label="Edit" onClick={() => { setReplyTo(null); setEditing(target); setTarget(null); }} />
            )}
            {target.senderId === me.id && <ActionRow icon={<Trash2 className="size-5" />} label="Delete" danger onClick={() => remove(target)} />}
          </div>
        )}
      </Sheet>

      <MessageList title="Search messages" open={panel === 'search'} onClose={() => setPanel(null)} load={searchMessages} empty="No messages match that." />
      <MessageList title="Pinned messages" open={panel === 'pinned'} onClose={() => setPanel(null)} load={pinnedMessages} empty="Pin a message to keep it handy here." />
      <Lightbox media={viewer} onClose={() => setViewer(null)} />
      <UnlockSheet open={unlocking} onClose={() => setUnlocking(false)} />
    </div>
  );
}
