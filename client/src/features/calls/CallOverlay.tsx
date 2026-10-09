import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from 'lucide-react';
import { formatDuration } from '@/lib/media';
import { cn } from '@/lib/cn';
import { usePartner } from '@/store/auth';
import { Avatar } from '@/components/ui';
import { useCall } from './callStore';

function StreamVideo({ stream, muted, className, mirrored }: { stream: MediaStream | null; muted?: boolean; className?: string; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn(className, mirrored && '-scale-x-100')} />;
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
      {visible && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Call with ${name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[75] flex flex-col overflow-hidden bg-[#140d12] text-white"
        >
          {/* Remote video fills the screen once connected */}
          {video && call.remote && remoteHasVideo && call.state === 'active' ? (
            <StreamVideo stream={call.remote} className="absolute inset-0 size-full object-cover" />
          ) : (
            <>
              <div className="absolute inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_50%_0%,var(--accent),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,var(--accent-2),transparent_60%)]" />
              {/* Still play their audio while the picture isn't showing */}
              {call.remote && <StreamVideo stream={call.remote} className="pointer-events-none absolute size-px opacity-0" />}
            </>
          )}
          {/* Your own camera: the whole screen while ringing, a small corner window once connected */}
          {video && call.local && !call.cameraOff && (
            <StreamVideo
              stream={call.local}
              muted
              mirrored={call.facing === 'user'}
              className={cn(
                'object-cover transition-all duration-500',
                call.state === 'active' && remoteHasVideo
                  ? 'safe-top absolute right-4 top-4 z-10 aspect-[3/4] w-28 rounded-2xl border-2 border-white/30 shadow-2xl sm:w-40'
                  : 'absolute inset-0 size-full opacity-40',
              )}
            />
          )}

          <div className="safe-top relative z-[5] flex flex-1 flex-col items-center px-6 pt-20 text-center">
            {!(video && remoteHasVideo && call.state === 'active') && (
              <>
                <motion.div animate={call.state === 'incoming' || call.state === 'outgoing' ? { scale: [1, 1.06, 1] } : {}} transition={{ repeat: Infinity, duration: 1.6 }}>
                  <Avatar name={name} src={partner?.avatarUrl} size="xl" className="ring-4 ring-white/20" />
                </motion.div>
                <p className="mt-5 font-display text-3xl">{name}</p>
              </>
            )}
            <p className="mt-2 text-white/80" aria-live="polite">
              {call.state === 'active' ? <Timer since={call.startedAt} /> : status}
            </p>
          </div>

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
