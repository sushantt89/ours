import type { AnyId } from '../models';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { Memory, Album, Media, type MemoryDoc, type MediaDoc } from '../models';
import { uploadLimiter } from '../middleware/rateLimit';
import { upload, saveUpload, mediaJSON, deleteMedia } from '../services/media';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { escapeRegex } from '../utils/crypto';
import { gpsFromImage, queueLocate } from '../services/geo';
import { todayIn } from '../utils/dates';
import { owned } from '../utils/owned';
import { badRequest, forbidden, notFound } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();

/** Shared memories, plus this person's own private ones. */
const visibleTo = (req: Request): Record<string, unknown> => ({
  coupleId: req.couple._id,
  $or: [{ visibility: 'shared' }, { authorId: req.user._id }],
});

function memoryJSON(m: MemoryDoc, media: MediaDoc | undefined, userId: AnyId) {
  return {
    id: String(m._id),
    authorId: String(m.authorId),
    kind: m.kind,
    media: mediaJSON(media),
    caption: m.caption,
    event: m.event,
    location: m.location,
    geo: m.geo?.lat != null ? { lat: m.geo.lat, lng: m.geo.lng } : null,
    date: m.date,
    albumIds: m.albumIds.map(String),
    visibility: m.visibility,
    favorite: m.favoriteBy.some((id) => String(id) === String(userId)),
    reactions: m.reactions.map((r) => ({ userId: String(r.userId), emoji: r.emoji })),
    comments: m.comments.map((c) => ({ id: String(c._id), userId: String(c.userId), text: c.text, createdAt: c.createdAt })),
    createdAt: m.get('createdAt'),
  };
}

async function serialize(memories: MemoryDoc[], userId: AnyId) {
  const media = await Media.find({ _id: { $in: memories.map((m) => m.mediaId) } });
  const map = new Map(media.map((m) => [String(m._id), m]));
  return memories.map((m) => memoryJSON(m, map.get(String(m.mediaId)), userId));
}

router.get('/', async (req, res) => {
  const query = z
    .object({
      album: v.objectId.optional(),
      year: z.string().regex(/^\d{4}$/).optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      event: z.string().max(80).optional(),
      favorite: z.enum(['1']).optional(),
      q: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(120).default(60),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = visibleTo(req);
  if (query.album) filter.albumIds = query.album;
  if (query.month) filter.date = { $regex: `^${query.month}` };
  else if (query.year) filter.date = { $regex: `^${query.year}` };
  if (query.event) filter.event = query.event;
  if (query.favorite) filter.favoriteBy = req.user._id;
  if (query.q) {
    const rx = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$and = [{ $or: [{ caption: rx }, { event: rx }, { location: rx }] }];
  }

  const docs = await Memory.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit + 1);
  res.json({
    memories: await serialize(docs.slice(0, query.limit), req.user._id),
    hasMore: docs.length > query.limit,
  });
});

/** Filter options: which years, months and events have memories. */
router.get('/facets', async (req, res) => {
  const docs = await Memory.find(visibleTo(req)).select('date event').lean();
  const months = new Map<string, number>();
  const events = new Map<string, number>();
  for (const d of docs) {
    const month = d.date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
    if (d.event) events.set(d.event, (events.get(d.event) ?? 0) + 1);
  }
  res.json({
    total: docs.length,
    months: [...months].sort((a, b) => b[0].localeCompare(a[0])).map(([month, count]) => ({ month, count })),
    events: [...events].sort((a, b) => b[1] - a[1]).map(([event, count]) => ({ event, count })),
  });
});

export async function onThisDay(req: Request) {
  const today = todayIn(req.couple.timezone);
  const docs = await Memory.find({ ...visibleTo(req), monthDay: today.slice(5), date: { $lt: `${today.slice(0, 4)}-01-01` } })
    .sort({ date: -1 })
    .limit(30);
  return serialize(docs, req.user._id);
}

router.get('/on-this-day', async (req, res) => {
  res.json({ memories: await onThisDay(req) });
});

/** Everything with a place on it, for the memory map. */
router.get('/map', async (req, res) => {
  const docs = await Memory.find({ ...visibleTo(req), 'geo.lat': { $exists: true } })
    .sort({ date: -1 })
    .limit(2000)
    .select('mediaId kind caption location date geo visibility');
  res.json({
    pins: docs.map((m) => ({
      id: String(m._id),
      lat: m.geo!.lat,
      lng: m.geo!.lng,
      location: m.location,
      caption: m.caption,
      date: m.date,
      kind: m.kind,
      thumbUrl: `/api/media/${m.mediaId}?thumb=1`,
    })),
    unpinned: await Memory.countDocuments({ ...visibleTo(req), 'geo.lat': { $exists: false } }),
  });
});

router.post('/seen', async (req, res) => {
  req.user.seenMemoriesAt = new Date();
  await req.user.save();
  res.json({ ok: true });
});

const detailsSchema = z.object({
  caption: z.string().trim().max(1000).default(''),
  event: z.string().trim().max(80).default(''),
  location: z.string().trim().max(80).default(''),
  date: v.dateOnly.optional(),
  albumIds: z.array(v.objectId).max(20).default([]),
  visibility: z.enum(['shared', 'private']).optional(),
  /** A pin chosen from place search. Takes priority over the photo's own GPS. */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

async function checkAlbums(req: Request, ids: string[]) {
  if (!ids.length) return;
  const count = await Album.countDocuments({ _id: { $in: ids }, coupleId: req.couple._id });
  if (count !== new Set(ids).size) throw badRequest('One of those albums no longer exists');
}

router.post(
  '/',
  uploadLimiter,
  upload.fields([{ name: 'files', maxCount: 12 }, { name: 'posters', maxCount: 12 }]),
  async (req, res) => {
    const uploaded = req.files as Record<string, Express.Multer.File[]> | undefined;
    const files = uploaded?.files ?? [];
    if (!files.length) throw badRequest('Choose at least one photo or video');
    // Multipart fields arrive as strings; albumIds and posterFor are JSON-encoded.
    const raw = { ...req.body, albumIds: req.body.albumIds ? JSON.parse(String(req.body.albumIds)) : [] };
    const body = detailsSchema.parse(raw);
    await checkAlbums(req, body.albumIds);

    // posterFor[i] is the index of the video that poster i belongs to.
    const posterFor: number[] = req.body.posterFor ? z.array(z.number().int()).parse(JSON.parse(String(req.body.posterFor))) : [];
    const posters = new Map(posterFor.map((fileIndex, i) => [fileIndex, uploaded?.posters?.[i]]));

    const date = body.date ?? todayIn(req.couple.timezone);
    const visibility = body.visibility ?? req.user.privacy?.memoryDefault ?? 'shared';
    const { lat, lng, ...details } = body;
    const picked = lat !== undefined && lng !== undefined ? { lat, lng, source: 'manual' as const } : null;
    const created: MemoryDoc[] = [];
    for (const [index, file] of files.entries()) {
      const gps = picked ? null : await gpsFromImage(file.buffer);
      const media = await saveUpload(req, file, {
        purpose: 'memory',
        kinds: ['image', 'video'],
        couple: req.couple,
        poster: posters.get(index),
      });
      created.push(
        await Memory.create({
          ...details,
          geo: picked ?? (gps ? { ...gps, source: 'photo' } : undefined),
          // A chosen pin with a name needs no lookup; anything else gets filled in in the background.
          geoChecked: Boolean(picked && details.location),
          date,
          monthDay: date.slice(5),
          visibility,
          coupleId: req.couple._id,
          authorId: req.user._id,
          mediaId: media._id,
          kind: media.kind as 'image' | 'video',
        }),
      );
    }

    for (const memory of created) if (!memory.geoChecked) queueLocate(memory._id);

    if (visibility === 'shared') {
      sync(req.couple._id, 'memories', 'dashboard');
      touchActivity(req.couple, req.user._id);
      if (req.partnerId) {
        await notify({
          userId: req.partnerId,
          coupleId: req.couple._id,
          type: 'memory',
          emoji: '📸',
          title: `${req.user.name} added ${created.length === 1 ? 'a new memory' : `${created.length} new memories`}`,
          body: body.caption || body.event,
          url: '/memories',
        });
      }
    }
    res.status(201).json({ memories: await serialize(created, req.user._id) });
  },
);

async function load(req: Request) {
  const memory = await owned(Memory, req, 'That memory');
  if (memory.visibility === 'private' && !memory.authorId.equals(req.user._id)) throw notFound('That memory');
  return memory;
}

const one = async (m: MemoryDoc, userId: AnyId) => (await serialize([m], userId))[0];

router.patch('/:id', async (req, res) => {
  const body = detailsSchema.partial().parse(req.body);
  const memory = await load(req);
  if (body.visibility && !memory.authorId.equals(req.user._id)) {
    throw forbidden('Only the person who added this can change who sees it');
  }
  if (body.albumIds) await checkAlbums(req, body.albumIds);
  const { lat, lng, ...details } = body;
  const placeChanged = details.location !== undefined && details.location !== memory.location;
  Object.assign(memory, details);
  if (body.date) memory.monthDay = body.date.slice(5);
  if (lat !== undefined && lng !== undefined) {
    memory.geo = { lat, lng, source: 'manual' };
    memory.geoChecked = true;
  } else if (placeChanged && memory.geo?.source !== 'photo') {
    // A new place name means a new pin (unless the photo itself knows where it was taken).
    memory.set('geo', undefined);
    memory.geoChecked = !memory.location;
  }
  await memory.save();
  if (!memory.geoChecked) queueLocate(memory._id);
  sync(req.couple._id, 'memories');
  res.json({ memory: await one(memory, req.user._id) });
});

router.post('/:id/favorite', async (req, res) => {
  const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
  const memory = await load(req);
  const updated = await Memory.findOneAndUpdate(
    { _id: memory._id, coupleId: req.couple._id },
    { [favorite ? '$addToSet' : '$pull']: { favoriteBy: req.user._id } },
    { returnDocument: 'after' },
  );
  res.json({ memory: await one(updated!, req.user._id) });
});

router.post('/:id/react', async (req, res) => {
  const { emoji } = z.object({ emoji: v.emoji }).parse(req.body);
  const memory = await load(req);
  const same = memory.reactions.find((r) => r.userId.equals(req.user._id))?.emoji === emoji;
  memory.reactions.pull({ userId: req.user._id });
  if (!same) memory.reactions.push({ userId: req.user._id, emoji });
  await memory.save();
  sync(req.couple._id, 'memories');
  res.json({ memory: await one(memory, req.user._id) });
});

router.post('/:id/comments', async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body);
  const memory = await load(req);
  if (memory.comments.length >= 200) throw badRequest('This memory has reached its comment limit');
  memory.comments.push({ userId: req.user._id, text });
  await memory.save();
  sync(req.couple._id, 'memories');
  if (req.partnerId && memory.visibility === 'shared') {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'memory',
      emoji: '💬',
      title: `${req.user.name} commented on a memory`,
      body: text.slice(0, 120),
      url: '/memories',
    });
  }
  res.status(201).json({ memory: await one(memory, req.user._id) });
});

router.delete('/:id/comments/:commentId', async (req, res) => {
  const memory = await load(req);
  const comment = memory.comments.id(String(req.params.commentId));
  if (!comment) throw notFound('That comment');
  if (!comment.userId.equals(req.user._id)) throw forbidden('You can only delete your own comments');
  comment.deleteOne();
  await memory.save();
  sync(req.couple._id, 'memories');
  res.json({ memory: await one(memory, req.user._id) });
});

router.delete('/:id', async (req, res) => {
  const memory = await load(req);
  await deleteMedia(await Media.findOne({ _id: memory.mediaId, coupleId: req.couple._id }));
  await memory.deleteOne();
  sync(req.couple._id, 'memories', 'dashboard');
  res.json({ ok: true });
});

export default router;

/* ── Albums ─────────────────────────────────────────────────────────── */

export const albums = Router();
const albumSchema = z.object({ name: z.string().trim().min(1).max(40), emoji: v.emoji.default('❤️') });

albums.get('/', async (req, res) => {
  const list = await Album.find({ coupleId: req.couple._id }).sort({ createdAt: 1 });
  const out = await Promise.all(
    list.map(async (album) => {
      const filter = { ...visibleTo(req), albumIds: album._id };
      const [count, latest] = await Promise.all([
        Memory.countDocuments(filter),
        Memory.findOne(filter).sort({ date: -1, createdAt: -1 }).select('mediaId'),
      ]);
      return {
        id: String(album._id),
        name: album.name,
        emoji: album.emoji,
        count,
        coverUrl: latest ? `/api/media/${latest.mediaId}?thumb=1` : null,
      };
    }),
  );
  res.json({ albums: out });
});

albums.post('/', async (req, res) => {
  const body = albumSchema.parse(req.body);
  const album = await Album.create({ ...body, coupleId: req.couple._id, createdBy: req.user._id });
  sync(req.couple._id, 'albums');
  res.status(201).json({ album: { id: String(album._id), name: album.name, emoji: album.emoji, count: 0, coverUrl: null } });
});

albums.patch('/:id', async (req, res) => {
  const body = albumSchema.partial().parse(req.body);
  const album = await owned(Album, req, 'That album');
  Object.assign(album, body);
  await album.save();
  sync(req.couple._id, 'albums');
  res.json({ ok: true });
});

/** Deleting an album keeps its photos; they are just no longer grouped. */
albums.delete('/:id', async (req, res) => {
  const album = await owned(Album, req, 'That album');
  await Memory.updateMany({ coupleId: req.couple._id }, { $pull: { albumIds: album._id } });
  await album.deleteOne();
  sync(req.couple._id, 'albums', 'memories');
  res.json({ ok: true });
});
