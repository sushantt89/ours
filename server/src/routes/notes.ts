import type { AnyId } from '../models';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { Note, Media, type NoteDoc, type MediaDoc } from '../models';
import { assertOwnMedia, deleteMediaByIds, mediaJSON } from '../services/media';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { todayIn } from '../utils/dates';
import { owned } from '../utils/owned';
import { badRequest, forbidden, notFound } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();

const has = (list: unknown[] | undefined, id: unknown) => (list ?? []).some((x) => String(x) === String(id));

/** Whether this person is allowed to know the note exists at all. */
function canSee(note: NoteDoc, userId: AnyId) {
  const mine = String(note.authorId) === String(userId);
  if (note.audience === 'private') return mine;
  if (note.audience === 'shared') return true;
  return mine || Boolean(note.deliveredAt);
}

export function noteJSON(note: NoteDoc, userId: AnyId, media: Map<string, MediaDoc>) {
  const mine = String(note.authorId) === String(userId);
  const forMe = note.audience === 'partner' && !mine;
  const locked = forMe && Boolean(note.unlockAt && note.unlockAt > new Date());
  // "Open when…" letters stay sealed until the recipient chooses to open them.
  const sealed = forMe && note.kind === 'open_when' && !note.readAt;
  const hidden = locked || sealed;
  return {
    id: String(note._id),
    authorId: String(note.authorId),
    audience: note.audience,
    kind: note.kind,
    title: locked && note.kind === 'surprise' ? '' : note.title,
    body: hidden ? '' : note.body,
    emoji: note.emoji,
    color: note.color,
    media: hidden ? [] : note.mediaIds.map((id) => mediaJSON(media.get(String(id)))).filter(Boolean),
    hasMedia: note.mediaIds.length > 0,
    deliverAt: note.deliverAt ?? null,
    unlockAt: note.unlockAt ?? null,
    delivered: Boolean(note.deliveredAt),
    locked,
    sealed,
    mine,
    readAt: note.readAt ?? null,
    pinned: has(note.pinnedBy, userId),
    archived: has(note.archivedBy, userId),
    createdAt: note.get('createdAt'),
    updatedAt: note.get('updatedAt'),
  };
}

async function serialize(notes: NoteDoc[], userId: AnyId) {
  const ids = notes.flatMap((n) => n.mediaIds);
  const media = ids.length ? await Media.find({ _id: { $in: ids } }) : [];
  const map = new Map(media.map((m) => [String(m._id), m]));
  return notes.map((n) => noteJSON(n, userId, map));
}

export async function announceNote(note: NoteDoc, authorName: string, partnerId: AnyId, timezone: string) {
  const locked = note.unlockAt && note.unlockAt > new Date();
  const title =
    note.kind === 'open_when'
      ? `${authorName} left you an "open when" letter`
      : note.kind === 'surprise' || locked
        ? `${authorName} left you a surprise`
        : note.kind === 'daily'
          ? `Today's little message from ${authorName}`
          : `${authorName} left you a note`;
  await notify({
    userId: partnerId,
    coupleId: note.coupleId,
    type: 'note',
    emoji: note.emoji || '💌',
    title,
    body: note.kind === 'open_when' ? note.title : locked ? 'It unlocks soon…' : '',
    url: '/notes',
    dedupeKey: `note:${note._id}`,
    timezone,
  });
}

router.get('/', async (req, res) => {
  const notes = await Note.find({ coupleId: req.couple._id }).sort({ createdAt: -1 }).limit(500);
  const visible = notes.filter((n) => canSee(n, req.user._id));
  res.json({ notes: await serialize(visible, req.user._id) });
});

const noteSchema = z.object({
  audience: z.enum(['partner', 'shared', 'private']).default('partner'),
  kind: z.enum(['note', 'open_when', 'surprise', 'daily']).default('note'),
  title: z.string().trim().max(120).default(''),
  body: z.string().trim().max(10000).default(''),
  emoji: v.emoji.default('💌'),
  color: z.enum(['rose', 'peach', 'plum', 'sage', 'ocean', 'gold']).default('rose'),
  mediaIds: v.mediaIds.default([]),
  deliverAt: v.isoDate.nullish(),
  unlockAt: v.isoDate.nullish(),
});

function checkNote(body: z.infer<typeof noteSchema> | Partial<z.infer<typeof noteSchema>>, req: Request) {
  if (body.audience === 'partner' && !req.partnerId) throw badRequest("Your partner hasn't joined yet");
  if (body.kind === 'open_when' && body.title !== undefined && !body.title) {
    throw badRequest('Give the letter an "open when…" label');
  }
  if (body.kind === 'surprise' && body.unlockAt === null) throw badRequest('Choose when the surprise unlocks');
}

router.post('/', async (req, res) => {
  const body = noteSchema.parse(req.body);
  if (!body.body && !body.title && body.mediaIds.length === 0) throw badRequest('Write something first');
  if (body.kind === 'surprise' && !body.unlockAt) throw badRequest('Choose when the surprise unlocks');
  if (body.kind !== 'note' && body.audience !== 'partner') throw badRequest('That kind of note is for your partner');
  checkNote(body, req);
  await assertOwnMedia(req.couple._id, body.mediaIds);

  const now = new Date();
  const scheduled = body.audience === 'partner' && body.deliverAt && body.deliverAt > now;
  const dayKey = body.kind === 'daily' ? todayIn(req.couple.timezone) : undefined;
  if (dayKey) {
    // One "daily love" per person per day: writing a new one replaces the old.
    await Note.deleteMany({ coupleId: req.couple._id, authorId: req.user._id, kind: 'daily', dayKey });
  }
  const note = await Note.create({
    ...body,
    deliverAt: scheduled ? body.deliverAt : undefined,
    unlockAt: body.unlockAt ?? undefined,
    deliveredAt: body.audience === 'partner' && !scheduled ? now : undefined,
    dayKey,
    coupleId: req.couple._id,
    authorId: req.user._id,
  });

  if (note.deliveredAt && req.partnerId) void announceNote(note, req.user.name, req.partnerId, req.couple.timezone);
  if (note.audience !== 'private') {
    sync(req.couple._id, 'notes', 'dashboard');
    touchActivity(req.couple, req.user._id);
  }
  res.status(201).json({ note: (await serialize([note], req.user._id))[0] });
});

async function load(req: Request) {
  const note = await owned(Note, req, 'That note');
  if (!canSee(note, req.user._id)) throw notFound('That note');
  return note;
}

router.patch('/:id', async (req, res) => {
  const body = noteSchema.omit({ audience: true, kind: true }).partial().parse(req.body);
  const note = await load(req);
  const mine = note.authorId.equals(req.user._id);
  if (!mine && note.audience !== 'shared') throw forbidden('Only the author can edit this note');
  if (note.audience === 'partner' && note.readAt) throw badRequest('This note has already been read');
  checkNote({ ...body, kind: note.kind }, req);
  if (body.mediaIds) await assertOwnMedia(req.couple._id, body.mediaIds);

  const { deliverAt, unlockAt, ...rest } = body;
  Object.assign(note, rest);
  if (unlockAt !== undefined) note.unlockAt = unlockAt ?? undefined;
  if (deliverAt !== undefined && !note.deliveredAt) note.deliverAt = deliverAt ?? undefined;
  await note.save();
  if (note.audience !== 'private') sync(req.couple._id, 'notes', 'dashboard');
  res.json({ note: (await serialize([note], req.user._id))[0] });
});

/** The recipient opens a note: marks it read and unseals "open when…" letters. */
router.post('/:id/open', async (req, res) => {
  const note = await load(req);
  const forMe = note.audience === 'partner' && !note.authorId.equals(req.user._id);
  if (forMe && note.unlockAt && note.unlockAt > new Date()) throw forbidden("This one isn't ready to open yet");
  if (forMe && !note.readAt) {
    note.readAt = new Date();
    await note.save();
    sync(req.couple._id, 'notes', 'dashboard');
    if (note.kind === 'open_when') {
      await notify({
        userId: note.authorId,
        coupleId: note.coupleId,
        type: 'note',
        emoji: '💌',
        title: `${req.user.name} opened your letter`,
        body: note.title,
        url: '/notes',
      });
    }
  }
  res.json({ note: (await serialize([note], req.user._id))[0] });
});

router.post('/:id/flags', async (req, res) => {
  const body = z.object({ pinned: z.boolean().optional(), archived: z.boolean().optional() }).parse(req.body);
  const note = await load(req);
  const update: Record<string, unknown> = {};
  if (body.pinned !== undefined) update[body.pinned ? '$addToSet' : '$pull'] = { pinnedBy: req.user._id };
  if (body.archived !== undefined) {
    const op = body.archived ? '$addToSet' : '$pull';
    update[op] = { ...(update[op] as object), archivedBy: req.user._id };
  }
  const updated = await Note.findOneAndUpdate({ _id: note._id, coupleId: req.couple._id }, update, { returnDocument: 'after' });
  res.json({ note: (await serialize([updated!], req.user._id))[0] });
});

router.delete('/:id', async (req, res) => {
  const note = await load(req);
  if (!note.authorId.equals(req.user._id) && note.audience !== 'shared') {
    throw forbidden('Only the author can delete this note. You can archive it instead.');
  }
  await deleteMediaByIds(req.couple._id, note.mediaIds);
  await note.deleteOne();
  if (note.audience !== 'private') sync(req.couple._id, 'notes', 'dashboard');
  res.json({ ok: true });
});

export default router;
