import { create } from 'zustand';
import { get, post, errorMessage } from '@/lib/api';
import type { Message } from '@/lib/types';
import { toast } from './ui';
import { useAuth } from './auth';
import { e2eeStatus, encryptPayload, useE2EE, type Payload } from './e2ee';

interface ChatState {
  messages: Message[];
  loaded: boolean;
  loading: boolean;
  hasMore: boolean;
  unread: number;
  load: () => Promise<void>;
  loadOlder: () => Promise<void>;
  upsert: (message: Message, fromSocket?: boolean) => void;
  send: (draft: Partial<Message> & { mediaId?: string; replyToId?: string }, me: string) => Promise<void>;
  retry: (clientId: string, me: string) => Promise<void>;
  markRead: () => Promise<void>;
  applyRead: (readerId: string, at: string, me: string) => void;
  setUnread: (n: number) => void;
  reset: () => void;
}

interface Draft {
  body: Record<string, unknown>;
  /** The readable content, when the message goes out end-to-end encrypted. */
  payload?: Payload;
}
const drafts = new Map<string, Draft>();

/** Builds what goes inside an encrypted message from a draft. */
function toPayload(draft: Partial<Message>): Payload {
  const m = draft.media;
  return {
    v: 1,
    type: (draft.type ?? 'text') as Payload['type'],
    text: draft.text || undefined,
    gif: draft.gif ?? undefined,
    media: m
      ? { id: m.id, kind: m.kind as 'image' | 'video' | 'audio', mime: m.mime, name: m.name, size: m.size, width: m.width, height: m.height, duration: m.duration }
      : undefined,
    reply: draft.replyTo ?? undefined,
  };
}

export const useChat = create<ChatState>((set, getState) => ({
  messages: [],
  loaded: false,
  loading: false,
  hasMore: false,
  unread: 0,

  async load() {
    if (getState().loading) return;
    set({ loading: true });
    try {
      const data = await get<{ messages: Message[]; hasMore: boolean }>('/messages?limit=40');
      // Keep anything still sending so a refresh doesn't swallow it.
      const pending = getState().messages.filter((m) => m.pending || m.failed);
      set({ messages: [...data.messages, ...pending], hasMore: data.hasMore, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  async loadOlder() {
    const { messages, hasMore, loading } = getState();
    if (!hasMore || loading || !messages.length) return;
    set({ loading: true });
    try {
      const before = encodeURIComponent(messages[0].createdAt);
      const data = await get<{ messages: Message[]; hasMore: boolean }>(`/messages?limit=40&before=${before}`);
      set((s) => ({ messages: [...data.messages, ...s.messages], hasMore: data.hasMore }));
    } finally {
      set({ loading: false });
    }
  },

  upsert(message) {
    set((s) => {
      const index = s.messages.findIndex((m) => m.id === message.id || (message.clientId && m.clientId === message.clientId));
      if (index >= 0) {
        const next = s.messages.slice();
        next[index] = message;
        return { messages: next };
      }
      return { messages: [...s.messages, message] };
    });
  },

  async send(draft, me) {
    const clientId = crypto.randomUUID();
    const { replyToId, mediaId, ...rest } = draft;
    const couple = useAuth.getState().couple;
    const { enabled } = e2eeStatus(couple, useE2EE.getState().keys);
    const plain = { type: 'text', text: '', ...rest, mediaId, replyTo: replyToId, clientId, media: undefined };
    if (enabled && couple) {
      // Only ciphertext leaves the device.
      const payload = toPayload(draft);
      try {
        const cipher = await encryptPayload(couple, payload);
        drafts.set(clientId, { body: { type: 'encrypted', cipher, mediaId, replyTo: replyToId, clientId }, payload });
      } catch (err) {
        return toast.error(errorMessage(err));
      }
    } else {
      drafts.set(clientId, { body: plain });
    }
    // Show it immediately; the server's copy replaces this one when it arrives.
    getState().upsert({
      id: clientId,
      senderId: me,
      type: 'text',
      text: '',
      media: null,
      gif: null,
      reactions: [],
      pinned: false,
      readAt: null,
      editedAt: null,
      deleted: false,
      createdAt: new Date().toISOString(),
      ...rest,
      replyTo: draft.replyTo ?? null,
      clientId,
      pending: true,
    });
    await deliver(clientId);
  },

  async retry(clientId) {
    set((s) => ({ messages: s.messages.map((m) => (m.clientId === clientId ? { ...m, failed: false, pending: true } : m)) }));
    await deliver(clientId);
  },

  async markRead() {
    if (getState().unread === 0 && !getState().messages.some((m) => !m.readAt)) return;
    set({ unread: 0 });
    await post('/messages/read').catch(() => undefined);
  },

  applyRead(readerId, at, me) {
    // The reader's messages-from-partner are now read; for the sender, their own messages are.
    set((s) => ({
      unread: readerId === me ? 0 : s.unread,
      messages: s.messages.map((m) => (m.senderId !== readerId && !m.readAt ? { ...m, readAt: at } : m)),
    }));
  },

  setUnread: (unread) => set({ unread }),
  reset: () => set({ messages: [], loaded: false, hasMore: false, unread: 0 }),
}));

async function deliver(clientId: string) {
  const draft = drafts.get(clientId);
  if (!draft) return;
  try {
    const { message } = await post<{ message: Message }>('/messages', draft.body);
    drafts.delete(clientId);
    if (draft.payload) useE2EE.getState().remember(message, draft.payload);
    useChat.getState().upsert(message);
  } catch (err) {
    useChat.setState((s) => ({
      messages: s.messages.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)),
    }));
    toast.error(errorMessage(err));
  }
}
