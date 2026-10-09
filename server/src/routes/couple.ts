import { Router } from 'express';
import { z } from 'zod';
import {
  Couple,
  User,
  Media,
  Message,
  Memory,
  Nudge,
  Note,
  DateIdea,
  CalendarEvent,
  BucketListItem,
  DailyQuestion,
  ACCENTS,
} from '../models';
import { requireAuth, requireCouple } from '../middleware/auth';
import { joinLimiter, uploadLimiter } from '../middleware/rateLimit';
import { upload, saveUpload, deleteMedia } from '../services/media';
import { sessionJSON } from '../services/serialize';
import { leaveCouple, seedCouple } from '../services/couple';
import { notify } from '../services/notify';
import { sync, emitToCouple } from '../services/realtime';
import { loveStreak } from '../services/streak';
import { inviteCode } from '../utils/crypto';
import { todayIn } from '../utils/dates';
import { badRequest, conflict, notFound } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();

/** Lets someone holding an invite link see who invited them before they sign up. */
router.get('/invite/:code', joinLimiter, async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const couple = await Couple.findOne({ inviteCode: code, status: 'pending' });
  if (!couple) throw notFound('That invite');
  const inviter = await User.findById(couple.createdBy).select('name avatarId');
  res.json({
    inviterName: inviter?.name ?? 'Your partner',
    coupleName: couple.name,
  });
});

router.use(requireAuth);

async function uniqueInviteCode() {
  for (let i = 0; i < 5; i++) {
    const code = inviteCode();
    if (!(await Couple.exists({ inviteCode: code }))) return code;
  }
  throw new Error('Could not generate an invite code');
}

router.post('/', async (req, res) => {
  if (req.user.coupleId) throw conflict('You are already in a couple space', 'already_in_couple');
  const body = z
    .object({
      name: z.string().trim().max(60).default(''),
      startDate: v.dateOnly.optional(),
      timezone: v.timezone.default('UTC'),
    })
    .parse(req.body);
  if (body.startDate && body.startDate > todayIn(body.timezone)) {
    throw badRequest("Your start date can't be in the future");
  }
  const couple = await Couple.create({
    ...body,
    members: [req.user._id],
    createdBy: req.user._id,
    inviteCode: await uniqueInviteCode(),
  });
  req.user.coupleId = couple._id;
  await req.user.save();
  await seedCouple(couple, req.user._id);
  res.status(201).json(await sessionJSON(req.user, couple));
});

router.post('/join', joinLimiter, async (req, res) => {
  if (req.user.coupleId) throw conflict('You are already in a couple space', 'already_in_couple');
  const { code } = z.object({ code: z.string().trim().min(4).max(16) }).parse(req.body);

  // Atomic: the second seat can only ever be taken once, even if two people race for it.
  const couple = await Couple.findOneAndUpdate(
    { inviteCode: code.toUpperCase(), status: 'pending', members: { $size: 1, $ne: req.user._id } },
    { $push: { members: req.user._id }, $set: { status: 'active' }, $unset: { inviteCode: 1 } },
    { returnDocument: 'after' },
  );
  if (!couple) throw notFound('That invite code');

  req.user.coupleId = couple._id;
  await req.user.save();

  await notify({
    userId: couple.createdBy,
    coupleId: couple._id,
    type: 'partner',
    emoji: '🥂',
    title: `${req.user.name} joined your space`,
    body: 'Your private home for two is ready.',
    url: '/',
  });
  emitToCouple(couple._id, 'sync', { keys: ['session'] });
  res.json(await sessionJSON(req.user, couple));
});

router.use(requireCouple);

router.post('/invite/regenerate', async (req, res) => {
  if (req.couple.status !== 'pending') throw badRequest('Your partner has already joined');
  req.couple.inviteCode = await uniqueInviteCode();
  await req.couple.save();
  res.json(await sessionJSON(req.user, req.couple));
});

router.patch('/', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().max(60),
      description: z.string().trim().max(240),
      startDate: v.dateOnly.nullable(),
      theme: z.enum(ACCENTS),
      timezone: v.timezone,
      longDistance: z.boolean(),
      reunionDate: v.dateOnly.nullable(),
    })
    .partial()
    .parse(req.body);
  if (body.startDate && body.startDate > todayIn(body.timezone ?? req.couple.timezone)) {
    throw badRequest("Your start date can't be in the future");
  }
  const { startDate, reunionDate, ...rest } = body;
  Object.assign(req.couple, rest);
  if (startDate !== undefined) req.couple.startDate = startDate ?? undefined;
  if (reunionDate !== undefined) req.couple.reunionDate = reunionDate ?? undefined;
  await req.couple.save();
  sync(req.couple._id, 'session', 'dashboard', 'events');
  res.json(await sessionJSON(req.user, req.couple));
});

router.post('/photo/:slot', uploadLimiter, upload.single('file'), async (req, res) => {
  const slot = z.enum(['avatar', 'cover']).parse(req.params.slot);
  if (!req.file) throw badRequest('Choose a photo to upload');
  const field = slot === 'avatar' ? 'avatarId' : 'coverId';
  const previous = req.couple[field] ? await Media.findOne({ _id: req.couple[field], coupleId: req.couple._id }) : null;
  const media = await saveUpload(req, req.file, { purpose: slot, kinds: ['image'], couple: req.couple });
  req.couple[field] = media._id;
  await req.couple.save();
  await deleteMedia(previous);
  sync(req.couple._id, 'session');
  res.json(await sessionJSON(req.user, req.couple));
});

/* End-to-end encrypted chat. The server only ever stores public key-derivation parameters. */

router.post('/e2ee/keys', async (req, res) => {
  const body = z
    .object({
      keyId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
      salt: z.string().regex(/^[A-Za-z0-9+/=_-]{16,128}$/),
      iterations: z.number().int().min(100_000).max(5_000_000),
      verifier: z.string().min(20).max(500),
    })
    .parse(req.body);
  const keys = req.couple.e2ee!.keys;
  if (keys.some((k) => k.keyId === body.keyId)) throw badRequest('That key already exists');
  if (keys.length >= 10) throw badRequest('Too many passphrase changes. Turn encryption off and on again to reset.');
  keys.push({ ...body, createdBy: req.user._id });
  req.couple.e2ee!.enabled = true;
  await req.couple.save();
  sync(req.couple._id, 'session');
  if (req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'partner',
      emoji: '🔒',
      title: keys.length > 1 ? `${req.user.name} changed your chat passphrase` : `${req.user.name} turned on encrypted chat`,
      body: 'Enter your shared secret passphrase to read new messages.',
      url: '/chat',
    });
  }
  res.status(201).json(await sessionJSON(req.user, req.couple));
});

router.post('/e2ee/enabled', async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  if (enabled && !req.couple.e2ee?.keys.length) throw badRequest('Set a passphrase first');
  req.couple.e2ee!.enabled = enabled;
  await req.couple.save();
  sync(req.couple._id, 'session');
  res.json(await sessionJSON(req.user, req.couple));
});

router.post('/leave', async (req, res) => {
  z.object({ confirm: z.literal('LEAVE') }).parse(req.body);
  await leaveCouple(req.user);
  res.json(await sessionJSON(req.user, null));
});

/** Fun totals for the "Our story" page. */
router.get('/stats', async (req, res) => {
  const coupleId = req.couple._id;
  const today = todayIn(req.couple.timezone);
  const [messages, memories, nudges, notes, dateNights, trips, bucketDone, questions, streak] = await Promise.all([
    Message.countDocuments({ coupleId, deletedAt: null }),
    Memory.countDocuments({ coupleId, visibility: 'shared' }),
    Nudge.countDocuments({ coupleId }),
    Note.countDocuments({ coupleId, audience: 'partner' }),
    DateIdea.countDocuments({ coupleId, status: 'done' }),
    CalendarEvent.countDocuments({ coupleId, type: 'trip', date: { $lte: today } }),
    BucketListItem.countDocuments({ coupleId, done: true }),
    DailyQuestion.countDocuments({ coupleId, 'answers.1': { $exists: true } }),
    loveStreak(req.couple),
  ]);
  res.json({ messages, memories, nudges, notes, dateNights, trips, bucketDone, questions, streak: streak.days });
});

export default router;
