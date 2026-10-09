import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { User, Couple } from '../models';
import { verify } from '../services/tokens';
import { coupleRoom, userRoom, setIO, trackConnect, trackDisconnect, setVisible } from '../services/realtime';
import { registerCallHandlers } from './calls';

interface SocketData {
  userId: string;
  coupleId: string | null;
}

/** Tells the partner about presence changes, but only what the user's privacy settings allow. */
async function announcePresence(userId: string, coupleId: string | null, online: boolean, io: Server) {
  if (!coupleId) return;
  const user = await User.findById(userId).select('privacy lastSeenAt');
  if (!user) return;
  io.to(coupleRoom(coupleId)).emit('presence', {
    userId,
    online: user.privacy?.showOnline ? online : null,
    lastSeenAt: user.privacy?.showLastSeen ? (user.lastSeenAt ?? null) : null,
  });
}

export function attachSockets(server: HttpServer) {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    maxHttpBufferSize: 1e5,
  });
  setIO(io as unknown as Server);

  // Every socket must present a valid access token; the couple room is derived server-side.
  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const userId = verify(token, 'access');
    if (!userId) return next(new Error('unauthorized'));
    const user = await User.findById(userId).select('coupleId');
    if (!user) return next(new Error('unauthorized'));
    let coupleId: string | null = null;
    if (user.coupleId) {
      const couple = await Couple.findById(user.coupleId).select('members');
      if (couple?.members.some((m) => m.equals(user._id))) coupleId = String(couple._id);
    }
    socket.data = { userId, coupleId };
    next();
  });

  io.on('connection', (socket) => {
    const { userId, coupleId } = socket.data;
    socket.join(userRoom(userId));
    if (coupleId) socket.join(coupleRoom(coupleId));

    if (trackConnect(userId, socket.id)) {
      announcePresence(userId, coupleId, true, io as unknown as Server).catch(() => undefined);
    }

    const on = socket.on.bind(socket) as (event: string, handler: (...args: unknown[]) => void) => void;

    on('visibility', (visible) => setVisible(userId, socket.id, visible === true));

    registerCallHandlers(io as unknown as Server, socket as unknown as Parameters<typeof registerCallHandlers>[1], userId, coupleId);

    on('typing', (isTyping) => {
      if (coupleId) socket.to(coupleRoom(coupleId)).emit('typing', { userId, isTyping: isTyping === true });
    });

    socket.on('disconnect', async () => {
      if (!trackDisconnect(userId, socket.id)) return;
      try {
        await User.updateOne({ _id: userId }, { lastSeenAt: new Date() });
        await announcePresence(userId, coupleId, false, io as unknown as Server);
      } catch {
        /* database going away during shutdown */
      }
    });
  });

  return io;
}
