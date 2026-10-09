import { memo, useRef } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, Lock, MoreHorizontal, Phone, PhoneMissed, Pin, Play, Video } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/dates';
import { formatDuration } from '@/lib/media';
import type { Media } from '@/lib/types';
import { Spinner } from '@/components/ui';
import { useMediaSrc, type ViewMessage } from './view';

interface Props {
  message: ViewMessage;
  mine: boolean;
  /** First message in a run from the same sender: gets the fuller corner. */
  first: boolean;
  last: boolean;
  onAction: (message: ViewMessage) => void;
  onLove: (message: ViewMessage) => void;
  onOpenMedia: (media: Media) => void;
  onRetry: (message: ViewMessage) => void;
  onCall?: (kind: 'audio' | 'video') => void;
  replyName: (senderId: string) => string;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u;

function Ticks({ message }: { message: ViewMessage }) {
  if (message.failed) return <AlertCircle className="size-3.5 text-danger" aria-label="Not sent" />;
  if (message.pending) return <Clock className="size-3" aria-label="Sending" />;
  if (message.readAt) return <CheckCheck className="size-3.5" aria-label="Read" />;
  return <Check className="size-3.5 opacity-70" aria-label="Sent" />;
}

function VoiceNote({ media, mine }: { media: Media; mine: boolean }) {
  const { src } = useMediaSrc(media);
  return (
    <div className="flex min-w-52 items-center gap-2">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', mine ? 'bg-white/20' : 'bg-accent-soft text-accent')} aria-hidden>
        🎤
      </span>
      <audio src={src ?? undefined} controls preload="metadata" className="h-9 w-48 max-w-full" aria-label={`Voice message${media.duration ? `, ${formatDuration(media.duration)}` : ''}`} />
    </div>
  );
}

function SecureImage({ media, onOpen }: { media: Media; onOpen: (media: Media) => void }) {
  const { src, failed } = useMediaSrc(media);
  if (!src) {
    return (
      <span className="grid h-44 w-56 place-items-center rounded-[18px] bg-black/10 text-current" aria-busy={!failed}>
        {failed ? <span className="text-sm">Couldn't open this photo</span> : <Spinner />}
      </span>
    );
  }
  return (
    <button className="block" onClick={() => onOpen({ ...media, url: src, thumbUrl: src })} aria-label="Open photo">
      <img src={media.e2eeKeyId ? src : (media.thumbUrl ?? src)} alt="Photo" width={media.width} height={media.height} loading="lazy" className="max-h-80 w-auto min-w-32 rounded-[18px] object-cover" />
    </button>
  );
}

function SecureVideo({ media, onOpen }: { media: Media; onOpen: (media: Media) => void }) {
  const { src } = useMediaSrc(media);
  return (
    <button className="relative block" disabled={!src} onClick={() => src && onOpen({ ...media, url: src, thumbUrl: media.e2eeKeyId ? null : media.thumbUrl })} aria-label="Play video">
      {media.thumbUrl && !media.e2eeKeyId ? (
        <img src={media.thumbUrl} alt="Video" className="max-h-80 min-w-40 rounded-[18px] object-cover" loading="lazy" />
      ) : src && media.e2eeKeyId ? (
        <video src={src} muted playsInline preload="metadata" className="max-h-80 min-w-40 rounded-[18px] object-cover" />
      ) : (
        <span className="block h-44 w-60 rounded-[18px] bg-black/70" />
      )}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur">{src ? <Play className="size-5 translate-x-0.5 fill-current" /> : <Spinner />}</span>
      </span>
      {media.duration ? <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{formatDuration(media.duration)}</span> : null}
    </button>
  );
}

/** A call log entry: centred in the conversation, not a bubble. */
function CallEntry({ message, mine, onCall }: { message: ViewMessage; mine: boolean; onCall?: (kind: 'audio' | 'video') => void }) {
  const call = message.call!;
  const missed = call.status !== 'completed';
  const Icon = missed ? PhoneMissed : call.kind === 'video' ? Video : Phone;
  const label = missed
    ? call.status === 'declined'
      ? 'Declined call'
      : mine
        ? 'No answer'
        : `Missed ${call.kind === 'video' ? 'video call' : 'call'}`
    : `${call.kind === 'video' ? 'Video call' : 'Call'} · ${formatDuration(call.duration)}`;
  return (
    <div id={`m-${message.id}`} className="my-3 flex justify-center">
      <span className={cn('inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface px-3.5 py-1.5 text-sm shadow-sm', missed && !mine && 'text-danger')}>
        <Icon className="size-4" />
        {label}
        <span className="text-xs text-muted">{formatTime(message.createdAt)}</span>
        {onCall && (
          <button onClick={() => onCall(call.kind)} className="ml-1 font-semibold text-accent">
            Call back
          </button>
        )}
      </span>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({ message, mine, first, last, onAction, onLove, onOpenMedia, onRetry, onCall, replyName }: Props) {
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTap = useRef(0);
  const m = message;
  if (m.type === 'call' && m.call) return <CallEntry message={m} mine={mine} onCall={onCall} />;
  const visual = !m.deleted && (m.type === 'image' || m.type === 'video' || m.type === 'gif');
  const sticker = !m.deleted && (m.type === 'sticker' || (m.type === 'text' && EMOJI_ONLY.test(m.text) && [...m.text.replace(/\s/g, '')].length <= 6 && !m.replyTo));
  const canAct = !m.deleted && !m.pending && !m.failed && !m.locked;

  const startPress = () => {
    if (!canAct) return;
    press.current = setTimeout(() => {
      navigator.vibrate?.(15);
      onAction(m);
    }, 450);
  };
  const endPress = () => clearTimeout(press.current);
  const tap = () => {
    // Double-tap to love, like you'd expect.
    const now = Date.now();
    if (canAct && now - lastTap.current < 300) onLove(m);
    lastTap.current = now;
  };

  const meta = (
    <span className={cn('ml-2 inline-flex shrink-0 translate-y-0.5 items-center gap-1 text-[10.5px] leading-none', sticker || visual ? 'text-muted' : mine ? 'text-on-accent/75' : 'text-muted')}>
      {m.pinned && <Pin className="size-3" aria-label="Pinned" />}
      {m.encrypted && !m.locked && <Lock className="size-2.5" aria-label="End-to-end encrypted" />}
      {m.editedAt && !m.deleted && <span>edited</span>}
      <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
      {mine && !m.deleted && <Ticks message={m} />}
    </span>
  );

  return (
    <div id={`m-${m.id}`} className={cn('group flex items-end gap-1.5', mine ? 'flex-row-reverse' : 'flex-row', first ? 'mt-3' : 'mt-0.5')}>
      <div className={cn('relative flex max-w-[78%] flex-col sm:max-w-[65%]', mine ? 'items-end' : 'items-start')}>
        <div
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          onClick={tap}
          onContextMenu={(e) => {
            if (!canAct) return;
            e.preventDefault();
            onAction(m);
          }}
          className={cn(
            'relative select-none break-words [-webkit-touch-callout:none] sm:select-text',
            sticker
              ? 'px-1 py-0.5'
              : cn(
                  'rounded-[22px] shadow-[0_1px_1px_rgb(var(--shadow)/0.05)]',
                  visual ? 'overflow-hidden p-1' : 'px-3.5 py-2',
                  mine ? 'accent-gradient text-on-accent' : 'border border-line/70 bg-surface text-ink',
                  mine ? (first ? '' : 'rounded-tr-lg') : first ? '' : 'rounded-tl-lg',
                  mine ? (last ? 'rounded-br-md' : 'rounded-br-lg') : last ? 'rounded-bl-md' : 'rounded-bl-lg',
                  m.failed && 'opacity-70',
                ),
          )}
        >
          {m.replyTo && !m.deleted && (
            <a
              href={`#m-${m.replyTo.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`m-${m.replyTo!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className={cn('mb-1.5 block rounded-xl border-l-[3px] px-2.5 py-1.5 text-[13px]', visual && 'mx-1 mt-1', mine ? 'border-white/70 bg-white/15' : 'border-accent bg-surface-2')}
            >
              <span className="block font-semibold">{replyName(m.replyTo.senderId)}</span>
              <span className="line-clamp-2 opacity-85">{m.replyTo.preview}</span>
            </a>
          )}

          {m.deleted ? (
            <p className="italic opacity-70">
              Message deleted{meta}
            </p>
          ) : sticker ? (
            <p className="text-[64px] leading-[1.1]" aria-label={m.text}>
              {m.text}
            </p>
          ) : m.type === 'image' && m.media ? (
            <SecureImage media={m.media} onOpen={onOpenMedia} />
          ) : m.type === 'video' && m.media ? (
            <SecureVideo media={m.media} onOpen={onOpenMedia} />
          ) : m.type === 'gif' && m.gif ? (
            <img src={m.gif.url} alt="GIF" width={m.gif.width} height={m.gif.height} loading="lazy" className="max-h-64 w-auto rounded-[18px]" />
          ) : m.type === 'audio' && m.media ? (
            <VoiceNote media={m.media} mine={mine} />
          ) : null}

          {!m.deleted && !sticker && m.text && m.type !== 'sticker' && (
            <p className={cn('whitespace-pre-wrap text-[15.5px] leading-snug', visual && 'px-2.5 pb-1 pt-1.5', m.locked && 'italic opacity-75')}>
              {m.text}
              {meta}
            </p>
          )}
          {!m.deleted && !sticker && !m.text && <span className={cn('flex justify-end', visual ? 'absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-1 [&>span]:m-0 [&>span]:translate-y-0 [&>span]:text-white' : 'mt-1')}>{meta}</span>}
        </div>

        {sticker && <div className="-mt-1 px-1">{meta}</div>}

        {m.reactions.length > 0 && (
          <button
            onClick={() => onAction(m)}
            aria-label={`Reactions: ${m.reactions.map((r) => r.emoji).join(' ')}`}
            className={cn('-mt-2 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-0.5 text-sm shadow-sm', mine ? 'mr-2' : 'ml-2')}
          >
            {m.reactions.map((r) => (
              <span key={r.userId}>{r.emoji}</span>
            ))}
          </button>
        )}

        {m.failed && (
          <button onClick={() => onRetry(m)} className="mt-1 text-xs font-semibold text-danger">
            Not sent. Tap to retry
          </button>
        )}
      </div>

      {canAct && (
        <button
          onClick={() => onAction(m)}
          aria-label="Message options"
          className="mb-1 hidden size-7 shrink-0 place-items-center rounded-full text-faint opacity-0 transition hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 sm:grid"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </div>
  );
});
