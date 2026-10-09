import { create } from 'zustand';
import { post } from '@/lib/api';
import { checkVerifier, clearKeys, decryptBytes, decryptJSON, deriveKey, encryptBytes, encryptJSON, loadKey, newKeyParams, saveKey, supported } from '@/lib/e2ee';
import type { Cipher, Couple, Media, Message, Session } from '@/lib/types';

/** What travels inside an encrypted message. The server sees none of it. */
export interface Payload {
  v: 1;
  type: 'text' | 'sticker' | 'gif' | 'image' | 'video' | 'audio';
  text?: string;
  gif?: Message['gif'];
  media?: { id: string; kind: 'image' | 'video' | 'audio'; mime: string; name: string; size: number; width?: number; height?: number; duration?: number };
  reply?: { id: string; senderId: string; preview: string };
}

type Decrypted = Payload | 'error';

interface E2EEState {
  coupleId: string | null;
  keys: Record<string, CryptoKey>;
  loaded: boolean;
  decrypted: Record<string, Decrypted>;
  load: (couple: Couple) => Promise<void>;
  unlock: (passphrase: string, couple: Couple) => Promise<number>;
  setup: (passphrase: string) => Promise<Session>;
  decrypt: (message: Pick<Message, 'id' | 'cipher'>) => Promise<void>;
  remember: (message: Pick<Message, 'id' | 'cipher'>, payload: Payload) => void;
  reset: () => Promise<void>;
}

export const cacheKey = (m: { id: string; cipher?: Cipher | null }) => `${m.id}:${m.cipher?.iv ?? ''}`;

export const useE2EE = create<E2EEState>((set, get) => ({
  coupleId: null,
  keys: {},
  loaded: false,
  decrypted: {},

  async load(couple) {
    if (!supported()) return set({ loaded: true });
    const keys: Record<string, CryptoKey> = {};
    for (const info of couple.e2ee.keys) {
      const key = await loadKey(couple.id, info.keyId);
      if (key) keys[info.keyId] = key;
    }
    set({ coupleId: couple.id, keys, loaded: true });
  },

  /** Tries the passphrase against every key this device doesn't have yet. */
  async unlock(passphrase, couple) {
    let matched = 0;
    const keys = { ...get().keys };
    for (const info of couple.e2ee.keys) {
      if (keys[info.keyId]) continue;
      const key = await deriveKey(passphrase, info.salt, info.iterations);
      if (await checkVerifier(key, info.verifier)) {
        keys[info.keyId] = key;
        await saveKey(couple.id, info.keyId, key);
        matched++;
      }
    }
    if (matched) set({ keys, coupleId: couple.id, decrypted: Object.fromEntries(Object.entries(get().decrypted).filter(([, v]) => v !== 'error')) });
    return matched;
  },

  async setup(passphrase) {
    const { key, info } = await newKeyParams(passphrase);
    const session = await post<Session>('/couple/e2ee/keys', info);
    await saveKey(session.couple!.id, info.keyId, key);
    set((s) => ({ keys: { ...s.keys, [info.keyId]: key }, coupleId: session.couple!.id }));
    return session;
  },

  async decrypt(message) {
    const id = cacheKey(message);
    if (!message.cipher || get().decrypted[id]) return;
    const key = get().keys[message.cipher.keyId];
    if (!key) return;
    try {
      const payload = await decryptJSON<Payload>(key, message.cipher);
      set((s) => ({ decrypted: { ...s.decrypted, [id]: payload } }));
    } catch {
      set((s) => ({ decrypted: { ...s.decrypted, [id]: 'error' } }));
    }
  },

  remember(message, payload) {
    set((s) => ({ decrypted: { ...s.decrypted, [cacheKey(message)]: payload } }));
  },

  async reset() {
    set({ keys: {}, decrypted: {}, loaded: false, coupleId: null });
    await clearKeys();
  },
}));

export const activeKeyId = (couple: Couple | null) => couple?.e2ee.keys.at(-1)?.keyId ?? null;

/** True when new messages must be encrypted, and whether this device can do it. */
export function e2eeStatus(couple: Couple | null, keys: Record<string, CryptoKey>) {
  const enabled = Boolean(couple?.e2ee.enabled);
  const keyId = activeKeyId(couple);
  return { enabled, keyId, canSend: !enabled || Boolean(keyId && keys[keyId]), locked: enabled && !(keyId && keys[keyId]) };
}

export async function encryptPayload(couple: Couple, payload: Payload) {
  const keyId = activeKeyId(couple)!;
  const key = useE2EE.getState().keys[keyId];
  if (!key) throw new Error('Unlock encrypted chat first');
  return encryptJSON(key, keyId, payload);
}

export async function encryptFile(couple: Couple, file: Blob) {
  const key = useE2EE.getState().keys[activeKeyId(couple)!];
  if (!key) throw new Error('Unlock encrypted chat first');
  return new Blob([await encryptBytes(key, await file.arrayBuffer())], { type: 'application/octet-stream' });
}

const blobUrls = new Map<string, Promise<string>>();

/** Downloads an encrypted attachment and decrypts it into a local blob URL. */
export function decryptedMediaUrl(media: Media, keyId: string) {
  const cacheId = `${media.id}:${keyId}`;
  if (!blobUrls.has(cacheId)) {
    blobUrls.set(
      cacheId,
      (async () => {
        const key = useE2EE.getState().keys[keyId];
        if (!key) throw new Error('locked');
        const res = await fetch(`/api/media/${media.id}`, { credentials: 'include' });
        if (!res.ok) throw new Error('download failed');
        const plain = await decryptBytes(key, await res.arrayBuffer());
        return URL.createObjectURL(new Blob([plain], { type: media.mime }));
      })().catch((err) => {
        blobUrls.delete(cacheId);
        throw err;
      }),
    );
  }
  return blobUrls.get(cacheId)!;
}
