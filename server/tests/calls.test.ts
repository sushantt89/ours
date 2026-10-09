import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { app, makeCouple } from './helpers';
import { attachSockets } from '../src/sockets';
import { Message, Notification } from '../src/models';

let server: http.Server;
let url: string;

beforeAll(async () => {
  server = http.createServer(app);
  attachSockets(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const open = (token: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
const next = <T>(socket: Socket, event: string, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}"`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('call signalling', () => {
  it('rings, connects, relays signals only between the two, and logs the call', async () => {
    const { one, two, coupleId } = await makeCouple();
    const other = await makeCouple('Mallory', 'Trent');
    const [alex, sam, mallory] = await Promise.all([open(one.token), open(two.token), open(other.one.token)]);
    const leaked: string[] = [];
    mallory.onAny((event) => event.startsWith('call') && leaked.push(event));

    const incoming = next<{ callId: string; kind: string; fromName: string }>(sam, 'call:incoming');
    alex.emit('call:invite', { callId: 'call-1', kind: 'video' });
    expect(await incoming).toMatchObject({ callId: 'call-1', kind: 'video', fromName: 'Alex' });

    const accepted = next(alex, 'call:accepted');
    sam.emit('call:accept', { callId: 'call-1' });
    await accepted;

    const offer = next<{ data: unknown }>(sam, 'call:signal');
    alex.emit('call:signal', { callId: 'call-1', data: { description: { type: 'offer', sdp: 'v=0' } } });
    expect((await offer).data).toEqual({ description: { type: 'offer', sdp: 'v=0' } });

    // A second call can't start while one is active.
    const busy = next<{ reason: string }>(sam, 'call:ended');
    sam.emit('call:invite', { callId: 'call-2', kind: 'audio' });
    expect((await busy).reason).toBe('busy');

    await wait(1100);
    const ended = Promise.all([next(alex, 'call:ended'), next(sam, 'call:ended')]);
    sam.emit('call:end', { callId: 'call-1' });
    await ended;
    await wait(200);
    const log = await Message.findOne({ coupleId, type: 'call' });
    expect(log?.call).toMatchObject({ kind: 'video', status: 'completed' });
    expect(log!.call!.duration).toBeGreaterThanOrEqual(1);
    expect(leaked).toEqual([]);
    for (const s of [alex, sam, mallory]) s.close();
  });

  it('records a missed call when the caller gives up, and tells the person they missed it', async () => {
    const { one, two, coupleId } = await makeCouple();
    const [alex, sam] = await Promise.all([open(one.token), open(two.token)]);
    const ringing = next(sam, 'call:incoming');
    alex.emit('call:invite', { callId: 'call-3', kind: 'audio' });
    await ringing;
    const ended = next<{ reason: string }>(sam, 'call:ended');
    alex.emit('call:end', { callId: 'call-3' });
    await ended;
    await wait(200);
    expect((await Message.findOne({ coupleId, type: 'call' }))?.call?.status).toBe('missed');
    expect(await Notification.countDocuments({ userId: two.id, type: 'call' })).toBe(1);
    alex.close();
    sam.close();
  });

  it('shows a call that is still ringing to a device that connects late', async () => {
    const { one, two } = await makeCouple();
    const alex = await open(one.token);
    alex.emit('call:invite', { callId: 'call-4', kind: 'audio' });
    await wait(200);
    const late = connect(url, { auth: { token: two.token }, transports: ['websocket'], reconnection: false });
    const incoming = await next<{ callId: string }>(late, 'call:incoming');
    expect(incoming.callId).toBe('call-4');
    const declined = next<{ reason: string }>(alex, 'call:ended');
    late.emit('call:decline', { callId: 'call-4' });
    expect((await declined).reason).toBe('declined');
    alex.close();
    late.close();
  });

  it('provides connection servers to signed-in couples only', async () => {
    const { one } = await makeCouple();
    const res = await one.get('/api/calls/ice');
    expect(res.body.iceServers[0].urls[0]).toMatch(/^stun:/);
  });
});
