import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { app, makeCouple } from './helpers';
import { attachSockets } from '../src/sockets';

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

const next = <T>(socket: Socket, event: string, match: (payload: T) => boolean = () => true, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" event`)), ms);
    const handler = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });

describe('realtime', () => {
  it('rejects sockets without a valid token', async () => {
    await expect(open('nonsense')).rejects.toThrow();
  });

  it('delivers messages, nudges and list changes to the partner instantly, and to nobody else', async () => {
    const { one, two } = await makeCouple('Alex', 'Sam');
    const other = await makeCouple('Mallory', 'Trent');
    const [sam, mallory] = await Promise.all([open(two.token), open(other.one.token)]);

    const leaked: string[] = [];
    mallory.onAny((event, payload) => {
      // Her own presence echo is expected; anything else would be a leak.
      if (!(event === 'presence' && payload?.userId === other.one.id)) leaked.push(event);
    });

    const message = next<{ text: string }>(sam, 'message:new');
    await one.post('/api/messages', { text: 'I love you ❤️' });
    expect((await message).text).toBe('I love you ❤️');

    const nudge = next<{ text: string; fromName: string }>(sam, 'nudge');
    await one.post('/api/nudges', { emoji: '😘', text: 'Kiss' });
    expect(await nudge).toMatchObject({ text: 'Kiss', fromName: 'Alex' });

    const sync = next<{ keys: string[] }>(sam, 'sync');
    await one.post('/api/lists', { name: 'Weekend' });
    expect((await sync).keys).toContain('lists');

    const typing = next<{ isTyping: boolean }>(sam, 'typing');
    const alex = await open(one.token);
    alex.emit('typing', true);
    expect((await typing).isTyping).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toEqual([]);
    for (const s of [sam, mallory, alex]) s.close();
  });

  it("shows presence only when the person's privacy settings allow it", async () => {
    const { one, two } = await makeCouple();
    const sam = await open(two.token);
    type Presence = { userId: string; online: boolean | null };
    const fromAlex = (p: Presence) => p.userId === one.id;
    const online = next<Presence>(sam, 'presence', fromAlex);
    const alex = await open(one.token);
    expect(await online).toMatchObject({ userId: one.id, online: true });
    const offline = next<Presence>(sam, 'presence', fromAlex);
    alex.close();
    expect((await offline).online).toBe(false);

    await one.patch('/api/me', { privacy: { showOnline: false } });
    const hidden = next<Presence>(sam, 'presence', fromAlex);
    const again = await open(one.token);
    expect((await hidden).online).toBeNull();
    again.close();
    sam.close();
  });
});
