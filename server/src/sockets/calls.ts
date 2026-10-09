import type { Server, Socket } from 'socket.io';
import { Couple, User } from '../models';
import { notify } from '../services/notify';
import { userRoom } from '../services/realtime';
import { postSystemMessage } from '../routes/messages';

/**
 * Call signalling. The server only introduces the two phones to each other and passes
 * their connection details along; the audio and video travel directly between them
 * (or through the TURN relay), never through this server.
 */

interface ActiveCall {
  callId: string;
  coupleId: string;
  callerId: string;
  calleeId: string;
  callerSocket: string;
  calleeSocket?: string;
  kind: 'audio' | 'video';
  startedAt: number;
  answeredAt?: number;
  timer?: ReturnType<typeof setTimeout>;
}

const RING_MS = 45_000;
const calls = new Map<string, ActiveCall>(); // by coupleId

type CallStatus = 'completed' | 'missed' | 'declined';

async function finish(io: Server, call: ActiveCall, status: CallStatus, reason: string) {
  if (calls.get(call.coupleId)?.callId !== call.callId) return;
  calls.delete(call.coupleId);
  clearTimeout(call.timer);
  const duration = call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0;
  for (const user of [call.callerId, call.calleeId]) io.to(userRoom(user)).emit('call:ended', { callId: call.callId, reason });
  await postSystemMessage(call.coupleId, call.callerId, [call.callerId, call.calleeId], {
    type: 'call',
    call: { kind: call.kind, status, duration },
  }).catch(() => undefined);
  if (status === 'missed') {
    const caller = await User.findById(call.callerId).select('name');
    await notify({
      userId: call.calleeId,
      coupleId: call.coupleId,
      type: 'call',
      emoji: '📞',
      title: `Missed ${call.kind === 'video' ? 'video call' : 'call'} from ${caller?.name ?? 'your partner'}`,
      url: '/chat',
    }).catch(() => undefined);
  }
}

export function registerCallHandlers(io: Server, socket: Socket, userId: string, coupleId: string | null) {
  const on = socket.on.bind(socket) as (event: string, handler: (payload: any) => void) => void;
  const valid = (call: ActiveCall | undefined, callId: unknown): call is ActiveCall => Boolean(call && call.callId === callId);

  // Opening the app (e.g. from the push notification) while it's still ringing shows the call.
  if (coupleId) {
    const ringing = calls.get(coupleId);
    if (ringing && ringing.calleeId === userId && !ringing.answeredAt) {
      void User.findById(ringing.callerId).select('name').then((caller) =>
        socket.emit('call:incoming', { callId: ringing.callId, kind: ringing.kind, fromName: caller?.name ?? 'Your partner' }),
      );
    }
  }

  on('call:invite', async (payload) => {
    if (!coupleId || typeof payload?.callId !== 'string' || payload.callId.length > 64) return;
    const kind = payload.kind === 'video' ? 'video' : 'audio';
    if (calls.has(coupleId)) return socket.emit('call:ended', { callId: payload.callId, reason: 'busy' });
    const couple = await Couple.findById(coupleId).select('members status');
    const calleeId = couple?.members.map(String).find((m) => m !== userId);
    if (!couple || !calleeId || couple.status === 'ended') return socket.emit('call:ended', { callId: payload.callId, reason: 'unavailable' });

    const call: ActiveCall = { callId: payload.callId, coupleId, callerId: userId, calleeId, callerSocket: socket.id, kind, startedAt: Date.now() };
    call.timer = setTimeout(() => void finish(io, call, 'missed', 'no-answer'), RING_MS);
    calls.set(coupleId, call);

    const caller = await User.findById(userId).select('name');
    io.to(userRoom(calleeId)).emit('call:incoming', { callId: call.callId, kind, fromName: caller?.name ?? 'Your partner' });
    await notify({
      userId: calleeId,
      coupleId,
      type: 'call',
      emoji: kind === 'video' ? '📹' : '📞',
      title: `${caller?.name ?? 'Your partner'} is calling`,
      body: 'Tap to answer',
      url: '/chat?call=1',
      transient: true,
    }).catch(() => undefined);
  });

  on('call:accept', (payload) => {
    const call = coupleId ? calls.get(coupleId) : undefined;
    if (!valid(call, payload?.callId) || call.calleeId !== userId || call.answeredAt) return;
    clearTimeout(call.timer);
    call.answeredAt = Date.now();
    call.calleeSocket = socket.id;
    io.to(call.callerSocket).emit('call:accepted', { callId: call.callId });
    // Any other open devices of the person who answered stop ringing.
    socket.to(userRoom(userId)).emit('call:ended', { callId: call.callId, reason: 'answered-elsewhere' });
  });

  on('call:decline', (payload) => {
    const call = coupleId ? calls.get(coupleId) : undefined;
    if (!valid(call, payload?.callId) || call.calleeId !== userId) return;
    void finish(io, call, 'declined', 'declined');
  });

  on('call:end', (payload) => {
    const call = coupleId ? calls.get(coupleId) : undefined;
    if (!valid(call, payload?.callId) || (call.callerId !== userId && call.calleeId !== userId)) return;
    void finish(io, call, call.answeredAt ? 'completed' : 'missed', 'hangup');
  });

  // Offers, answers and network candidates go only to the other phone in this call.
  on('call:signal', (payload) => {
    const call = coupleId ? calls.get(coupleId) : undefined;
    if (!valid(call, payload?.callId) || !call.calleeSocket) return;
    const target = socket.id === call.callerSocket ? call.calleeSocket : socket.id === call.calleeSocket ? call.callerSocket : null;
    if (!target || JSON.stringify(payload.data ?? '').length > 100_000) return;
    io.to(target).emit('call:signal', { callId: call.callId, data: payload.data });
  });

  socket.on('disconnect', () => {
    const call = coupleId ? calls.get(coupleId) : undefined;
    if (call && (call.callerSocket === socket.id || call.calleeSocket === socket.id)) {
      void finish(io, call, call.answeredAt ? 'completed' : 'missed', 'disconnected');
    }
  });
}
