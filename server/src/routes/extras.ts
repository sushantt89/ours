import { Router, type Request } from 'express';
import { z } from 'zod';
import { Song, LittleThing, LITTLE_THING_CATEGORIES, GiftItem, WatchItem, JournalDay, Media } from '../models';
import { assertOwnMedia, deleteMediaByIds, mediaJSON } from '../services/media';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { searchPlaces } from '../services/geo';
import { escapeRegex } from '../utils/crypto';
import { todayIn } from '../utils/dates';
import { owned } from '../utils/owned';
import { badRequest, forbidden, notFound } from '../utils/http';
import * as v from '../utils/validation';

/* ── Song of the day ─────────────────────────────────────────────────── */

export const songs = Router();

type Provider = 'spotify' | 'youtube' | 'apple' | 'soundcloud' | 'link';

/** Recognises music links and works out how to embed them. */
export function parseSongUrl(raw: string): { provider: Provider; embedId?: string; url: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest('Paste a link to a song');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw badRequest('Paste a link to a song');
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'open.spotify.com') {
    const match = url.pathname.match(/\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{10,40})/);
    if (match) return { provider: 'spotify', embedId: `${match[1]}/${match[2]}`, url: url.toString() };
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') ?? url.pathname.match(/\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', embedId: id, url: url.toString() };
  }
  if (host === 'music.apple.com') {
    return { provider: 'apple', embedId: `${url.pathname}${url.search}`.slice(0, 300), url: url.toString() };
  }
  if (host === 'soundcloud.com') return { provider: 'soundcloud', url: url.toString() };
  return { provider: 'link', url: url.toString() };
}

/** Title, artist and artwork from the provider's public oEmbed endpoint, when it has one. */
async function songDetails(provider: Provider, url: string) {
  const endpoint =
    provider === 'spotify'
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
      : provider === 'youtube'
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : provider === 'soundcloud'
          ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
          : null;
  if (!endpoint || process.env.NODE_ENV === 'test') return {};
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return {};
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { title: data.title?.slice(0, 200), artist: data.author_name?.slice(0, 200), thumbnail: data.thumbnail_url?.slice(0, 600) };
  } catch {
    return {};
  }
}

songs.get('/', async (req, res) => {
  const today = todayIn(req.couple.timezone);
  const list = await Song.find({ coupleId: req.couple._id }).sort({ date: -1, createdAt: -1 }).limit(120);
  const mine = list.find((s) => s.date === today && s.userId.equals(req.user._id)) ?? null;
  const partner = list.find((s) => s.date === today && !s.userId.equals(req.user._id)) ?? null;
  res.json({ today, mine, partner, history: list });
});

songs.post('/', async (req, res) => {
  const body = z.object({ url: z.string().max(600), note: z.string().trim().max(280).default(''), title: z.string().trim().max(200).optional(), artist: z.string().trim().max(200).optional() }).parse(req.body);
  const parsed = parseSongUrl(body.url);
  const details = await songDetails(parsed.provider, parsed.url);
  const date = todayIn(req.couple.timezone);
  const song = await Song.findOneAndUpdate(
    { coupleId: req.couple._id, userId: req.user._id, date },
    {
      ...parsed,
      note: body.note,
      title: body.title || details.title || '',
      artist: body.artist || details.artist || '',
      thumbnail: details.thumbnail,
      reactions: [],
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  sync(req.couple._id, 'songs', 'dashboard');
  touchActivity(req.couple, req.user._id);
  if (req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'song',
      emoji: '🎵',
      title: `${req.user.name} picked today's song`,
      body: [song!.title, song!.artist].filter(Boolean).join(' · ') || body.note,
      url: '/music',
      dedupeKey: `song:${req.user._id}:${date}`,
      timezone: req.couple.timezone,
    });
  }
  res.status(201).json({ song });
});

songs.post('/:id/react', async (req, res) => {
  const { emoji } = z.object({ emoji: v.emoji }).parse(req.body);
  const song = await owned(Song, req, 'That song');
  const same = song.reactions.find((r) => String(r.userId) === String(req.user._id))?.emoji === emoji;
  song.set('reactions', song.reactions.filter((r) => String(r.userId) !== String(req.user._id)));
  if (!same) song.reactions.push({ userId: req.user._id, emoji });
  await song.save();
  sync(req.couple._id, 'songs', 'dashboard');
  res.json({ song });
});

songs.delete('/:id', async (req, res) => {
  const song = await owned(Song, req, 'That song');
  if (!song.userId.equals(req.user._id)) throw forbidden('Only the person who shared it can remove it');
  await song.deleteOne();
  sync(req.couple._id, 'songs', 'dashboard');
  res.json({ ok: true });
});

/* ── Little things (private to the author) ───────────────────────────── */

export const littleThings = Router();

const thingSchema = z.object({
  text: z.string().trim().min(1, 'Write something down').max(500),
  category: z.enum(LITTLE_THING_CATEGORIES).default('other'),
  pinned: z.boolean().default(false),
});

const mine = (req: Request) => ({ coupleId: req.couple._id, userId: req.user._id });

littleThings.get('/', async (req, res) => {
  const { q, category } = z.object({ q: z.string().trim().max(80).optional(), category: z.enum(LITTLE_THING_CATEGORIES).optional() }).parse(req.query);
  const filter: Record<string, unknown> = mine(req);
  if (category) filter.category = category;
  if (q) filter.text = { $regex: escapeRegex(q), $options: 'i' };
  res.json({ items: await LittleThing.find(filter).sort({ pinned: -1, createdAt: -1 }).limit(500) });
});

littleThings.post('/', async (req, res) => {
  const body = thingSchema.parse(req.body);
  res.status(201).json({ item: await LittleThing.create({ ...body, ...mine(req) }) });
});

async function ownThing(req: Request) {
  const item = await LittleThing.findOne({ _id: v.objectId.parse(req.params.id), ...mine(req) });
  if (!item) throw notFound('That note');
  return item;
}

littleThings.patch('/:id', async (req, res) => {
  const item = await ownThing(req);
  Object.assign(item, thingSchema.partial().parse(req.body));
  await item.save();
  res.json({ item });
});

littleThings.delete('/:id', async (req, res) => {
  await (await ownThing(req)).deleteOne();
  res.json({ ok: true });
});

/* ── Wishlists and secret gift ideas ─────────────────────────────────── */

export const gifts = Router();

const giftSchema = z.object({
  kind: z.enum(['wish', 'idea']),
  title: z.string().trim().min(1, 'What is it?').max(140),
  url: z.url().max(600).refine((u) => /^https?:\/\//.test(u), 'Use a web link').nullish(),
  price: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(1000).default(''),
  occasion: z.string().trim().max(60).default(''),
  priority: z.number().int().min(1).max(3).default(2),
  status: z.enum(['open', 'bought', 'given']).default('open'),
  mediaId: v.objectId.nullish(),
});

/**
 * The privacy rules that make gifts fun:
 *  - your own gift ideas are invisible to your partner;
 *  - on your own wishlist you never see whether your partner has claimed something.
 */
function giftJSON(item: InstanceType<typeof GiftItem>, viewerId: unknown, media?: unknown) {
  const mine = String(item.ownerId) === String(viewerId);
  return {
    id: String(item._id),
    kind: item.kind,
    mine,
    title: item.title,
    url: item.url ?? null,
    price: item.price ?? null,
    notes: item.notes,
    occasion: item.occasion,
    priority: item.priority,
    status: mine && item.kind === 'wish' ? (item.status === 'given' ? 'given' : 'open') : item.status,
    claimedByMe: !mine && Boolean(item.claimedBy && String(item.claimedBy) === String(viewerId)),
    claimed: !mine && Boolean(item.claimedBy),
    image: media ?? null,
    createdAt: item.get('createdAt'),
  };
}

async function giftsFor(req: Request) {
  const items = await GiftItem.find({
    coupleId: req.couple._id,
    $or: [{ kind: 'wish' }, { kind: 'idea', ownerId: req.user._id }],
  }).sort({ priority: -1, createdAt: -1 });
  const media = await Media.find({ _id: { $in: items.map((i) => i.mediaId).filter(Boolean) }, coupleId: req.couple._id });
  const byId = new Map(media.map((m) => [String(m._id), mediaJSON(m)]));
  return items.map((i) => giftJSON(i, req.user._id, i.mediaId ? byId.get(String(i.mediaId)) : null));
}

gifts.get('/', async (req, res) => {
  res.json({ items: await giftsFor(req) });
});

gifts.post('/', async (req, res) => {
  const body = giftSchema.parse(req.body);
  await assertOwnMedia(req.couple._id, [body.mediaId]);
  const item = await GiftItem.create({ ...body, url: body.url ?? undefined, price: body.price ?? undefined, mediaId: body.mediaId ?? undefined, ownerId: req.user._id, coupleId: req.couple._id });
  if (item.kind === 'wish') {
    sync(req.couple._id, 'gifts');
    if (req.partnerId) {
      await notify({ userId: req.partnerId, coupleId: req.couple._id, type: 'list', emoji: '🎁', title: `${req.user.name} added to their wishlist`, body: item.title, url: '/gifts' });
    }
  }
  res.status(201).json({ items: await giftsFor(req) });
});

async function ownGift(req: Request) {
  const item = await owned(GiftItem, req, 'That gift');
  if (!item.ownerId.equals(req.user._id)) {
    // Someone else's secret ideas don't exist as far as this person can tell.
    if (item.kind === 'idea') throw notFound('That gift');
    throw forbidden("You can't edit your partner's wishlist");
  }
  return item;
}

gifts.patch('/:id', async (req, res) => {
  const body = giftSchema.omit({ kind: true }).partial().parse(req.body);
  const item = await ownGift(req);
  if (body.mediaId) await assertOwnMedia(req.couple._id, [body.mediaId]);
  if (body.mediaId !== undefined && item.mediaId && String(item.mediaId) !== body.mediaId) await deleteMediaByIds(req.couple._id, [item.mediaId]);
  const { url, price, mediaId, ...rest } = body;
  Object.assign(item, rest);
  if (url !== undefined) item.url = url ?? undefined;
  if (price !== undefined) item.price = price ?? undefined;
  if (mediaId !== undefined) item.set('mediaId', mediaId ?? undefined);
  await item.save();
  if (item.kind === 'wish') sync(req.couple._id, 'gifts');
  res.json({ items: await giftsFor(req) });
});

/** Secretly claim (or release) something on your partner's wishlist. */
gifts.post('/:id/claim', async (req, res) => {
  const { claimed, status } = z.object({ claimed: z.boolean(), status: z.enum(['open', 'bought']).optional() }).parse(req.body);
  const item = await owned(GiftItem, req, 'That gift');
  if (item.kind !== 'wish' || item.ownerId.equals(req.user._id)) throw notFound('That gift');
  if (claimed && item.claimedBy && !item.claimedBy.equals(req.user._id)) throw badRequest('Already claimed');
  item.claimedBy = claimed ? req.user._id : undefined;
  item.status = claimed ? (status ?? 'open') : 'open';
  await item.save();
  // Only the claimer's own screens refresh: the owner must not get a hint.
  res.json({ items: await giftsFor(req) });
});

gifts.delete('/:id', async (req, res) => {
  const item = await ownGift(req);
  if (item.mediaId) await deleteMediaByIds(req.couple._id, [item.mediaId]);
  await item.deleteOne();
  if (item.kind === 'wish') sync(req.couple._id, 'gifts');
  res.json({ ok: true });
});

/* ── Watchlist ──────────────────────────────────────────────────────── */

export const watchlist = Router();

const watchSchema = z.object({
  title: z.string().trim().min(1, 'What should you watch?').max(140),
  kind: z.enum(['movie', 'series', 'documentary', 'anime', 'other']).default('movie'),
  year: z.number().int().min(1880).max(2100).nullish(),
  whereToWatch: z.string().trim().max(60).default(''),
  notes: z.string().trim().max(500).default(''),
  status: z.enum(['want', 'watching', 'watched']).default('want'),
});

watchlist.get('/', async (req, res) => {
  res.json({ items: await WatchItem.find({ coupleId: req.couple._id }).sort({ updatedAt: -1 }).limit(500) });
});

watchlist.post('/', async (req, res) => {
  const body = watchSchema.parse(req.body);
  const item = await WatchItem.create({
    ...body,
    year: body.year ?? undefined,
    watchedAt: body.status === 'watched' ? todayIn(req.couple.timezone) : undefined,
    coupleId: req.couple._id,
    addedBy: req.user._id,
  });
  sync(req.couple._id, 'watchlist');
  res.status(201).json({ item });
});

watchlist.patch('/:id', async (req, res) => {
  const body = watchSchema.partial().parse(req.body);
  const item = await owned(WatchItem, req, 'That title');
  const { year, ...rest } = body;
  Object.assign(item, rest);
  if (year !== undefined) item.set('year', year ?? undefined);
  if (body.status === 'watched' && !item.watchedAt) item.watchedAt = todayIn(req.couple.timezone);
  if (body.status && body.status !== 'watched') item.watchedAt = undefined;
  await item.save();
  sync(req.couple._id, 'watchlist');
  res.json({ item });
});

watchlist.post('/:id/rate', async (req, res) => {
  const { stars } = z.object({ stars: z.number().int().min(0).max(5) }).parse(req.body);
  const item = await owned(WatchItem, req, 'That title');
  item.set('ratings', item.ratings.filter((r) => String(r.userId) !== String(req.user._id)));
  if (stars > 0) item.ratings.push({ userId: req.user._id, stars });
  await item.save();
  sync(req.couple._id, 'watchlist');
  res.json({ item });
});

watchlist.delete('/:id', async (req, res) => {
  await (await owned(WatchItem, req, 'That title')).deleteOne();
  sync(req.couple._id, 'watchlist');
  res.json({ ok: true });
});

/* ── Shared journal ─────────────────────────────────────────────────── */

export const journal = Router();

async function journalJSON(days: InstanceType<typeof JournalDay>[]) {
  const ids = days.flatMap((d) => d.parts.flatMap((p) => p.mediaIds));
  const media = ids.length ? await Media.find({ _id: { $in: ids } }) : [];
  const byId = new Map(media.map((m) => [String(m._id), mediaJSON(m)]));
  return days.map((d) => ({
    id: String(d._id),
    date: d.date,
    parts: d.parts.map((p) => ({
      userId: String(p.userId),
      text: p.text,
      mood: p.mood ?? null,
      media: p.mediaIds.map((id) => byId.get(String(id))).filter(Boolean),
      updatedAt: p.updatedAt,
    })),
  }));
}

journal.get('/', async (req, res) => {
  const { before, limit } = z.object({ before: v.dateOnly.optional(), limit: z.coerce.number().int().min(1).max(60).default(30) }).parse(req.query);
  const filter: Record<string, unknown> = { coupleId: req.couple._id };
  if (before) filter.date = { $lt: before };
  const days = await JournalDay.find(filter).sort({ date: -1 }).limit(limit + 1);
  res.json({ days: await journalJSON(days.slice(0, limit)), hasMore: days.length > limit, today: todayIn(req.couple.timezone) });
});

journal.put('/:date', async (req, res) => {
  const date = v.dateOnly.parse(req.params.date);
  if (date > todayIn(req.couple.timezone)) throw badRequest("You can't write in the future (yet)");
  const body = z.object({ text: z.string().max(5000).default(''), mood: v.emoji.nullish(), mediaIds: v.mediaIds.max(4).default([]) }).parse(req.body);
  if (!body.text.trim() && !body.mediaIds.length) throw badRequest('Write something or add a photo');
  await assertOwnMedia(req.couple._id, body.mediaIds);

  const day = (await JournalDay.findOne({ coupleId: req.couple._id, date })) ?? new JournalDay({ coupleId: req.couple._id, date, parts: [] });
  const existing = day.parts.find((p) => p.userId.equals(req.user._id));
  if (existing) {
    const removed = existing.mediaIds.filter((id) => !body.mediaIds.includes(String(id)));
    await deleteMediaByIds(req.couple._id, removed);
    existing.set({ text: body.text, mood: body.mood ?? undefined, mediaIds: body.mediaIds, updatedAt: new Date() });
  } else {
    day.parts.push({ userId: req.user._id, text: body.text, mood: body.mood ?? undefined, mediaIds: body.mediaIds, updatedAt: new Date() });
  }
  await day.save();
  sync(req.couple._id, 'journal');
  touchActivity(req.couple, req.user._id);
  if (!existing && req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'journal',
      emoji: '📔',
      title: `${req.user.name} wrote in your journal`,
      body: body.text.slice(0, 120),
      url: '/journal',
      dedupeKey: `journal:${date}:${req.user._id}`,
      timezone: req.couple.timezone,
    });
  }
  res.json({ day: (await journalJSON([day]))[0] });
});

journal.delete('/:date', async (req, res) => {
  const date = v.dateOnly.parse(req.params.date);
  const day = await JournalDay.findOne({ coupleId: req.couple._id, date });
  const part = day?.parts.find((p) => p.userId.equals(req.user._id));
  if (!day || !part) throw notFound('That entry');
  await deleteMediaByIds(req.couple._id, part.mediaIds);
  day.set('parts', day.parts.filter((p) => !p.userId.equals(req.user._id)));
  if (day.parts.length) await day.save();
  else await day.deleteOne();
  sync(req.couple._id, 'journal');
  res.json({ ok: true });
});

/* ── Place search for the memory map ─────────────────────────────────── */

export const places = Router();

places.get('/', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(req.query);
  res.json({ places: await searchPlaces(q, 5) });
});
