import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Mic, MicOff, Phone, PhoneOff, PictureInPicture2, ScreenShare, ScreenShareOff, SwitchCamera, Video, VideoOff } from 'lucide-react';
import { formatDuration } from '@/lib/media';
import { cn } from '@/lib/cn';
import { usePartner } from '@/store/auth';
import { Avatar } from '@/components/ui';
import { canShareScreen, useCall } from './callStore';

function StreamVideo({
  stream,
  muted,
  className,
  mirrored,
  videoRef,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  mirrored?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const own = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? own;
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream, ref]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn(className, mirrored && '-scale-x-100')} />;
}

const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

/**
 * Picture-in-picture for the partner's video, so the call stays on screen over other apps.
 * Chrome can also open it by itself when you switch away (Media Session "enterpictureinpicture"),
 * and Safari via autoPictureInPicture.
 */
function usePictureInPicture(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = videoRef.current;
    if (!enabled || !el) return;
    (el as HTMLVideoElement & { autoPictureInPicture?: boolean }).autoPictureInPicture = true;
    const onEnter = () => setActive(true);
    const onLeave = () => setActive(false);
    el.addEventListener('enterpictureinpicture', onEnter);
    el.addEventListener('leavepictureinpicture', onLeave);
    const session = navigator.mediaSession as MediaSession | undefined;
    try {
      session?.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => void el.requestPictureInPicture().catch(() => undefined));
    } catch {
      /* this browser can't open picture-in-picture by itself */
    }
    return () => {
      el.removeEventListener('enterpictureinpicture', onEnter);
      el.removeEventListener('leavepictureinpicture', onLeave);
      try {
        session?.setActionHandler('enterpictureinpicture' as MediaSessionAction, null);
      } catch {
        /* not supported */
      }
    };
  });
  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    else void el.requestPictureInPicture().catch(() => undefined);
  };
  return { supported: pipSupported && enabled, active, toggle };
}

function Timer({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{since ? formatDuration((Date.now() - since) / 1000) : ''}</>;
}

function Round({ label, onClick, danger, active, children, big }: { label: string; onClick: () => void; danger?: boolean; active?: boolean; children: React.ReactNode; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'grid place-items-center rounded-full transition active:scale-90',
        big ? 'size-16' : 'size-14',
        danger ? 'bg-red-500 text-white hover:bg-red-600' : active ? 'bg-white text-black' : 'bg-white/15 text-white backdrop-blur hover:bg-white/25',
      )}
    >
      {children}
    </button>
  );
}

/** Full-screen call UI: ringing, outgoing, and the call itself. */
export function CallOverlay() {
  const partner = usePartner();
  const call = useCall();
  const visible = call.state !== 'idle';
  const video = call.kind === 'video';
  const remoteHasVideo = Boolean(call.remote?.getVideoTracks().some((t) => t.readyState === 'live'));
  const name = call.state === 'incoming' ? call.incomingFrom : (partner?.name ?? 'Your partner');
  const remoteVideo = useRef<HTMLVideoElement>(null);
  // A voice call shows video only while your partner shares their screen.
  const showingRemote = (video || call.remoteSharing) && Boolean(call.remote) && remoteHasVideo && call.state === 'active';
  const screenOk = canShareScreen();
  const pip = usePictureInPicture(remoteVideo, showingRemote);
  const canMinimize = call.state === 'outgoing' || call.state === 'connecting' || call.state === 'active';
  const mini = visible && call.minimized && canMinimize;

  const status =
    call.state === 'incoming'
      ? `${video ? 'Video call' : 'Calling'}…`
      : call.state === 'outgoing'
        ? 'Ringing…'
        : call.state === 'connecting'
          ? 'Connecting…'
          : call.state === 'ended'
            ? call.endedReason
            : null;

  return createPortal(
    <AnimatePresence>
      {mini && <MiniCall key="mini" name={name} avatar={partner?.avatarUrl} remoteVideo={remoteVideo} showingRemote={showingRemote} pip={pip} />}
      {visible && !mini && !(call.minimized && call.state === 'ended') && (
        <motion.div
          key="full"
          role="dialog"
          aria-modal="true"
          aria-label={`Call with ${name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[75] flex flex-col overflow-hidden bg-[#140d12] text-white"
        >
          {/* Remote video fills the screen once connected */}
          {showingRemote ? (
            <StreamVideo
              stream={call.remote}
              videoRef={remoteVideo}
              // A shared screen is shown whole (letterboxed), never cropped like a face.
              className={cn('absolute inset-0 size-full', call.remoteSharing ? 'bg-black object-contain' : 'object-cover')}
            />
          ) : (
            <>
              <div className="absolute inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_50%_0%,var(--accent),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,var(--accent-2),transparent_60%)]" />
              {/* Still play their audio while the picture isn't showing */}
              {call.remote && <StreamVideo stream={call.remote} className="pointer-events-none absolute size-px opacity-0" />}
            </>
          )}
          {/* Your own camera: the whole screen while ringing, a small corner window once connected */}
          {video && call.local && !call.cameraOff && !call.sharingScreen && (
            <StreamVideo
              stream={call.local}
              muted
              mirrored={call.facing === 'user'}
              className={cn(
                'object-cover transition-all duration-500',
                call.state === 'active' && remoteHasVideo
                  ? 'absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 aspect-[3/4] w-28 rounded-2xl border-2 border-white/30 shadow-2xl sm:w-40'
                  : 'absolute inset-0 size-full opacity-40',
              )}
            />
          )}

          {canMinimize && (
            <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 flex gap-2">
              <button
                onClick={() => call.setMinimized(true)}
                aria-label="Minimise call"
                title="Minimise: keep talking while you use the app"
                className="grid size-11 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/45 active:scale-90"
              >
                <ChevronDown className="size-6" />
              </button>
              {pip.supported && (
                <button
                  onClick={pip.toggle}
                  aria-label={pip.active ? 'Close floating video' : 'Float video over other apps'}
                  title="Float the video over other apps"
                  aria-pressed={pip.active}
                  className="grid size-11 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/45 active:scale-90"
                >
                  <PictureInPicture2 className="size-5" />
                </button>
              )}
            </div>
          )}

          <div className="relative z-[5] flex flex-1 flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+5rem)] text-center">
            {!showingRemote && (
              <>
                <motion.div animate={call.state === 'incoming' || call.state === 'outgoing' ? { scale: [1, 1.06, 1] } : {}} transition={{ repeat: Infinity, duration: 1.6 }}>
                  <Avatar name={name} src={partner?.avatarUrl} size="xl" className="rounded-full ring-4 ring-white/20" />
                </motion.div>
                <p className="mt-5 font-display text-3xl">{name}</p>
              </>
            )}
            <p className="mt-2 text-white/80" aria-live="polite">
              {call.state === 'active' ? <Timer since={call.startedAt} /> : status}
            </p>
          </div>

          {call.state === 'active' && (call.sharingScreen || call.remoteSharing) && (
            <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+8rem)] z-20 flex justify-center px-4 sm:bottom-auto sm:top-[calc(env(safe-area-inset-top)+0.9rem)] sm:px-28">
              <span className="flex items-center gap-2 whitespace-nowrap rounded-full bg-black/55 px-3.5 py-1.5 text-sm font-medium backdrop-blur">
                <ScreenShare className="size-4" />
                {call.sharingScreen ? (
                  <>
                    You're sharing your screen
                    <button onClick={() => void call.stopScreen()} className="ml-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-semibold hover:bg-red-600">
                      Stop
                    </button>
                  </>
                ) : (
                  `${name} is sharing their screen`
                )}
              </span>
            </div>
          )}

          <div className="safe-bottom relative z-10 pb-10">
            {call.state === 'incoming' ? (
              <div className="flex items-center justify-center gap-16">
                <div className="flex flex-col items-center gap-2">
                  <Round big danger label="Decline" onClick={call.decline}>
                    <PhoneOff className="size-7" />
                  </Round>
                  <span className="text-sm text-white/80">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button aria-label="Answer" onClick={() => void call.accept()} className="grid size-16 animate-bounce place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600 active:scale-90">
                    {video ? <Video className="size-7" /> : <Phone className="size-7" />}
                  </button>
                  <span className="text-sm text-white/80">Answer</span>
                </div>
              </div>
            ) : call.state === 'ended' ? null : (
              <div className="flex items-center justify-center gap-4">
                <Round label={call.muted ? 'Unmute' : 'Mute'} active={call.muted} onClick={call.toggleMute}>
                  {call.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
                </Round>
                {video && (
                  <>
                    <Round label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'} active={call.cameraOff} onClick={call.toggleCamera}>
                      {call.cameraOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
                    </Round>
                    <Round label="Switch camera" onClick={() => void call.flipCamera()}>
                      <SwitchCamera className="size-6" />
                    </Round>
                  </>
                )}
                {screenOk && call.state === 'active' && (
                  <Round
                    label={call.sharingScreen ? 'Stop sharing your screen' : 'Share your screen'}
                    active={call.sharingScreen}
                    onClick={() => void (call.sharingScreen ? call.stopScreen() : call.shareScreen())}
                  >
                    {call.sharingScreen ? <ScreenShareOff className="size-6" /> : <ScreenShare className="size-6" />}
                  </Round>
                )}
                <Round big danger label={call.state === 'outgoing' ? 'Cancel call' : 'End call'} onClick={call.hangUp}>
                  <PhoneOff className="size-7" />
                </Round>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The call shrunk to a small window you can drag around while using the rest of the app. */
function MiniCall({
  name,
  avatar,
  remoteVideo,
  showingRemote,
  pip,
}: {
  name: string;
  avatar?: string | null;
  remoteVideo: RefObject<HTMLVideoElement | null>;
  showingRemote: boolean;
  pip: { supported: boolean; active: boolean; toggle: () => void };
}) {
  const call = useCall();
  const bounds = useRef<HTMLDivElement>(null);
  // Letting go after a drag shouldn't count as a tap that reopens the call.
  const dragged = useRef(false);
  const expand = () => {
    if (dragged.current) return;
    call.setMinimized(false);
  };
  const status = call.state === 'active' ? <Timer since={call.startedAt} /> : call.state === 'outgoing' ? 'Ringing…' : 'Connecting…';

  const small = (label: string, onClick: () => void, children: React.ReactNode, danger?: boolean, active?: boolean) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDownCapture={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full transition active:scale-90',
        danger ? 'bg-red-500 text-white' : active ? 'bg-white text-black' : 'bg-white/15 text-white',
      )}
    >
      {children}
    </button>
  );

  return (
    <div ref={bounds} className="pointer-events-none fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[75] lg:bottom-4">
      <motion.div
        drag
        dragConstraints={bounds}
        dragMomentum={false}
        dragElastic={0.1}
        onPointerDown={() => (dragged.current = false)}
        onDragStart={() => (dragged.current = true)}
        onTap={expand}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.6 }}
        role="button"
        tabIndex={0}
        aria-label={`Call with ${name}. Tap to open.`}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && expand()}
        className="pointer-events-auto absolute bottom-0 right-0 cursor-grab touch-none select-none overflow-hidden rounded-3xl bg-[#140d12] text-white shadow-2xl ring-1 ring-white/15 active:cursor-grabbing"
      >
        {showingRemote ? (
          <div className="relative h-48 w-36">
            <StreamVideo stream={call.remote} videoRef={remoteVideo} className="size-full object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur">{status}</span>
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
              {small(call.muted ? 'Unmute' : 'Mute', call.toggleMute, call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />, false, call.muted)}
              {pip.supported && small('Float over other apps', pip.toggle, <PictureInPicture2 className="size-4" />, false, pip.active)}
              {small('End call', call.hangUp, <PhoneOff className="size-4" />, true)}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 py-2 pl-2 pr-2.5">
            {/* Keeps their voice playing while the call is small */}
            {call.remote && <StreamVideo stream={call.remote} className="pointer-events-none absolute size-px opacity-0" />}
            <span className="relative">
              <Avatar name={name} src={avatar} size="sm" />
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#140d12] bg-emerald-500" />
            </span>
            <span className="min-w-0 pr-1">
              <span className="block max-w-28 truncate text-sm font-semibold leading-tight">{name}</span>
              <span className="block text-xs tabular-nums text-white/70">{status}</span>
            </span>
            {small(call.muted ? 'Unmute' : 'Mute', call.toggleMute, call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />, false, call.muted)}
            {small('End call', call.hangUp, <PhoneOff className="size-4" />, true)}
          </div>
        )}
      </motion.div>
    </div>
  );
}
