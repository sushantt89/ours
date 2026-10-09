import { create } from 'zustand';
import { get } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { toast } from '@/store/ui';

/**
 * Voice and video calls between the two of you, over WebRTC.
 *
 * The server only rings the other phone and passes connection details along; the audio
 * and video go directly between the two devices (or via a TURN relay when a direct route
 * isn't possible). Media is always encrypted in transit by WebRTC itself (DTLS-SRTP).
 */

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';
type Kind = 'audio' | 'video';

interface CallStore {
  state: CallState;
  callId: string | null;
  kind: Kind;
  incomingFrom: string;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  facing: 'user' | 'environment';
  startedAt: number | null;
  endedReason: string | null;
  start: (kind: Kind) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
  // socket events
  onIncoming: (p: { callId: string; kind: Kind; fromName: string }) => void;
  onAccepted: (p: { callId: string }) => Promise<void>;
  onSignal: (p: { callId: string; data: SignalData }) => Promise<void>;
  onEnded: (p: { callId: string; reason: string }) => void;
}

interface SignalData {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

let pc: RTCPeerConnection | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];
let iceCache: { servers: RTCIceServer[]; at: number } | null = null;
let ring: { stop: () => void } | null = null;
let failTimer: ReturnType<typeof setTimeout> | undefined;

async function iceServers() {
  if (iceCache && Date.now() - iceCache.at < 30 * 60_000) return iceCache.servers;
  const { iceServers } = await get<{ iceServers: RTCIceServer[] }>('/calls/ice');
  iceCache = { servers: iceServers, at: Date.now() };
  return iceServers;
}

/** A soft two-tone ring made with the Web Audio API, so there's no sound file to load. */
function playTone(kind: 'ring' | 'ringback') {
  try {
    const ctx = new AudioContext();
    let stopped = false;
    const beep = () => {
      if (stopped) return;
      const notes = kind === 'ring' ? [660, 880] : [440];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
        gain.gain.linearRampToValueAtTime(kind === 'ring' ? 0.18 : 0.08, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.18 + (kind === 'ring' ? 0.16 : 0.9));
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 1);
      });
      if (kind === 'ring') navigator.vibrate?.([300, 200, 300]);
    };
    beep();
    const timer = setInterval(beep, kind === 'ring' ? 1600 : 3000);
    return {
      stop: () => {
        stopped = true;
        clearInterval(timer);
        void ctx.close();
      },
    };
  } catch {
    return { stop: () => undefined };
  }
}

function stopRing() {
  ring?.stop();
  ring = null;
}

async function getMedia(kind: Kind, facing: 'user' | 'environment' = 'user') {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: kind === 'video' ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

const emit = (event: string, payload: object) => getSocket()?.emit(event, payload);

export const useCall = create<CallStore>((set, getState) => {
  function cleanup(reason: string | null) {
    stopRing();
    clearTimeout(failTimer);
    pc?.close();
    pc = null;
    pendingCandidates = [];
    getState().local?.getTracks().forEach((t) => t.stop());
    set({ state: reason ? 'ended' : 'idle', endedReason: reason, local: null, remote: null, muted: false, cameraOff: false });
    if (reason) setTimeout(() => getState().state === 'ended' && set({ state: 'idle', callId: null, startedAt: null, endedReason: null }), 1800);
  }

  async function connect(callId: string) {
    const peer = new RTCPeerConnection({ iceServers: await iceServers() });
    pc = peer;
    getState().local?.getTracks().forEach((track) => peer.addTrack(track, getState().local!));
    const remote = new MediaStream();
    set({ remote });
    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => remote.getTrackById(t.id) || remote.addTrack(t));
      set({ remote: new MediaStream(remote.getTracks()) });
    };
    peer.onicecandidate = (event) => event.candidate && emit('call:signal', { callId, data: { candidate: event.candidate.toJSON() } });
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        clearTimeout(failTimer);
        set({ state: 'active', startedAt: getState().startedAt ?? Date.now() });
      }
      if (peer.connectionState === 'failed') {
        toast.error("The call couldn't connect. One of your networks may be blocking direct calls.");
        emit('call:end', { callId });
        cleanup('Connection failed');
      }
    };
    // If nothing connects within 25 seconds, give up rather than hang forever.
    failTimer = setTimeout(() => {
      if (getState().state === 'connecting') {
        toast.error("The call couldn't connect. One of your networks may be blocking direct calls.");
        emit('call:end', { callId });
        cleanup('Connection failed');
      }
    }, 25_000);
    return peer;
  }

  return {
    state: 'idle',
    callId: null,
    kind: 'audio',
    incomingFrom: '',
    local: null,
    remote: null,
    muted: false,
    cameraOff: false,
    facing: 'user',
    startedAt: null,
    endedReason: null,

    async start(kind) {
      if (getState().state !== 'idle') return;
      if (!navigator.mediaDevices?.getUserMedia) {
        return toast.error(window.isSecureContext ? "This browser can't make calls" : 'Calls only work over a secure connection (https://).');
      }
      const callId = crypto.randomUUID();
      set({ state: 'outgoing', callId, kind, startedAt: null, endedReason: null });
      try {
        set({ local: await getMedia(kind) });
      } catch {
        cleanup(null);
        return toast.error(kind === 'video' ? 'Camera and microphone access is needed for video calls' : 'Microphone access is needed for calls');
      }
      if (getState().callId !== callId) return; // cancelled while asking for permission
      ring = playTone('ringback');
      emit('call:invite', { callId, kind });
    },

    async accept() {
      const { callId, kind } = getState();
      if (!callId || getState().state !== 'incoming') return;
      stopRing();
      set({ state: 'connecting' });
      try {
        set({ local: await getMedia(kind) });
      } catch {
        toast.error('Microphone access is needed to answer');
        emit('call:decline', { callId });
        return cleanup(null);
      }
      await connect(callId);
      emit('call:accept', { callId });
    },

    decline() {
      const { callId } = getState();
      if (callId) emit('call:decline', { callId });
      cleanup(null);
    },

    hangUp() {
      const { callId } = getState();
      if (callId) emit('call:end', { callId });
      cleanup('Call ended');
    },

    toggleMute() {
      const muted = !getState().muted;
      getState().local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
      set({ muted });
    },

    toggleCamera() {
      const cameraOff = !getState().cameraOff;
      getState().local?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
      set({ cameraOff });
    },

    async flipCamera() {
      const facing = getState().facing === 'user' ? 'environment' : 'user';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const track = stream.getVideoTracks()[0];
        const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
        await sender?.replaceTrack(track);
        const local = getState().local;
        local?.getVideoTracks().forEach((t) => {
          t.stop();
          local.removeTrack(t);
        });
        local?.addTrack(track);
        set({ facing, local: local ? new MediaStream(local.getTracks()) : null });
      } catch {
        toast.error("Couldn't switch camera");
      }
    },

    onIncoming({ callId, kind, fromName }) {
      if (getState().state !== 'idle') return; // already on a call
      set({ state: 'incoming', callId, kind, incomingFrom: fromName, startedAt: null, endedReason: null });
      ring = playTone('ring');
    },

    async onAccepted({ callId }) {
      if (getState().callId !== callId) return;
      stopRing();
      set({ state: 'connecting' });
      const peer = await connect(callId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      emit('call:signal', { callId, data: { description: peer.localDescription!.toJSON() } });
    },

    async onSignal({ callId, data }) {
      if (getState().callId !== callId || !pc) return;
      try {
        if (data.description) {
          await pc.setRemoteDescription(data.description);
          for (const c of pendingCandidates) await pc.addIceCandidate(c);
          pendingCandidates = [];
          if (data.description.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            emit('call:signal', { callId, data: { description: pc.localDescription!.toJSON() } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
          else pendingCandidates.push(data.candidate);
        }
      } catch (err) {
        console.warn('[call] signalling error', err);
      }
    },

    onEnded({ callId, reason }) {
      if (getState().callId !== callId) return;
      const labels: Record<string, string> = {
        declined: 'Call declined',
        busy: 'They are on another call',
        'no-answer': 'No answer',
        unavailable: "Can't call right now",
        'answered-elsewhere': '',
        hangup: 'Call ended',
        disconnected: 'Call ended',
      };
      cleanup(labels[reason] === '' ? null : (labels[reason] ?? 'Call ended'));
    },
  };
});
