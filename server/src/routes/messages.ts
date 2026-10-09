import type { AnyId } from '../models';
import { Router } from 'express';
import { z } from 'zod';
import { Message, Media, User, type MessageDoc, type MediaDoc } from '../models';
import { uploadLimiter } from '../middleware/rateLimit';
import { upload, saveUpload, mediaJSON, deleteMedia } from '../services/media';
import { notify } from '../services/notify';
import { emitToCouple, emitToUser } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { escapeRegex } from '../utils/crypto';
import { badRequest, forbidden, notFound } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();

type Populated = Omit<MessageDoc, 'mediaId' | 'replyTo'> & {
  mediaId?: MediaDoc | null;
  replyTo?: (MessageDoc & { mediaId?: unknown }) | null;
};

const PREVIEW: Record<string, string> = {
  image: '📷 Photo',
  video: '🎬 Video',
  audio: '🎤 Voice message',
  gif: 'GIF',
  sticker: 'Sticker',
  encrypted: '🔒 Encrypted message',
  call: '📞 Call',
};

export const previewOf = (m: { type: string; text?: string | null; deletedAt?: Date | null; call?: { kind?: string | null; status?: string | null } | null }) =>
  m.deletedAt
    ? 'Message deleted'
    : m.type === 'call'
      ? `${m.call?.status === 'missed' ? 'Missed' : m.call?.status === 'declined' ? 'Declined' : ''} ${m.call?.kind === 'video' ? 'video call' : 'call'}`.trim().replace(/^./, (c) => c.toUpperCase())
      : m.type === 'encrypted'
        ? PREVIEW.encrypted
        : m.type === 'sticker'
          ? m.text || 'Sticker'
          : m.text || PREVIEW[m.type] || '';

/** `showRead` is false when the reader has turned read receipts off. */
export function messageJSON(doc: MessageDoc, viewerId: AnyId, showRead: boolean) {
  const m = doc as unknown as Populated;
  const deleted = Boolean(m.deletedAt);
  const mine = String(m.senderId) === String(viewerId);
  const reply = m.replyTo && typeof m.replyTo === 'object' && 'senderId' in m.replyTo ? m.replyTo : null;
  return {
    id: String(m._id),
    senderId: String(m.senderId),
    type: m.type,
    text: deleted ? '' : m.text,
    media: deleted ? null : mediaJSON(m.mediaId && 'key' in m.mediaId ? m.mediaId : null),
    gif: deleted || !m.gif?.url ? null : m.gif,
    cipher: deleted || m.type !== 'encrypted' ? null : { keyId: m.cipher?.keyId, iv: m.cipher?.iv, data: m.cipher?.data },
    call: m.type === 'call' ? { kind: m.call?.kind, status: m.call?.status, duration: m.call?.duration ?? 0 } : null,
    replyTo: reply ? { id: String(reply._id), senderId: String(reply.senderId), preview: previewOf(reply) } : null,
    reactions: deleted ? [] : m.reactions.map((r) => ({ userId: String(r.userId), emoji: r.emoji })),
    pinned: m.pinned,
    readAt: mine && !showRead ? null : (m.readAt ?? null),
    editedAt: m.editedAt ?? null,
    deleted,
    clientId: m.clientId,
    createdAt: m.get('createdAt'),
  };
}

const populate = (q: any) => q.populate('mediaId').populate({ path: 'replyTo', select: 'senderId type text deletedAt call' });

/** Posts a message on the server's behalf (e.g. a call log) to both partners. */
export async function postSystemMessage(coupleId: AnyId, senderId: AnyId, members: AnyId[], fields: Record<string, unknown>) {
  const doc = await Message.create({ coupleId, senderId, ...fields });
  const full = (await populate(Message.findById(doc._id))) as MessageDoc;
  for (const member of members) emitToUser(member, 'message:new', messageJSON(full, member, true));
  return doc;
}

async function partnerShowsReads(partnerId: AnyId | undefined) {
  if (!partnerId) return true;
  const partner = await User.findById(partnerId).select('privacy.readReceipts');
  return partner?.privacy?.readReceipts !== false;
}

/** Sends a message event to each partner with their own view of read state. */
async function broadcast(req: any, event: string, doc: MessageDoc) {
  const full = (await populate(Message.findById(doc._id))) as MessageDoc;
  const [partnerShows, iShow] = [await partnerShowsReads(req.partnerId), req.user.privacy?.readReceipts !== false];
  const forMe = messageJSON(full, req.user._id, partnerShows);
  emitToUser(req.user._id, event, forMe);
  if (req.partnerId) emitToUser(req.partnerId, event, messageJSON(full, req.partnerId, iShow));
  return forMe;
}

router.get('/', async (req, res) => {
  const query = z
    .object({
      before: z.iso.datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
      q: z.string().trim().min(1).max(80).optional(),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = { coupleId: req.couple._id };
  if (query.before) filter.createdAt = { $lt: new Date(query.before) };
  if (query.q) {
    // Encrypted messages can't be searched here; the app searches those on the device.
    filter.text = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.deletedAt = null;
  }
  const docs = (await populate(Message.find(filter).sort({ createdAt: -1 }).limit(query.limit + 1))) as MessageDoc[];
  const hasMore = docs.length > query.limit;
  const showRead = await partnerShowsReads(req.partnerId);
  res.json({
    messages: docs
      .slice(0, query.limit)
      .reverse()
      .map((m) => messageJSON(m, req.user._id, showRead)),
    hasMore,
  });
});

router.get('/pinned', async (req, res) => {
  const docs = (await populate(
    Message.find({ coupleId: req.couple._id, pinned: true, deletedAt: null }).sort({ createdAt: -1 }).limit(50),
  )) as MessageDoc[];
  res.json({ messages: docs.map((m) => messageJSON(m, req.user._id, true)) });
});

router.post('/upload', uploadLimiter, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0];
  if (!file) throw badRequest('Choose something to send');
  const encrypted = req.body?.encrypted === '1';
  if (req.couple.e2ee?.enabled && !encrypted) throw badRequest('Encrypted chat is on. Update the app and try again.', 'e2ee_required');
  const media = await saveUpload(req, file, {
    opaque: encrypted,
    purpose: 'chat',
    kinds: ['image', 'video', 'audio'],
    couple: req.couple,
    poster: files?.poster?.[0],
    duration: Number(req.body?.duration) || undefined,
  });
  res.status(201).json({ media: mediaJSON(media) });
});

const sendSchema = z
  .object({
    type: z.enum(['text', 'image', 'video', 'audio', 'gif', 'sticker', 'encrypted']).default('text'),
    cipher: z
      .object({
        keyId: z.string().max(64),
        iv: z.string().regex(/^[A-Za-z0-9+/=_-]{12,64}$/),
        data: z.string().max(200_000),
      })
      .optional(),
    text: z.string().trim().max(4000).default(''),
    mediaId: v.objectId.optional(),
    gif: z
      .object({
        url: z.url().max(600).refine((u) => /^https:\/\/[a-z0-9-]+\.giphy\.com\//.test(u), 'Unsupported GIF source'),
        preview: z.url().max(600).optional(),
        width: z.number().positive().max(4000).optional(),
        height: z.number().positive().max(4000).optional(),
      })
      .optional(),
    replyTo: v.objectId.optional(),
    clientId: z.string().max(64).optional(),
  })
  .superRefine((m, ctx) => {
    if ((m.type === 'text' || m.type === 'sticker') && !m.text) ctx.addIssue({ code: 'custom', message: 'Write a message first' });
    if (['image', 'video', 'audio'].includes(m.type) && !m.mediaId) ctx.addIssue({ code: 'custom', message: 'Attachment missing' });
    if (m.type === 'gif' && !m.gif) ctx.addIssue({ code: 'custom', message: 'GIF missing' });
    if (m.type === 'encrypted' && (!m.cipher || m.text || m.gif)) ctx.addIssue({ code: 'custom', message: 'Encrypted messages carry only ciphertext' });
  });

router.post('/', async (req, res) => {
  if (req.couple.status === 'ended') throw forbidden('This space is read-only because your partner has left');
  const body = sendSchema.parse(req.body);
  const e2ee = req.couple.e2ee;
  if (e2ee?.enabled && body.type !== 'encrypted') {
    throw badRequest('Encrypted chat is on. Unlock it with your passphrase to send messages.', 'e2ee_required');
  }
  if (body.type === 'encrypted' && !e2ee?.keys.some((k) => k.keyId === body.cipher!.keyId)) {
    throw badRequest('That encryption key is unknown. Refresh and try again.', 'e2ee_key');
  }

  if (body.mediaId) {
    const media = await Media.findOne({ _id: body.mediaId, coupleId: req.couple._id, purpose: 'chat' });
    const expected = body.type === 'encrypted' ? 'encrypted' : body.type;
    if (!media || media.kind !== expected) throw badRequest('That attachment could not be found');
  }
  if (body.replyTo && !(await Message.exists({ _id: body.replyTo, coupleId: req.couple._id }))) {
    throw badRequest('The message you replied to no longer exists');
  }

  const doc = await Message.create({ ...body, coupleId: req.couple._id, senderId: req.user._id });
  const json = await broadcast(req, 'message:new', doc);
  touchActivity(req.couple, req.user._id);

  if (req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'message',
      emoji: '💬',
      title: req.user.name,
      body: previewOf(doc).slice(0, 140),
      url: '/chat',
      transient: true,
    });
  }
  res.status(201).json({ message: json });
});

async function findMessage(req: any) {
  const doc = await Message.findOne({ _id: v.objectId.parse(req.params.id), coupleId: req.couple._id });
  if (!doc || doc.deletedAt) throw notFound('That message');
  return doc;
}

router.patch('/:id', async (req, res) => {
  const body = z
    .object({
      text: z.string().trim().min(1).max(4000).optional(),
      cipher: z.object({ keyId: z.string().max(64), iv: z.string().max(64), data: z.string().max(200_000) }).optional(),
    })
    .parse(req.body);
  const doc = await findMessage(req);
  if (!doc.senderId.equals(req.user._id)) throw forbidden('You can only edit your own messages');
  if (doc.type === 'encrypted') {
    if (!body.cipher || !req.couple.e2ee?.keys.some((k) => k.keyId === body.cipher!.keyId)) throw badRequest('Send the edited message encrypted');
    doc.set('cipher', body.cipher);
  } else if (doc.type === 'text' && body.text) {
    doc.text = body.text;
  } else {
    throw badRequest('Only text messages can be edited');
  }
  doc.editedAt = new Date();
  await doc.save();
  res.json({ message: await broadcast(req, 'message:update', doc) });
});

router.delete('/:id', async (req, res) => {
  const doc = await findMessage(req);
  if (!doc.senderId.equals(req.user._id)) throw forbidden('You can only delete your own messages');
  const media = doc.mediaId ? await Media.findOne({ _id: doc.mediaId, coupleId: req.couple._id }) : null;
  doc.set({ text: '', mediaId: undefined, gif: undefined, cipher: undefined, reactions: [], pinned: false, deletedAt: new Date() });
  await doc.save();
  await deleteMedia(media);
  res.json({ message: await broadcast(req, 'message:update', doc) });
});

router.post('/:id/react', async (req, res) => {
  const { emoji } = z.object({ emoji: v.emoji }).parse(req.body);
  const doc = await findMessage(req);
  const mine = doc.reactions.find((r) => r.userId.equals(req.user._id));
  const same = mine?.emoji === emoji;
  doc.reactions.pull({ userId: req.user._id });
  if (!same) doc.reactions.push({ userId: req.user._id, emoji });
  await doc.save();
  res.json({ message: await broadcast(req, 'message:update', doc) });
});

router.post('/:id/pin', async (req, res) => {
  const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);
  const doc = await findMessage(req);
  doc.pinned = pinned;
  await doc.save();
  res.json({ message: await broadcast(req, 'message:update', doc) });
});

router.post('/read', async (req, res) => {
  const at = new Date();
  const result = await Message.updateMany(
    { coupleId: req.couple._id, senderId: { $ne: req.user._id }, readAt: null },
    { $set: { readAt: at } },
  );
  if (result.modifiedCount > 0) {
    emitToUser(req.user._id, 'message:read', { readerId: String(req.user._id), at });
    // Only tell the sender if this person shares read receipts.
    if (req.partnerId && req.user.privacy?.readReceipts !== false) {
      emitToUser(req.partnerId, 'message:read', { readerId: String(req.user._id), at });
    }
  }
  res.json({ ok: true, updated: result.modifiedCount });
});

export const unreadCount = (coupleId: AnyId, userId: AnyId) =>
  Message.countDocuments({ coupleId, senderId: { $ne: userId }, readAt: null, deletedAt: null });

router.get('/unread', async (req, res) => {
  res.json({ count: await unreadCount(req.couple._id, req.user._id) });
});

export default router;
