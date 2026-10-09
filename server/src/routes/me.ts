import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Media, NOTIFICATION_TYPES, LOVE_LANGUAGES, PushSubscription, Notification, Mood } from '../models';
import { requireAuth } from '../middleware/auth';
import { authLimiter, uploadLimiter } from '../middleware/rateLimit';
import { upload, saveUpload, deleteMedia } from '../services/media';
import { sessionJSON, selfJSON } from '../services/serialize';
import { leaveCouple } from '../services/couple';
import { endAllSessions, endSession, startSession } from '../services/tokens';
import { sync } from '../services/realtime';
import { hashPassword } from './auth';
import { badRequest, unauthorized } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await sessionJSON(req.user));
});

const prefsShape = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, z.boolean()]));

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    birthday: v.dateOnly.nullable(),
    timezone: v.timezone,
    loveLanguages: z.array(z.enum(LOVE_LANGUAGES)).max(5),
    privacy: z
      .object({
        showOnline: z.boolean(),
        showLastSeen: z.boolean(),
        readReceipts: z.boolean(),
        shareMood: z.boolean(),
        memoryDefault: z.enum(['shared', 'private']),
      })
      .partial(),
    notificationPrefs: z
      .object({
        push: z.boolean(),
        ...prefsShape,
        quietHours: z
          .object({ enabled: z.boolean(), start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
          .partial(),
      })
      .partial(),
    dashboard: z.object({ order: z.array(z.string().max(30)).max(30), hidden: z.array(z.string().max(30)).max(30) }),
  })
  .partial();

router.patch('/', async (req, res) => {
  const body = patchSchema.parse(req.body);
  const user = req.user;
  if (body.name !== undefined) user.name = body.name;
  if (body.birthday !== undefined) user.birthday = body.birthday ?? undefined;
  if (body.timezone !== undefined) user.timezone = body.timezone;
  if (body.loveLanguages !== undefined) user.loveLanguages = [...new Set(body.loveLanguages)];
  if (body.privacy) Object.assign(user.privacy!, body.privacy);
  if (body.notificationPrefs) {
    const { quietHours, ...rest } = body.notificationPrefs;
    Object.assign(user.notificationPrefs!, rest);
    if (quietHours) Object.assign(user.notificationPrefs!.quietHours!, quietHours);
  }
  if (body.dashboard) user.dashboard = body.dashboard;
  await user.save();
  if (user.coupleId) sync(user.coupleId, 'session');
  res.json({ user: selfJSON(user) });
});

router.post('/avatar', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a photo to upload');
  const previous = req.user.avatarId ? await Media.findOne({ _id: req.user.avatarId, ownerId: req.user._id }) : null;
  const media = await saveUpload(req, req.file, { purpose: 'avatar', kinds: ['image'] });
  req.user.avatarId = media._id;
  await req.user.save();
  await deleteMedia(previous);
  if (req.user.coupleId) sync(req.user.coupleId, 'session');
  res.json({ user: selfJSON(req.user) });
});

router.post('/password', authLimiter, async (req, res) => {
  const body = z.object({ current: z.string().max(128).optional(), next: v.password }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw unauthorized();
  if (user.passwordHash) {
    const ok = await bcrypt.compare(body.current ?? '', user.passwordHash);
    if (!ok) throw badRequest('Your current password is incorrect', 'bad_password');
  }
  user.passwordHash = await hashPassword(body.next);
  await user.save();
  // Sign out everywhere else, then keep this device signed in.
  await endAllSessions(String(user._id));
  const accessToken = await startSession(req, res, String(user._id));
  res.json({ ok: true, accessToken });
});

router.delete('/', authLimiter, async (req, res) => {
  const body = z.object({ password: z.string().max(128).optional(), confirm: z.literal('DELETE') }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw unauthorized();
  if (user.passwordHash) {
    const ok = await bcrypt.compare(body.password ?? '', user.passwordHash);
    if (!ok) throw badRequest('Your password is incorrect', 'bad_password');
  }
  await leaveCouple(user);
  const avatar = user.avatarId ? await Media.findById(user.avatarId) : null;
  await deleteMedia(avatar);
  await Promise.all([
    PushSubscription.deleteMany({ userId: user._id }),
    Notification.deleteMany({ userId: user._id }),
    Mood.deleteMany({ userId: user._id }),
    endAllSessions(String(user._id)),
  ]);
  await endSession(req, res);
  await user.deleteOne();
  res.json({ ok: true });
});

export default router;
