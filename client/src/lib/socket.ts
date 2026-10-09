import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api';
import { queryClient } from './queryClient';
import type { AppNotification, Message } from './types';
import { useAuth } from '@/store/auth';
import { useChat } from '@/store/chat';
import { useRealtime } from '@/store/realtime';
import { toast } from '@/store/ui';

let socket: Socket | null = null;
export const getSocket = () => socket;
let typingTimer: ReturnType<typeof setTimeout> | undefined;

const onChatScreen = () => location.pathname.startsWith('/chat') && document.visibilityState === 'visible';

export function connectSocket() {
  if (socket) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
    // Evaluated on every (re)connect, so a refreshed token is always used.
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => {
    useRealtime.setState({ connected: true });
    socket?.emit('visibility', document.visibilityState === 'visible');
    // Anything missed while disconnected is picked up here.
    if (useChat.getState().loaded) void useChat.getState().load();
    void queryClient.invalidateQueries();
  });
  socket.on('disconnect', () => useRealtime.setState({ connected: false, partnerTyping: false }));
  socket.on('connect_error', async (err) => {
    if (err.message === 'unauthorized') await refreshSession().catch(() => false);
  });

  socket.on('message:new', (message: Message) => {
    const me = useAuth.getState().user?.id;
    useChat.getState().upsert(message);
    useRealtime.setState({ partnerTyping: false });
    if (message.senderId !== me) {
      if (onChatScreen()) void useChat.getState().markRead();
      else useChat.setState((s) => ({ unread: s.unread + 1 }));
    }
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  });
  socket.on('message:update', (message: Message) => useChat.getState().upsert(message));
  socket.on('message:read', ({ readerId, at }: { readerId: string; at: string }) => {
    const me = useAuth.getState().user?.id;
    if (me) useChat.getState().applyRead(readerId, at, me);
  });

  socket.on('typing', ({ isTyping }: { isTyping: boolean }) => {
    useRealtime.setState({ partnerTyping: isTyping });
    clearTimeout(typingTimer);
    if (isTyping) typingTimer = setTimeout(() => useRealtime.setState({ partnerTyping: false }), 6000);
  });

  socket.on('presence', (p: { userId: string; online: boolean | null; lastSeenAt: string | null }) => {
    const { partner, patchPartner } = useAuth.getState();
    if (partner?.id === p.userId) patchPartner({ online: p.online, lastSeenAt: p.lastSeenAt });
  });

  socket.on('nudge', (nudge) => useRealtime.getState().showNudge(nudge));

  // Calls: imported lazily so the call code only loads once a call happens.
  const calls = () => import('@/features/calls/callStore').then((m) => m.useCall.getState());
  socket.on('call:incoming', (p) => void calls().then((c) => c.onIncoming(p)));
  socket.on('call:accepted', (p) => void calls().then((c) => c.onAccepted(p)));
  socket.on('call:signal', (p) => void calls().then((c) => c.onSignal(p)));
  socket.on('call:ended', (p) => void calls().then((c) => c.onEnded(p)));

  socket.on('notification', (n: AppNotification) => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    // Chat and nudges have their own on-screen treatment.
    if (n.type === 'message' ? !onChatScreen() : n.type !== 'nudge') {
      toast.info(n.body ? `${n.title} — ${n.body}` : n.title, n.emoji, { label: 'View', onClick: () => window.dispatchEvent(new CustomEvent('ours:navigate', { detail: n.url })) });
    }
  });

  // The server names what changed; we refetch just those screens.
  socket.on('sync', ({ keys }: { keys: string[] }) => {
    for (const key of keys) {
      if (key === 'session') void useAuth.getState().reload();
      else void queryClient.invalidateQueries({ queryKey: [key] });
    }
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  useRealtime.setState({ connected: false, partnerTyping: false });
}

let lastTyping = 0;
export function sendTyping(isTyping: boolean) {
  const now = Date.now();
  if (isTyping && now - lastTyping < 2500) return;
  lastTyping = isTyping ? now : 0;
  socket?.emit('typing', isTyping);
}

document.addEventListener('visibilitychange', () => {
  socket?.emit('visibility', document.visibilityState === 'visible');
});
