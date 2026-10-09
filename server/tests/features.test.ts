import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, makeCouple, PNG } from './helpers';
import { Notification, Note, Memory } from '../src/models';
import { deliverScheduledNotes, runDailyReminders } from '../src/services/scheduler';
import { todayIn, addDays } from '../src/utils/dates';

describe('chat', () => {
  it('sends, replies, reacts, edits, pins and deletes', async () => {
    const { one, two } = await makeCouple();
    const first = (await one.post('/api/messages', { text: 'I love you ❤️' })).body.message;
    const reply = (await two.post('/api/messages', { text: 'Love you more', replyTo: first.id })).body.message;
    expect(reply.replyTo.preview).toBe('I love you ❤️');

    const reacted = (await two.post(`/api/messages/${first.id}/react`, { emoji: '😘' })).body.message;
    expect(reacted.reactions).toEqual([{ userId: two.id, emoji: '😘' }]);
    const toggled = (await two.post(`/api/messages/${first.id}/react`, { emoji: '😘' })).body.message;
    expect(toggled.reactions).toHaveLength(0);

    expect((await two.patch(`/api/messages/${first.id}`, { text: 'edited by partner' })).status).toBe(403);
    const edited = (await one.patch(`/api/messages/${first.id}`, { text: 'I love you so much' })).body.message;
    expect(edited.editedAt).toBeTruthy();

    await one.post(`/api/messages/${first.id}/pin`, { pinned: true });
    expect((await two.get('/api/messages/pinned')).body.messages).toHaveLength(1);

    expect((await two.del(`/api/messages/${first.id}`)).status).toBe(403);
    const deleted = (await one.del(`/api/messages/${first.id}`)).body.message;
    expect(deleted.deleted).toBe(true);
    expect(deleted.text).toBe('');

    const found = (await one.get('/api/messages?q=more')).body.messages;
    expect(found).toHaveLength(1);
  });

  it('tracks unread counts and honours the read-receipt privacy setting', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/messages', { text: 'one' });
    await one.post('/api/messages', { text: 'two' });
    expect((await two.get('/api/messages/unread')).body.count).toBe(2);
    expect((await one.get('/api/messages/unread')).body.count).toBe(0);

    await two.patch('/api/me', { privacy: { readReceipts: false } });
    await two.post('/api/messages/read');
    expect((await two.get('/api/messages/unread')).body.count).toBe(0);
    // Sam turned receipts off, so Alex cannot see that the messages were read.
    expect((await one.get('/api/messages')).body.messages.every((m: any) => m.readAt === null)).toBe(true);

    await two.patch('/api/me', { privacy: { readReceipts: true } });
    expect((await one.get('/api/messages')).body.messages.every((m: any) => m.readAt !== null)).toBe(true);
  });

  it('rejects files that only pretend to be images', async () => {
    const { one } = await makeCouple();
    const fake = await request(app)
      .post('/api/messages/upload')
      .set('Authorization', `Bearer ${one.token}`)
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'cute.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const real = await request(app)
      .post('/api/messages/upload')
      .set('Authorization', `Bearer ${one.token}`)
      .attach('file', PNG, 'cute.png');
    expect(real.status).toBe(201);
    expect(real.body.media.storage).toBe('app');
    const sent = await one.post('/api/messages', { type: 'image', mediaId: real.body.media.id });
    expect(sent.status).toBe(201);
  });
});

describe('love notes', () => {
  it('keeps private notes private and shared notes shared', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/notes', { audience: 'private', body: 'gift ideas for Sam' });
    await one.post('/api/notes', { audience: 'shared', body: 'wifi password' });
    const seen = (await two.get('/api/notes')).body.notes;
    expect(seen.map((n: any) => n.body)).toEqual(['wifi password']);
  });

  it('holds scheduled notes back until their time', async () => {
    const { one, two } = await makeCouple();
    const deliverAt = new Date(Date.now() + 3600_000).toISOString();
    await one.post('/api/notes', { body: 'good luck today', deliverAt });
    expect((await two.get('/api/notes')).body.notes).toHaveLength(0);
    expect(await Notification.countDocuments({ userId: two.id, type: 'note' })).toBe(0);

    expect(await deliverScheduledNotes(new Date(Date.now() + 2 * 3600_000))).toBe(1);
    expect((await two.get('/api/notes')).body.notes).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: two.id, type: 'note' })).toBe(1);
    // Running the job again never delivers twice.
    expect(await deliverScheduledNotes(new Date(Date.now() + 3 * 3600_000))).toBe(0);
  });

  it('never sends the contents of a locked surprise or a sealed letter', async () => {
    const { one, two } = await makeCouple();
    const unlockAt = new Date(Date.now() + 86400_000).toISOString();
    const surprise = (await one.post('/api/notes', { kind: 'surprise', title: 'Tickets!', body: 'We are going to Japan', unlockAt })).body.note;
    const letter = (await one.post('/api/notes', { kind: 'open_when', title: 'Open when you miss me', body: 'I miss you too' })).body.note;

    const raw = JSON.stringify((await two.get('/api/notes')).body);
    expect(raw).not.toContain('Japan');
    expect(raw).not.toContain('Tickets');
    expect(raw).not.toContain('I miss you too');
    expect(raw).toContain('Open when you miss me');

    expect((await two.post(`/api/notes/${surprise.id}/open`)).status).toBe(403);
    const opened = (await two.post(`/api/notes/${letter.id}/open`)).body.note;
    expect(opened.body).toBe('I miss you too');

    await Note.updateOne({ _id: surprise.id }, { unlockAt: new Date(Date.now() - 1000) });
    expect((await two.post(`/api/notes/${surprise.id}/open`)).body.note.body).toBe('We are going to Japan');
  });

  it('lets each partner pin and archive independently', async () => {
    const { one, two } = await makeCouple();
    const note = (await one.post('/api/notes', { body: 'hi' })).body.note;
    await two.post(`/api/notes/${note.id}/flags`, { pinned: true, archived: true });
    const mine = (await one.get('/api/notes')).body.notes[0];
    const theirs = (await two.get('/api/notes')).body.notes[0];
    expect([mine.pinned, mine.archived]).toEqual([false, false]);
    expect([theirs.pinned, theirs.archived]).toEqual([true, true]);
  });
});

describe('nudges and notification preferences', () => {
  it('notifies the partner, unless they switched that type off', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/nudges', { emoji: '🫂', text: 'Hug' });
    expect(await Notification.countDocuments({ userId: two.id, type: 'nudge' })).toBe(1);

    await two.patch('/api/me', { notificationPrefs: { nudges: false } });
    await one.post('/api/nudges', { emoji: '😘', text: 'Kiss' });
    expect(await Notification.countDocuments({ userId: two.id, type: 'nudge' })).toBe(1);
    // The nudge itself is still recorded.
    expect((await two.get('/api/nudges')).body.recent).toHaveLength(2);
  });

  it('saves and removes custom nudges', async () => {
    const { one, two } = await makeCouple();
    const added = (await one.post('/api/nudges/custom', { emoji: '🍟', text: 'Bring me fries' })).body.couple;
    expect(added.customNudges).toHaveLength(1);
    expect((await two.get('/api/me')).body.couple.customNudges[0].text).toBe('Bring me fries');
    await two.del(`/api/nudges/custom/${added.customNudges[0].id}`);
    expect((await one.get('/api/me')).body.couple.customNudges).toHaveLength(0);
  });
});

describe('daily question', () => {
  it("hides a partner's answer until you have answered too", async () => {
    const { one, two } = await makeCouple();
    const q1 = (await one.get('/api/questions/today')).body.question;
    const q2 = (await two.get('/api/questions/today')).body.question;
    expect(q1.question).toBe(q2.question);

    await one.post('/api/questions/today/answer', { text: 'the picnic' });
    const waiting = (await two.get('/api/questions/today')).body.question;
    expect(waiting.partnerAnswered).toBe(true);
    expect(waiting.partnerAnswer).toBeNull();
    expect(JSON.stringify(waiting)).not.toContain('picnic');

    const revealed = (await two.post('/api/questions/today/answer', { text: 'the road trip' })).body.question;
    expect(revealed.partnerAnswer).toBe('the picnic');
    // Once both have answered, neither can rewrite theirs.
    expect((await one.post('/api/questions/today/answer', { text: 'changed my mind' })).status).toBe(400);
  });
});

describe('mood and presence privacy', () => {
  it('shares mood only when the person allows it', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/moods', { emoji: '🥰', label: 'Loved' });
    expect((await two.get('/api/me')).body.partner.mood.label).toBe('Loved');
    await one.patch('/api/me', { privacy: { shareMood: false, showLastSeen: false, showOnline: false } });
    const partner = (await two.get('/api/me')).body.partner;
    expect(partner.mood).toBeNull();
    expect(partner.online).toBeNull();
    expect(partner.lastSeenAt).toBeNull();
  });
});

describe('memories', () => {
  it('uploads with a thumbnail, supports private memories, favourites and comments', async () => {
    const { one, two } = await makeCouple();
    const upload = (visibility: string) =>
      request(app)
        .post('/api/memories')
        .set('Authorization', `Bearer ${one.token}`)
        .field('caption', `${visibility} photo`)
        .field('visibility', visibility)
        .field('date', '2024-03-02')
        .attach('files', PNG, 'a.png');
    const shared = (await upload('shared')).body.memories[0];
    const secret = (await upload('private')).body.memories[0];
    expect(shared.media.thumbUrl).toBeTruthy();

    expect((await two.get('/api/memories')).body.memories.map((m: any) => m.id)).toEqual([shared.id]);
    expect((await two.patch(`/api/memories/${secret.id}`, { caption: 'x' })).status).toBe(404);
    // A private memory's file is still couple-scoped media; its record is what stays hidden.
    expect((await one.get('/api/memories')).body.memories).toHaveLength(2);

    await two.post(`/api/memories/${shared.id}/favorite`, { favorite: true });
    expect((await two.get('/api/memories?favorite=1')).body.memories).toHaveLength(1);
    expect((await one.get('/api/memories?favorite=1')).body.memories).toHaveLength(0);

    const commented = (await two.post(`/api/memories/${shared.id}/comments`, { text: 'best day' })).body.memory;
    expect((await one.del(`/api/memories/${shared.id}/comments/${commented.comments[0].id}`)).status).toBe(403);

    const facets = (await one.get('/api/memories/facets')).body;
    expect(facets.months[0]).toEqual({ month: '2024-03', count: 2 });
  });

  it('surfaces "on this day" memories from earlier years', async () => {
    const { one, two, coupleId } = await makeCouple();
    const today = todayIn('Australia/Adelaide');
    const lastYear = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
    await request(app)
      .post('/api/memories')
      .set('Authorization', `Bearer ${one.token}`)
      .field('date', lastYear)
      .field('location', 'Melbourne')
      .attach('files', PNG, 'a.png');
    expect(await Memory.countDocuments({ coupleId })).toBe(1);
    expect((await two.get('/api/memories/on-this-day')).body.memories).toHaveLength(1);

    await runDailyReminders(new Date(), true);
    const reminder = await Notification.findOne({ userId: two.id, type: 'memory', title: /2 years ago/ });
    expect(reminder?.body).toBe('You were in Melbourne');
  });
});

describe('calendar, milestones and reminders', () => {
  it('derives the anniversary from the couple profile and sends each reminder once', async () => {
    const { one, two } = await makeCouple();
    const today = todayIn('Australia/Adelaide');
    // Make today the anniversary: started exactly three years ago.
    const start = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
    await one.patch('/api/couple', { startDate: start });
    await one.post('/api/events', { title: 'Dentist', date: addDays(today, 1), remindDaysBefore: [1], visibility: 'personal' });

    const events = (await two.get('/api/events')).body.events;
    expect(events.find((e: any) => e.type === 'anniversary').date).toBe(start);
    expect(events.map((e: any) => e.title)).not.toContain('Dentist');

    await runDailyReminders(new Date(), true);
    await runDailyReminders(new Date(), true);
    const forTwo = await Notification.find({ userId: two.id });
    const titles = forTwo.map((n) => n.title);
    expect(titles.filter((t) => t === '3 years together!')).toHaveLength(1);
    expect(titles.filter((t) => t === 'Our anniversary is today')).toHaveLength(1);
    // Personal reminders only go to the person who made them.
    expect(titles).not.toContain('Dentist is tomorrow');
    expect(await Notification.countDocuments({ userId: one.id, title: 'Dentist is tomorrow' })).toBe(1);

    const dash = (await one.get('/api/dashboard')).body;
    expect(dash.upcoming[0]).toMatchObject({ title: 'Our anniversary', daysUntil: 0 });
  });
});

describe('shared lists, bucket list and date night', () => {
  it('syncs list edits for both partners', async () => {
    const { one, two } = await makeCouple();
    const lists = (await one.get('/api/lists')).body.lists;
    const shopping = lists.find((l: any) => l.kind === 'shopping');
    const withMilk = (await one.post(`/api/lists/${shopping.id}/items`, { text: 'Milk' })).body.list;
    const done = (await two.patch(`/api/lists/${shopping.id}/items/${withMilk.items[0].id}`, { done: true })).body.list;
    expect(done.items[0]).toMatchObject({ text: 'Milk', done: true, doneBy: two.id });
    expect((await one.post(`/api/lists/${shopping.id}/clear-done`)).body.list.items).toHaveLength(0);
  });

  it('tracks bucket list completion and picks random dates', async () => {
    const { one, two } = await makeCouple();
    const item = (await one.post('/api/bucket', { title: 'Travel to Japan', category: 'travel' })).body.items[0];
    const after = (await two.patch(`/api/bucket/${item.id}`, { done: true })).body.items[0];
    expect(after.done).toBe(true);
    expect(after.completedAt).toBe(todayIn('Australia/Adelaide'));

    const random = (await one.get('/api/dates/random?category=home')).body.idea;
    expect(random.category).toBe('home');
    const saved = (await one.post('/api/dates', { title: random.title, emoji: random.emoji, category: 'home' })).body.idea;
    await two.patch(`/api/dates/${saved.id}`, { status: 'done' });
    expect((await one.get('/api/couple/stats')).body).toMatchObject({ dateNights: 1, bucketDone: 1 });
  });
});

describe('love streak', () => {
  it('counts a day only when both partners interacted', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/messages', { text: 'morning' });
    await new Promise((r) => setTimeout(r, 100));
    expect((await one.get('/api/dashboard')).body.streak).toEqual({ days: 0, todayDone: false });
    await two.post('/api/messages', { text: 'morning!' });
    await new Promise((r) => setTimeout(r, 100));
    expect((await one.get('/api/dashboard')).body.streak).toEqual({ days: 1, todayDone: true });
  });
});
