import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Mic, SendHorizontal, Smile, Sticker, Trash2, X } from 'lucide-react';
import { errorMessage, get, upload } from '@/lib/api';
import { STICKERS } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { formatDuration, recorderMime, videoPoster } from '@/lib/media';
import { sendTyping } from '@/lib/socket';
import type { Media, Message } from '@/lib/types';
import { useAuth, useMe } from '@/store/auth';
import { useChat } from '@/store/chat';
import { e2eeStatus, encryptFile, useE2EE } from '@/store/e2ee';
import { toast } from '@/store/ui';
import { EmojiGrid, IconButton, Segmented, Spinner } from '@/components/ui';

interface Props {
  replyTo: Message | null;
  editing: Message | null;
  onClearContext: () => void;
  onSaveEdit: (text: string) => Promise<void>;
  replyName: string;
  disabled?: boolean;
}

interface Gif {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title: string;
}

function GifResults({ type, onPick }: { type: 'gifs' | 'stickers'; onPick: (gif: Gif) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Gif[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError('');
      get<{ results: Gif[] }>(`/gifs?type=${type}&q=${encodeURIComponent(query)}`, controller.signal)
        .then((r) => setResults(r.results))
        .catch((err) => err.name !== 'AbortError' && setError(errorMessage(err)));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, type]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${type === 'gifs' ? 'GIFs' : 'stickers'}`}
        aria-label={`Search ${type}`}
        className="mb-2 h-10 w-full rounded-full border border-line bg-surface-2 px-4 text-sm outline-none focus:border-accent"
      />
      {error ? (
        <p className="py-6 text-center text-sm text-muted">{error}</p>
      ) : !results ? (
        <div className="grid place-items-center py-8 text-accent">
          <Spinner />
        </div>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing found. Try another word.</p>
      ) : (
        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain">
          {results.map((gif) => (
            <button key={gif.id} onClick={() => onPick(gif)} className="overflow-hidden rounded-xl bg-surface-2" aria-label={gif.title || 'GIF'}>
              <img src={gif.preview} alt="" loading="lazy" className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-right text-[10px] uppercase tracking-wider text-faint">Powered by GIPHY</p>
    </div>
  );
}

type Tray = 'emoji' | 'stickers' | 'gifs' | null;

export function Composer({ replyTo, editing, onClearContext, onSaveEdit, replyName, disabled }: Props) {
  const me = useMe();
  const config = useAuth((s) => s.config);
  const send = useChat((s) => s.send);
  const [text, setText] = useState('');
  const [tray, setTray] = useState<Tray>(null);
  const [stickerTab, setStickerTab] = useState<'ours' | 'giphy'>('ours');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState<{ startedAt: number; seconds: number } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      setText(editing.text);
      input.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  // Grow the box with the message, up to a point.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const context = () => ({ replyToId: replyTo?.id, replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, preview: replyTo.text || 'Attachment' } : null });

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setText('');
    sendTyping(false);
    if (editing) {
      await onSaveEdit(value);
    } else {
      void send({ type: 'text', text: value, ...context() }, me.id);
      onClearContext();
    }
  }

  /**
   * Uploads an attachment. With encrypted chat on, the file is encrypted here first and the
   * server only ever receives unreadable bytes; its real type and size travel inside the
   * encrypted message instead.
   */
  async function uploadAttachment(file: Blob, name: string, extra: { duration?: number; poster?: Blob | null } = {}): Promise<Media> {
    const couple = useAuth.getState().couple;
    const encrypted = e2eeStatus(couple, useE2EE.getState().keys).enabled;
    const form = new FormData();
    if (encrypted && couple) {
      form.append('file', await encryptFile(couple, file), 'encrypted.bin');
      form.append('encrypted', '1');
    } else {
      form.append('file', file, name);
      if (extra.poster) form.append('poster', extra.poster, 'poster.jpg');
      if (extra.duration) form.append('duration', String(extra.duration));
    }
    const { media } = await upload<{ media: Media }>('/messages/upload', form);
    if (!encrypted) return media;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
    let size: { width?: number; height?: number } = {};
    if (kind === 'image') {
      try {
        const bitmap = await createImageBitmap(file);
        size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } catch {
        /* unknown size is fine */
      }
    }
    // The local copy displays instantly; the partner's app decrypts the uploaded one.
    return { ...media, kind, mime: file.type || 'application/octet-stream', name, size: file.size, duration: extra.duration, ...size, url: URL.createObjectURL(file), thumbUrl: null };
  }

  async function sendFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const isVideo = file.type.startsWith('video/');
        const extra = isVideo ? await videoPoster(file).then(({ blob, duration }) => ({ poster: blob, duration })) : {};
        const media = await uploadAttachment(file, file.name, extra);
        void send({ type: media.kind as Message['type'], media, mediaId: media.id, ...context() }, me.id);
      }
      onClearContext();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function startRecording() {
    const mimeType = recorderMime();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) return toast.error("Voice messages aren't supported in this browser");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      cancelled.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = (Date.now() - startedAt) / 1000;
        setRecording(null);
        if (cancelled.current || seconds < 0.6) return;
        setUploading(true);
        try {
          const type = mimeType.split(';')[0];
          const blob = new Blob(chunks, { type });
          const media = await uploadAttachment(blob, `voice.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, { duration: seconds });
          void send({ type: 'audio', media: { ...media, kind: 'audio', duration: seconds }, mediaId: media.id, ...context() }, me.id);
          onClearContext();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setUploading(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording({ startedAt, seconds: 0 });
    } catch {
      toast.error('Microphone access is needed to record a voice message');
    }
  }

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - recording.startedAt) / 1000;
      setRecording((r) => r && { ...r, seconds });
      if (seconds >= 300) recorder.current?.stop(); // five-minute cap
    }, 250);
    return () => clearInterval(timer);
  }, [recording?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = (discard: boolean) => {
    cancelled.current = discard;
    recorder.current?.stop();
  };

  if (disabled) {
    return <p className="safe-bottom border-t border-line/70 bg-surface px-4 py-4 text-center text-sm text-muted">This conversation is read-only.</p>;
  }

  return (
    <div className="safe-bottom border-t border-line/70 bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl">
      {(replyTo || editing) && (
        <div className="flex items-center gap-3 border-b border-line/70 px-4 py-2">
          <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2.5">
            <p className="text-xs font-semibold text-accent">{editing ? 'Editing message' : `Replying to ${replyName}`}</p>
            <p className="truncate text-sm text-muted">{(editing ?? replyTo)!.text || 'Attachment'}</p>
          </div>
          <IconButton
            size="sm"
            label="Cancel"
            onClick={() => {
              if (editing) setText('');
              onClearContext();
            }}
          >
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      {tray && (
        <div className="animate-fade-up border-b border-line/70 px-3 py-3">
          {tray === 'emoji' && <EmojiGrid className="max-h-56" onPick={(emoji) => setText((t) => t + emoji)} />}
          {tray === 'gifs' && (
            <GifResults
              type="gifs"
              onPick={(gif) => {
                void send({ type: 'gif', gif: { url: gif.url, preview: gif.preview, width: gif.width, height: gif.height }, ...context() }, me.id);
                setTray(null);
                onClearContext();
              }}
            />
          )}
          {tray === 'stickers' && (
            <div>
              {config?.gifsEnabled && (
                <Segmented
                  label="Sticker source"
                  className="mb-2 w-full"
                  value={stickerTab}
                  onChange={setStickerTab}
                  options={[
                    { value: 'ours', label: 'Ours' },
                    { value: 'giphy', label: 'More stickers' },
                  ]}
                />
              )}
              {stickerTab === 'ours' || !config?.gifsEnabled ? (
                <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto overscroll-contain">
                  {STICKERS.map((s) => (
                    <button
                      key={s}
                      aria-label={`Send ${s} sticker`}
                      onClick={() => {
                        void send({ type: 'sticker', text: s, ...context() }, me.id);
                        setTray(null);
                        onClearContext();
                      }}
                      className="grid aspect-square place-items-center rounded-2xl text-4xl transition hover:bg-surface-2 active:scale-90"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <GifResults
                  type="stickers"
                  onPick={(gif) => {
                    void send({ type: 'gif', gif: { url: gif.url, preview: gif.preview, width: gif.width, height: gif.height }, ...context() }, me.id);
                    setTray(null);
                    onClearContext();
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 px-3 py-2.5">
          <IconButton label="Discard recording" onClick={() => stopRecording(true)} className="text-danger">
            <Trash2 className="size-5" />
          </IconButton>
          <div className="flex flex-1 items-center gap-2.5 rounded-full bg-surface-2 px-4 py-2.5" role="status">
            <span className="size-2.5 animate-pulse rounded-full bg-danger" />
            <span className="font-medium tabular-nums">{formatDuration(recording.seconds)}</span>
            <span className="text-sm text-muted">Recording…</span>
          </div>
          <button onClick={() => stopRecording(false)} aria-label="Send voice message" className="grid size-11 shrink-0 place-items-center rounded-full accent-gradient text-on-accent shadow-card transition active:scale-90">
            <SendHorizontal className="size-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1 px-2 py-2">
          <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => sendFiles(e.target.files)} />
          {!editing && (
            <IconButton label="Send a photo or video" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Spinner className="size-5 text-accent" /> : <ImagePlus className="size-[22px]" />}
            </IconButton>
          )}
          <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-[22px] border border-line bg-surface-2 pl-4 pr-1 focus-within:border-accent">
            <textarea
              ref={input}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                sendTyping(e.target.value.length > 0);
              }}
              onBlur={() => sendTyping(false)}
              onKeyDown={(e) => {
                // Enter sends on desktop; on touch keyboards Enter is a new line.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) {
                  e.preventDefault();
                  void submit();
                }
                if (e.key === 'Escape' && (editing || replyTo)) {
                  if (editing) setText('');
                  onClearContext();
                }
              }}
              placeholder="Message"
              aria-label="Message"
              maxLength={4000}
              className="max-h-36 min-w-0 flex-1 resize-none bg-transparent py-2.5 leading-snug outline-none placeholder:text-faint"
            />
            <IconButton size="sm" className="mb-1.5" label="Emoji" active={tray === 'emoji'} onClick={() => setTray((t) => (t === 'emoji' ? null : 'emoji'))}>
              <Smile className="size-5" />
            </IconButton>
            {!editing && (
              <IconButton size="sm" className="mb-1.5" label="Stickers" active={tray === 'stickers'} onClick={() => setTray((t) => (t === 'stickers' ? null : 'stickers'))}>
                <Sticker className="size-5" />
              </IconButton>
            )}
            {!editing && config?.gifsEnabled && (
              <button
                aria-label="GIFs"
                aria-pressed={tray === 'gifs'}
                onClick={() => setTray((t) => (t === 'gifs' ? null : 'gifs'))}
                className={cn('mb-1.5 mr-1 h-8 rounded-full px-2 text-[11px] font-bold tracking-wide', tray === 'gifs' ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface')}
              >
                GIF
              </button>
            )}
          </div>
          {text.trim() ? (
            <button onClick={submit} aria-label={editing ? 'Save changes' : 'Send'} className="grid size-11 shrink-0 place-items-center rounded-full accent-gradient text-on-accent shadow-card transition active:scale-90">
              <SendHorizontal className="size-5" />
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  navigator.vibrate?.(20);
                  void send({ type: 'text', text: 'I love you ❤️' }, me.id);
                }}
                aria-label='Send "I love you"'
                title='Send "I love you ❤️"'
                className="grid size-11 shrink-0 place-items-center rounded-full text-2xl transition hover:bg-surface-2 active:scale-125"
              >
                ❤️
              </button>
              <IconButton label="Record a voice message" onClick={startRecording} disabled={uploading}>
                <Mic className="size-[22px]" />
              </IconButton>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
