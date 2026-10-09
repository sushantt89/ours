import type { AnyId } from '../models';
import { Router } from 'express';
import { z } from 'zod';
import { CalendarEvent, Countdown, SharedList, BucketListItem, Media, EVENT_TYPES, BUCKET_CATEGORIES } from '../models';
import { eventsFor } from '../services/calendar';
import { assertOwnMedia, deleteMediaByIds, mediaJSON } from '../services/media';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { addDays, todayIn } from '../utils/dates';
import { owned } from '../utils/owned';
import { forbidden, notFound, badRequest } from '../utils/http';
import * as v from '../utils/validation';

/* ── Calendar ───────────────────────────────────────────────────────── */

export const events = Router();

const eventSchema = z.object({
  title: z.string().trim().min(1, 'Give it a title').max(80),
  emoji: v.emoji.default('📅'),
  type: z.enum(EVENT_TYPES).default('event'),
  date: v.dateOnly,
  time: v.timeOnly.nullish(),
  recurrence: z.enum(['none', 'weekly', 'monthly', 'yearly']).default('none'),
  remindDaysBefore: z.array(z.number().int().min(0).max(60)).max(5).default([0]),
  notes: z.string().trim().max(1000).default(''),
  visibility: z.enum(['shared', 'personal']).default('shared'),
});

events.get('/', async (req, res) => {
  res.json({ events: await eventsFor(req.couple, req.user._id) });
});

events.post('/', async (req, res) => {
  const body = eventSchema.parse(req.body);
  const event = await CalendarEvent.create({ ...body, time: body.time ?? undefined, coupleId: req.couple._id, createdBy: req.user._id });
  if (event.visibility === 'shared') {
    sync(req.couple._id, 'events', 'dashboard');
    if (req.partnerId) {
      await notify({
        userId: req.partnerId,
        coupleId: req.couple._id,
        type: 'calendar',
        emoji: event.emoji,
        title: `${req.user.name} added ${event.title}`,
        body: new Date(`${event.date}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
        url: '/calendar',
      });
    }
  }
  res.status(201).json({ id: String(event._id) });
});

async function loadEvent(req: Parameters<typeof owned>[1]) {
  const event = await owned(CalendarEvent, req, 'That event');
  if (event.visibility === 'personal' && !event.createdBy.equals(req.user._id)) throw notFound('That event');
  return event;
}

events.patch('/:id', async (req, res) => {
  const body = eventSchema.partial().parse(req.body);
  const event = await loadEvent(req);
  if (body.visibility && !event.createdBy.equals(req.user._id)) throw forbidden('Only the creator can change who sees this');
  const { time, ...rest } = body;
  Object.assign(event, rest);
  if (time !== undefined) event.time = time ?? undefined;
  await event.save();
  sync(req.couple._id, 'events', 'dashboard');
  res.json({ ok: true });
});

events.delete('/:id', async (req, res) => {
  const event = await loadEvent(req);
  await event.deleteOne();
  sync(req.couple._id, 'events', 'dashboard');
  res.json({ ok: true });
});

/* ── Countdowns ─────────────────────────────────────────────────────── */

export const countdowns = Router();

const BACKGROUNDS = ['sunset', 'blush', 'ocean', 'forest', 'night', 'gold', 'photo'] as const;
const countdownSchema = z.object({
  title: z.string().trim().min(1, 'Give it a name').max(60),
  emoji: v.emoji.default('✈️'),
  date: v.dateOnly,
  background: z.enum(BACKGROUNDS).default('sunset'),
  mediaId: v.objectId.nullish(),
});

export async function countdownsJSON(coupleId: AnyId, timezone: string) {
  // Keep finished countdowns around for a week, then let them fall away.
  const cutoff = addDays(todayIn(timezone), -7);
  const list = await Countdown.find({ coupleId, date: { $gte: cutoff } }).sort({ date: 1 });
  return list.map((c) => ({
    id: String(c._id),
    title: c.title,
    emoji: c.emoji,
    date: c.date,
    background: c.background,
    imageUrl: c.mediaId ? `/api/media/${c.mediaId}` : null,
  }));
}

countdowns.get('/', async (req, res) => {
  res.json({ countdowns: await countdownsJSON(req.couple._id, req.couple.timezone) });
});

countdowns.post('/', async (req, res) => {
  const body = countdownSchema.parse(req.body);
  await assertOwnMedia(req.couple._id, [body.mediaId]);
  const doc = await Countdown.create({ ...body, mediaId: body.mediaId ?? undefined, coupleId: req.couple._id, createdBy: req.user._id });
  sync(req.couple._id, 'countdowns', 'dashboard');
  res.status(201).json({ id: String(doc._id) });
});

countdowns.patch('/:id', async (req, res) => {
  const body = countdownSchema.partial().parse(req.body);
  const doc = await owned(Countdown, req, 'That countdown');
  await assertOwnMedia(req.couple._id, [body.mediaId]);
  const { mediaId, ...rest } = body;
  Object.assign(doc, rest);
  if (mediaId !== undefined) {
    if (doc.mediaId && String(doc.mediaId) !== mediaId) await deleteMediaByIds(req.couple._id, [doc.mediaId]);
    doc.set('mediaId', mediaId ?? undefined);
  }
  await doc.save();
  sync(req.couple._id, 'countdowns', 'dashboard');
  res.json({ ok: true });
});

countdowns.delete('/:id', async (req, res) => {
  const doc = await owned(Countdown, req, 'That countdown');
  if (doc.mediaId) await deleteMediaByIds(req.couple._id, [doc.mediaId]);
  await doc.deleteOne();
  sync(req.couple._id, 'countdowns', 'dashboard');
  res.json({ ok: true });
});

/* ── Shared lists ───────────────────────────────────────────────────── */

export const lists = Router();

const listSchema = z.object({
  name: z.string().trim().min(1, 'Give the list a name').max(40),
  emoji: v.emoji.default('📝'),
  kind: z.enum(['shopping', 'todo']).default('todo'),
});

// At most one "list changed" notification per list every 10 minutes.
const lastListPing = new Map<string, number>();

async function pingPartner(req: Parameters<typeof owned>[1], list: { _id: unknown; name: string; emoji: string }, text: string) {
  if (!req.partnerId) return;
  const key = `${list._id}:${req.user._id}`;
  const now = Date.now();
  if (now - (lastListPing.get(key) ?? 0) < 10 * 60 * 1000) return;
  lastListPing.set(key, now);
  await notify({
    userId: req.partnerId,
    coupleId: req.couple._id,
    type: 'list',
    emoji: list.emoji,
    title: `${req.user.name} updated ${list.name}`,
    body: text,
    url: '/lists',
  });
}

lists.get('/', async (req, res) => {
  res.json({ lists: await SharedList.find({ coupleId: req.couple._id }).sort({ createdAt: 1 }) });
});

lists.post('/', async (req, res) => {
  const body = listSchema.parse(req.body);
  if ((await SharedList.countDocuments({ coupleId: req.couple._id })) >= 30) throw badRequest('You can have up to 30 lists');
  const list = await SharedList.create({ ...body, coupleId: req.couple._id, createdBy: req.user._id });
  sync(req.couple._id, 'lists');
  res.status(201).json({ list });
});

lists.patch('/:id', async (req, res) => {
  const body = listSchema.partial().parse(req.body);
  const list = await owned(SharedList, req, 'That list');
  Object.assign(list, body);
  await list.save();
  sync(req.couple._id, 'lists');
  res.json({ list });
});

lists.delete('/:id', async (req, res) => {
  const list = await owned(SharedList, req, 'That list');
  await list.deleteOne();
  sync(req.couple._id, 'lists');
  res.json({ ok: true });
});

lists.post('/:id/items', async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(200) }).parse(req.body);
  const list = await owned(SharedList, req, 'That list');
  if (list.items.length >= 300) throw badRequest('This list is full');
  list.items.push({ text, addedBy: req.user._id });
  await list.save();
  sync(req.couple._id, 'lists');
  await pingPartner(req, list, `Added: ${text}`);
  res.status(201).json({ list });
});

lists.patch('/:id/items/:itemId', async (req, res) => {
  const body = z.object({ text: z.string().trim().min(1).max(200).optional(), done: z.boolean().optional() }).parse(req.body);
  const list = await owned(SharedList, req, 'That list');
  const item = list.items.id(String(req.params.itemId));
  if (!item) throw notFound('That item');
  if (body.text !== undefined) item.text = body.text;
  if (body.done !== undefined) {
    item.done = body.done;
    item.doneBy = body.done ? req.user._id : undefined;
    item.doneAt = body.done ? new Date() : undefined;
  }
  await list.save();
  sync(req.couple._id, 'lists');
  res.json({ list });
});

lists.delete('/:id/items/:itemId', async (req, res) => {
  const list = await owned(SharedList, req, 'That list');
  list.items.id(String(req.params.itemId))?.deleteOne();
  await list.save();
  sync(req.couple._id, 'lists');
  res.json({ list });
});

lists.post('/:id/clear-done', async (req, res) => {
  const list = await owned(SharedList, req, 'That list');
  list.set('items', list.items.filter((i) => !i.done));
  await list.save();
  sync(req.couple._id, 'lists');
  res.json({ list });
});

/* ── Couple bucket list ─────────────────────────────────────────────── */

export const bucket = Router();

const bucketSchema = z.object({
  title: z.string().trim().min(1, 'What do you want to do together?').max(120),
  category: z.enum(BUCKET_CATEGORIES).default('other'),
  notes: z.string().trim().max(1000).default(''),
  done: z.boolean().default(false),
  completedAt: v.dateOnly.nullish(),
  mediaIds: v.mediaIds.default([]),
});

async function bucketJSON(coupleId: AnyId) {
  const items = await BucketListItem.find({ coupleId }).sort({ done: 1, createdAt: -1 });
  const media = await Media.find({ _id: { $in: items.flatMap((i) => i.mediaIds) }, coupleId });
  const map = new Map(media.map((m) => [String(m._id), m]));
  return items.map((i) => ({
    id: String(i._id),
    title: i.title,
    category: i.category,
    notes: i.notes,
    done: i.done,
    completedAt: i.completedAt ?? null,
    media: i.mediaIds.map((id) => mediaJSON(map.get(String(id)))).filter(Boolean),
    createdAt: i.get('createdAt'),
  }));
}

bucket.get('/', async (req, res) => {
  res.json({ items: await bucketJSON(req.couple._id) });
});

bucket.post('/', async (req, res) => {
  const body = bucketSchema.parse(req.body);
  await assertOwnMedia(req.couple._id, body.mediaIds);
  await BucketListItem.create({ ...body, completedAt: body.completedAt ?? undefined, coupleId: req.couple._id, createdBy: req.user._id });
  sync(req.couple._id, 'bucket');
  res.status(201).json({ items: await bucketJSON(req.couple._id) });
});

bucket.patch('/:id', async (req, res) => {
  const body = bucketSchema.partial().parse(req.body);
  const item = await owned(BucketListItem, req, 'That item');
  if (body.mediaIds) {
    await assertOwnMedia(req.couple._id, body.mediaIds);
    const removed = item.mediaIds.filter((id) => !body.mediaIds!.includes(String(id)));
    await deleteMediaByIds(req.couple._id, removed);
  }
  const wasDone = item.done;
  const { completedAt, ...rest } = body;
  Object.assign(item, rest);
  if (completedAt !== undefined) item.completedAt = completedAt ?? undefined;
  if (body.done === true && !wasDone && !item.completedAt) item.completedAt = todayIn(req.couple.timezone);
  if (body.done === false) item.completedAt = undefined;
  await item.save();
  sync(req.couple._id, 'bucket');
  if (body.done === true && !wasDone && req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'list',
      emoji: '🎉',
      title: 'Bucket list: done!',
      body: item.title,
      url: '/bucket-list',
    });
  }
  res.json({ items: await bucketJSON(req.couple._id) });
});

bucket.delete('/:id', async (req, res) => {
  const item = await owned(BucketListItem, req, 'That item');
  await deleteMediaByIds(req.couple._id, item.mediaIds);
  await item.deleteOne();
  sync(req.couple._id, 'bucket');
  res.json({ ok: true });
});
