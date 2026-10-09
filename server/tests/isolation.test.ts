import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, makeCouple, signUp, PNG } from './helpers';

/**
 * The most important guarantee in the app: nobody outside a couple can read or
 * change anything inside it, even with a valid account and the exact record ids.
 */
describe('couple-level data isolation', () => {
  async function seed() {
    const a = await makeCouple('Alex', 'Sam');
    const b = await makeCouple('Mallory', 'Trent');
    const { one } = a;

    const message = (await one.post('/api/messages', { text: 'our secret' })).body.message;
    const note = (await one.post('/api/notes', { body: 'for your eyes only', title: 'Hi' })).body.note;
    const memoryRes = await request(app)
      .post('/api/memories')
      .set('Authorization', `Bearer ${one.token}`)
      .field('caption', 'beach day')
      .attach('files', PNG, 'photo.png');
    const memory = memoryRes.body.memories[0];
    const event = (await one.post('/api/events', { title: 'Date night', date: '2030-01-01' })).body;
    const list = (await one.post('/api/lists', { name: 'Private list' })).body.list;
    const withItem = (await one.post(`/api/lists/${list.id}/items`, { text: 'ring' })).body.list;
    const bucket = (await one.post('/api/bucket', { title: 'Japan' })).body.items[0];
    const countdown = (await one.post('/api/countdowns', { title: 'Trip', date: '2030-01-01' })).body;
    const date = (await one.post('/api/dates', { title: 'Secret picnic' })).body.idea;
    const album = (await one.post('/api/albums', { name: 'Private album' })).body.album;

    return { a, b, ids: { message, note, memory, event, list: withItem, bucket, countdown, date, album } };
  }

  it("never lists another couple's data", async () => {
    const { b } = await seed();
    const outsider = b.one;
    const checks: [string, (body: any) => unknown[]][] = [
      ['/api/messages', (x) => x.messages],
      ['/api/notes', (x) => x.notes],
      ['/api/memories', (x) => x.memories],
      ['/api/bucket', (x) => x.items],
      ['/api/countdowns', (x) => x.countdowns],
      ['/api/dates', (x) => x.ideas],
      ['/api/nudges', (x) => x.recent],
    ];
    for (const [url, pick] of checks) {
      const res = await outsider.get(url);
      expect(res.status, url).toBe(200);
      expect(pick(res.body), url).toHaveLength(0);
    }
    const lists = (await outsider.get('/api/lists')).body.lists;
    expect(lists.map((l: any) => l.name)).not.toContain('Private list');
    const albums = (await outsider.get('/api/albums')).body.albums;
    expect(albums.map((l: any) => l.name)).not.toContain('Private album');
    const events = (await outsider.get('/api/events')).body.events;
    expect(events.map((e: any) => e.title)).not.toContain('Date night');
    expect(JSON.stringify((await outsider.get('/api/dashboard')).body)).not.toContain('our secret');
    expect((await outsider.get('/api/messages?q=secret')).body.messages).toHaveLength(0);
  });

  it("refuses to read, change or delete another couple's records by id", async () => {
    const { b, ids } = await seed();
    const outsider = b.one;
    const attempts = [
      outsider.patch(`/api/messages/${ids.message.id}`, { text: 'hacked' }),
      outsider.del(`/api/messages/${ids.message.id}`),
      outsider.post(`/api/messages/${ids.message.id}/react`, { emoji: '❤️' }),
      outsider.post(`/api/messages/${ids.message.id}/pin`, { pinned: true }),
      outsider.patch(`/api/notes/${ids.note.id}`, { body: 'hacked' }),
      outsider.post(`/api/notes/${ids.note.id}/open`),
      outsider.del(`/api/notes/${ids.note.id}`),
      outsider.patch(`/api/memories/${ids.memory.id}`, { caption: 'hacked' }),
      outsider.post(`/api/memories/${ids.memory.id}/comments`, { text: 'hi' }),
      outsider.del(`/api/memories/${ids.memory.id}`),
      outsider.patch(`/api/events/${ids.event.id}`, { title: 'hacked' }),
      outsider.del(`/api/events/${ids.event.id}`),
      outsider.patch(`/api/lists/${ids.list.id}`, { name: 'hacked' }),
      outsider.post(`/api/lists/${ids.list.id}/items`, { text: 'hacked' }),
      outsider.patch(`/api/lists/${ids.list.id}/items/${ids.list.items[0].id}`, { done: true }),
      outsider.del(`/api/lists/${ids.list.id}`),
      outsider.patch(`/api/bucket/${ids.bucket.id}`, { done: true }),
      outsider.del(`/api/bucket/${ids.bucket.id}`),
      outsider.patch(`/api/countdowns/${ids.countdown.id}`, { title: 'hacked' }),
      outsider.del(`/api/countdowns/${ids.countdown.id}`),
      outsider.patch(`/api/dates/${ids.date.id}`, { title: 'hacked' }),
      outsider.del(`/api/dates/${ids.date.id}`),
      outsider.patch(`/api/albums/${ids.album.id}`, { name: 'hacked' }),
      outsider.del(`/api/albums/${ids.album.id}`),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status, `${res.request.method} ${res.request.url}`).toBe(404);
    }
  });

  it("serves private media only to the couple's two members", async () => {
    const { a, b, ids } = await seed();
    const url = ids.memory.media.url as string;

    expect((await a.one.get(url)).status).toBe(200);
    expect((await a.two.get(url)).status).toBe(200);
    expect((await b.one.get(url)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
    const solo = await signUp('Solo');
    expect((await solo.get(url)).status).toBe(404);

    // The media cookie works for <img> tags, but only for the right couple.
    const ownCookie = a.one.cookies.find((c) => c.startsWith('ours_media='))!;
    const otherCookie = b.one.cookies.find((c) => c.startsWith('ours_media='))!;
    expect((await request(app).get(url).set('Cookie', ownCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', otherCookie)).status).toBe(404);
    // …and that cookie cannot be used as a login for anything else.
    expect((await request(app).get('/api/messages').set('Cookie', ownCookie)).status).toBe(401);
  });

  it("cannot attach another couple's media to its own content", async () => {
    const { b, ids } = await seed();
    const res = await b.one.post('/api/notes', { body: 'x', mediaIds: [ids.memory.media.id] });
    expect(res.status).toBe(400);
    const reply = await b.one.post('/api/messages', { text: 'x', replyTo: ids.message.id });
    expect(reply.status).toBe(400);
  });

  it("does not leak another couple's data in exports", async () => {
    const { b } = await seed();
    const cookie = b.one.cookies.find((c) => c.startsWith('ours_media='))!;
    const res = await request(app).get('/api/data/export.json').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('our secret');
    expect(res.text).not.toContain('Secret picnic');
  });
});
