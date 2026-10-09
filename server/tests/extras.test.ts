import { describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { app, makeCouple, PNG } from './helpers';
import { DailyQuestion, Notification, Nudge } from '../src/models';
import { parseSongUrl } from '../src/routes/extras';
import { deliverScheduledNudges } from '../src/services/scheduler';
import { todayIn, addDays } from '../src/utils/dates';

describe('song of the day', () => {
  it('recognises music links', () => {
    expect(parseSongUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x')).toMatchObject({ provider: 'spotify', embedId: 'track/4uLU6hMCjMI75M1A2tKUQC' });
    expect(parseSongUrl('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ provider: 'youtube', embedId: 'dQw4w9WgXcQ' });
    expect(parseSongUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toMatchObject({ provider: 'youtube', embedId: 'dQw4w9WgXcQ' });
    expect(parseSongUrl('https://example.com/song')).toMatchObject({ provider: 'link' });
    expect(() => parseSongUrl('javascript:alert(1)')).toThrow();
  });

  it('keeps one song per person per day and shows it to the partner', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/songs', { url: 'https://youtu.be/dQw4w9WgXcQ', note: 'This one is us' });
    await one.post('/api/songs', { url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', note: 'Actually this' });
    const seen = (await two.get('/api/songs')).body;
    expect(seen.partner).toMatchObject({ provider: 'spotify', note: 'Actually this' });
    expect(seen.mine).toBeNull();
    expect(seen.history).toHaveLength(1);
    expect((await two.get('/api/dashboard')).body.songs.partner.note).toBe('Actually this');
    expect(await Notification.countDocuments({ userId: two.id, type: 'song' })).toBe(1);
    expect((await one.post('/api/songs', { url: 'not a link' })).status).toBe(400);
  });
});

describe('little things and love languages', () => {
  it('keeps the notebook private to its author', async () => {
    const { one, two } = await makeCouple();
    const item = (await one.post('/api/little-things', { text: 'Oat latte, no sugar', category: 'drinks' })).body.item;
    expect((await one.get('/api/little-things?q=latte')).body.items).toHaveLength(1);
    expect((await two.get('/api/little-things')).body.items).toHaveLength(0);
    expect((await two.patch(`/api/little-things/${item.id}`, { text: 'hacked' })).status).toBe(404);
    expect((await two.del(`/api/little-things/${item.id}`)).status).toBe(404);
  });

  it('shares love languages with the partner', async () => {
    const { one, two } = await makeCouple();
    await one.patch('/api/me', { loveLanguages: ['time', 'words', 'time'] });
    expect((await two.get('/api/me')).body.partner.loveLanguages).toEqual(['time', 'words']);
  });
});

describe('gifts', () => {
  it('hides gift ideas from the partner and keeps claims secret from the wisher', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/gifts', { kind: 'idea', title: 'Pottery class for Sam' });
    const wish = (await two.post('/api/gifts', { kind: 'wish', title: 'Film camera', price: '$150' })).body.items.find((i: any) => i.kind === 'wish');

    // Sam never sees Alex's secret idea.
    const samView = (await two.get('/api/gifts')).body.items;
    expect(samView.map((i: any) => i.title)).toEqual(['Film camera']);
    expect(JSON.stringify(samView)).not.toContain('Pottery');

    // Alex secretly claims Sam's wish.
    const claimed = (await one.post(`/api/gifts/${wish.id}/claim`, { claimed: true, status: 'bought' })).body.items.find((i: any) => i.id === wish.id);
    expect(claimed).toMatchObject({ claimedByMe: true, status: 'bought' });

    // Sam's own view gives nothing away.
    const own = (await two.get('/api/gifts')).body.items.find((i: any) => i.id === wish.id);
    expect(own).toMatchObject({ mine: true, claimed: false, claimedByMe: false, status: 'open' });

    // Rules: no claiming your own wish, no editing your partner's wishlist, ideas look non-existent.
    expect((await two.post(`/api/gifts/${wish.id}/claim`, { claimed: true })).status).toBe(404);
    expect((await one.patch(`/api/gifts/${wish.id}`, { title: 'x' })).status).toBe(403);
    const idea = (await one.get('/api/gifts')).body.items.find((i: any) => i.kind === 'idea');
    expect((await two.patch(`/api/gifts/${idea.id}`, { title: 'x' })).status).toBe(404);
    expect((await two.del(`/api/gifts/${idea.id}`)).status).toBe(404);
  });
});

describe('watchlist and journal', () => {
  it('tracks what you watched and how you each rated it', async () => {
    const { one, two } = await makeCouple();
    const item = (await one.post('/api/watchlist', { title: 'Past Lives', kind: 'movie', year: 2023 })).body.item;
    await two.patch(`/api/watchlist/${item.id}`, { status: 'watched' });
    await one.post(`/api/watchlist/${item.id}/rate`, { stars: 5 });
    const after = (await two.post(`/api/watchlist/${item.id}/rate`, { stars: 4 })).body.item;
    expect(after.status).toBe('watched');
    expect(after.watchedAt).toBe(todayIn('Australia/Adelaide'));
    expect(after.ratings).toHaveLength(2);
  });

  it('gives each partner their own part of the same page', async () => {
    const { one, two } = await makeCouple();
    const today = todayIn('Australia/Adelaide');
    const put = (who: typeof one, body: object, date = today) =>
      request(app).put(`/api/journal/${date}`).set('Authorization', `Bearer ${who.token}`).send(body);
    expect((await put(one, { text: 'Picnic in the park', mood: '🥰' })).status).toBe(200);
    expect((await put(two, { text: 'Best sandwich ever' })).status).toBe(200);
    expect((await put(one, { text: 'Picnic in the park, then rain' })).status).toBe(200);
    const days = (await two.get('/api/journal')).body.days;
    expect(days).toHaveLength(1);
    expect(days[0].parts.map((p: any) => p.text).sort()).toEqual(['Best sandwich ever', 'Picnic in the park, then rain']);
    expect((await put(one, { text: 'tomorrow' }, addDays(today, 2))).status).toBe(400);
    await one.del(`/api/journal/${today}`);
    expect((await two.get('/api/journal')).body.days[0].parts).toHaveLength(1);
  });
});

describe('games', () => {
  it("keeps each person's picks hidden until both have played, then scores the round", async () => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: 'this_or_that' })).body.game;
    expect(game.prompts).toHaveLength(10);
    const picks = Array(10).fill(0);
    await one.post(`/api/games/${game.id}/answer`, { picks });
    const waiting = (await two.get('/api/games')).body.games[0];
    expect(waiting).toMatchObject({ partnerAnswered: true, partnerPicks: null, status: 'open' });
    const done = (await two.post(`/api/games/${game.id}/answer`, { picks: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1] })).body.game;
    expect(done).toMatchObject({ status: 'done', score: 5, total: 10 });
    expect((await one.post(`/api/games/${game.id}/answer`, { picks })).status).toBe(400);
  });

  it('scores "who is more likely" by agreement on the person, not the word', async () => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: 'most_likely' })).body.game;
    await one.post(`/api/games/${game.id}/answer`, { picks: Array(10).fill(0) }); // "me" every time
    const done = (await two.post(`/api/games/${game.id}/answer`, { picks: Array(10).fill(1) })).body.game; // "you" = Alex
    expect(done.score).toBe(10);
  });

  it('builds a "know me" quiz from daily answers and hides the real answers from the guesser', async () => {
    const { one, two, coupleId } = await makeCouple();
    expect((await one.post('/api/games', { game: 'know_me' })).status).toBe(400);
    for (let i = 0; i < 5; i++) {
      await DailyQuestion.create({ coupleId, date: `2026-01-0${i + 1}`, question: `Question ${i}?`, answers: [{ userId: one.id, text: `Answer ${i}` }] });
    }
    const game = (await one.post('/api/games', { game: 'know_me' })).body.game;
    expect(game.prompts[0].correct).not.toBeNull(); // the subject knows their own answers
    expect((await one.post(`/api/games/${game.id}/answer`, { picks: game.prompts.map(() => 0) })).status).toBe(400);

    const guesser = (await two.get('/api/games')).body.games[0];
    expect(guesser.prompts.every((p: any) => p.correct === null)).toBe(true);
    const correct = game.prompts.map((p: any) => p.correct);
    const done = (await two.post(`/api/games/${game.id}/answer`, { picks: correct })).body.game;
    expect(done).toMatchObject({ status: 'done', score: correct.length });
  });
});

describe('long-distance mode and scheduled nudges', () => {
  it("shares each person's time zone and the next reunion date", async () => {
    const { one, two } = await makeCouple();
    await two.patch('/api/me', { timezone: 'Europe/London' });
    await one.patch('/api/couple', { longDistance: true, reunionDate: '2030-01-01' });
    const view = (await one.get('/api/me')).body;
    expect(view.partner.timezone).toBe('Europe/London');
    expect(view.couple).toMatchObject({ longDistance: true, reunionDate: '2030-01-01' });
    expect((await one.patch('/api/me', { timezone: 'Mars/Olympus' })).status).toBe(400);
  });

  it('holds a scheduled nudge until its time, then delivers it once', async () => {
    const { one, two } = await makeCouple();
    const deliverAt = new Date(Date.now() + 3600_000).toISOString();
    await one.post('/api/nudges', { emoji: '☀️', text: 'Good morning', deliverAt });
    expect((await two.get('/api/nudges')).body.recent).toHaveLength(0);
    expect((await two.get('/api/nudges')).body.scheduled).toHaveLength(0);
    expect((await one.get('/api/nudges')).body.scheduled).toHaveLength(1);

    await deliverScheduledNudges(new Date(Date.now() + 2 * 3600_000));
    await deliverScheduledNudges(new Date(Date.now() + 3 * 3600_000));
    expect((await two.get('/api/nudges')).body.recent).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: two.id, type: 'nudge' })).toBe(1);
    expect(await Nudge.countDocuments({ deliveredAt: null, deliverAt: { $ne: null } })).toBe(0);
  });
});

describe('memory map', () => {
  const upload = (token: string, fields: Record<string, string>, file = PNG, name = 'a.png') => {
    const req = request(app).post('/api/memories').set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('files', file, name);
  };

  it('pins a memory chosen from place search', async () => {
    const { one, two } = await makeCouple();
    await upload(one.token, { location: 'Glenelg', lat: '-34.98', lng: '138.51' });
    const map = (await two.get('/api/memories/map')).body;
    expect(map.pins).toHaveLength(1);
    expect(map.pins[0]).toMatchObject({ lat: -34.98, lng: 138.51, location: 'Glenelg' });
  });

  it("reads the location a photo was taken from its own GPS data", async () => {
    const { one } = await makeCouple();
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f0a' } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '37/1 48/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '144/1 57/1 0/1' } })
      .toBuffer();
    await upload(one.token, {}, jpeg, 'melbourne.jpg');
    const pin = (await one.get('/api/memories/map')).body.pins[0];
    expect(pin.lat).toBeCloseTo(-37.8, 1);
    expect(pin.lng).toBeCloseTo(144.95, 1);
  });
});

describe('year in review', () => {
  it('summarises a relationship year', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/messages', { text: 'I love you ❤️❤️' });
    await two.post('/api/messages', { text: 'I love you more 🥰' });
    await one.post('/api/nudges', { emoji: '🫂', text: 'Hug' });
    const { periods } = (await one.get('/api/recap')).body;
    expect(periods[0]).toMatchObject({ key: 'y4', complete: false });
    expect(periods.at(-1)).toMatchObject({ key: 'y1', label: 'Our first year', complete: true });
    const recap = (await one.get(`/api/recap/${periods[0].key}`)).body;
    expect(recap.messages.total).toBe(2);
    expect(recap.messages.iLoveYous).toBe(2);
    expect(recap.messages.topEmojis[0]).toEqual({ value: '❤️', count: 2 });
    expect(recap.nudges.favourite).toEqual({ value: '🫂 Hug', count: 1 });
    expect((await one.get('/api/recap/y99')).status).toBe(400);
  });
});

describe('end-to-end encrypted chat', () => {
  const key = { keyId: 'key_0123456789', salt: 'c2FsdHNhbHRzYWx0c2FsdA==', iterations: 600000, verifier: 'iv.ciphertext-of-a-known-value' };
  const cipher = { keyId: key.keyId, iv: 'AAAAAAAAAAAAAAAA', data: 'ZW5jcnlwdGVkLWJ5dGVz' };

  it('stores only ciphertext, refuses plaintext while on, and never previews content', async () => {
    const { one, two } = await makeCouple();
    const session = (await one.post('/api/couple/e2ee/keys', key)).body;
    expect(session.couple.e2ee).toMatchObject({ enabled: true, keys: [expect.objectContaining({ keyId: key.keyId, salt: key.salt })] });
    expect(JSON.stringify(session)).not.toMatch(/passphrase/i);

    expect((await two.post('/api/messages', { text: 'plain' })).status).toBe(400);
    expect((await two.post('/api/messages', { type: 'encrypted', cipher: { ...cipher, keyId: 'key_unknown00' } })).status).toBe(400);
    expect((await two.post('/api/messages', { type: 'encrypted', cipher, text: 'leak' })).status).toBe(400);

    const sent = (await two.post('/api/messages', { type: 'encrypted', cipher })).body.message;
    expect(sent).toMatchObject({ type: 'encrypted', text: '', cipher });
    expect((await one.get('/api/dashboard')).body.lastMessage).toMatchObject({ preview: '🔒 Encrypted message', cipher: { data: cipher.data } });
    // Encrypted messages can't be found by server search.
    expect((await one.get('/api/messages?q=ZW5j')).body.messages).toHaveLength(0);

    // Attachments must be opaque blobs while encryption is on.
    const plainUpload = await request(app).post('/api/messages/upload').set('Authorization', `Bearer ${one.token}`).attach('file', PNG, 'a.png');
    expect(plainUpload.status).toBe(400);
    const blob = await request(app)
      .post('/api/messages/upload')
      .set('Authorization', `Bearer ${one.token}`)
      .field('encrypted', '1')
      .attach('file', Buffer.from('random-looking-bytes'), 'x.bin');
    expect(blob.body.media).toMatchObject({ kind: 'encrypted', mime: 'application/octet-stream', thumbUrl: null });
    expect((await one.post('/api/messages', { type: 'encrypted', cipher, mediaId: blob.body.media.id })).status).toBe(201);

    await one.post('/api/couple/e2ee/enabled', { enabled: false });
    expect((await one.post('/api/messages', { text: 'plain again' })).status).toBe(201);
  });
});

describe('isolation of the new features', () => {
  it("can't reach another couple's songs, gifts, watchlist, games or journal", async () => {
    const a = await makeCouple('Alex', 'Sam');
    const b = await makeCouple('Mallory', 'Trent');
    const song = (await a.one.post('/api/songs', { url: 'https://youtu.be/dQw4w9WgXcQ' })).body.song;
    const wish = (await a.one.post('/api/gifts', { kind: 'wish', title: 'Secret wish' })).body.items[0];
    const watch = (await a.one.post('/api/watchlist', { title: 'Our show' })).body.item;
    const game = (await a.one.post('/api/games', { game: 'this_or_that' })).body.game;
    await request(app).put(`/api/journal/${todayIn('Australia/Adelaide')}`).set('Authorization', `Bearer ${a.one.token}`).send({ text: 'private day' });

    const x = b.one;
    for (const [url, pick] of [
      ['/api/songs', (r: any) => r.history],
      ['/api/gifts', (r: any) => r.items],
      ['/api/watchlist', (r: any) => r.items],
      ['/api/games', (r: any) => r.games],
      ['/api/journal', (r: any) => r.days],
      ['/api/memories/map', (r: any) => r.pins],
    ] as const) {
      expect(pick((await x.get(url)).body), url).toHaveLength(0);
    }
    for (const res of await Promise.all([
      x.post(`/api/songs/${song.id}/react`, { emoji: '❤️' }),
      x.del(`/api/songs/${song.id}`),
      x.post(`/api/gifts/${wish.id}/claim`, { claimed: true }),
      x.patch(`/api/watchlist/${watch.id}`, { status: 'watched' }),
      x.post(`/api/games/${game.id}/answer`, { picks: Array(10).fill(0) }),
    ])) {
      expect(res.status, res.request.url).toBe(404);
    }
  });
});
