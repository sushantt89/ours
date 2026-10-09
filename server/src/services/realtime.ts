import type { Server } from 'socket.io';

let io: Server | null = null;
const sockets = new Map<string, Set<string>>(); // userId -> socket ids
const visible = new Map<string, Set<string>>(); // userId -> socket ids with the app in the foreground

export const setIO = (server: Server) => (io = server);
export const coupleRoom = (coupleId: unknown) => `couple:${coupleId}`;
export const userRoom = (userId: unknown) => `user:${userId}`;

export function emitToCouple(coupleId: unknown, event: string, payload?: unknown) {
  io?.to(coupleRoom(coupleId)).emit(event, payload);
}
export function emitToUser(userId: unknown, event: string, payload?: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Tells both partners' apps to refetch the named resources. Powers instant sync for lists, notes, etc. */
export function sync(coupleId: unknown, ...keys: string[]) {
  emitToCouple(coupleId, 'sync', { keys });
}

export function trackConnect(userId: string, socketId: string) {
  const set = sockets.get(userId) ?? new Set();
  set.add(socketId);
  sockets.set(userId, set);
  return set.size === 1;
}

export function trackDisconnect(userId: string, socketId: string) {
  visible.get(userId)?.delete(socketId);
  const set = sockets.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) sockets.delete(userId);
  return set.size === 0;
}

export function setVisible(userId: string, socketId: string, isVisible: boolean) {
  const set = visible.get(userId) ?? new Set();
  if (isVisible) set.add(socketId);
  else set.delete(socketId);
  visible.set(userId, set);
}

export const isOnline = (userId: unknown) => sockets.has(String(userId));
export const isLooking = (userId: unknown) => (visible.get(String(userId))?.size ?? 0) > 0;
