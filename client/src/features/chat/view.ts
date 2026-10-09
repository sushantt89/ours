import { useEffect, useState } from 'react';
import type { Media, Message } from '@/lib/types';
import { cacheKey, decryptedMediaUrl, type Payload } from '@/store/e2ee';

export interface ViewMessage extends Message {
  /** Encrypted, and this device doesn't have the key (or it failed to decrypt). */
  locked?: boolean;
  encrypted?: boolean;
}

/** Turns a stored message into what the bubble shows, decrypting it if it's encrypted. */
export function toView(m: Message, decrypted: Record<string, Payload | 'error'>): ViewMessage {
  if (m.type !== 'encrypted' || !m.cipher) return m;
  const payload = decrypted[cacheKey(m)];
  if (!payload || payload === 'error') {
    return { ...m, type: 'text', text: payload === 'error' ? "🔒 This message couldn't be decrypted" : '🔒 Encrypted message', locked: true, encrypted: true };
  }
  const keyId = m.cipher.keyId;
  const media: Media | null = payload.media
    ? { ...payload.media, storage: 'app', url: `/api/media/${payload.media.id}`, thumbUrl: null, e2eeKeyId: keyId }
    : null;
  return {
    ...m,
    type: payload.type,
    text: payload.text ?? '',
    gif: payload.gif ?? null,
    media,
    replyTo: payload.reply ?? m.replyTo,
    encrypted: true,
  };
}

/** A plain URL for normal attachments; a decrypted blob URL for encrypted ones. */
export function useMediaSrc(media: Media | null | undefined) {
  const direct = media && !media.e2eeKeyId ? media.url : null;
  const [src, setSrc] = useState<string | null>(direct);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!media?.e2eeKeyId) {
      setSrc(media?.url ?? null);
      return;
    }
    let live = true;
    setSrc(null);
    decryptedMediaUrl(media, media.e2eeKeyId)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [media?.id, media?.e2eeKeyId, media?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  return { src, failed };
}
