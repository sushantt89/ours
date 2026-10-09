import { Router } from 'express';
import { z } from 'zod';
import { Nudge } from '../models';
import { nudgeLimiter } from '../middleware/rateLimit';
import { notify } from '../services/notify';
import { emitToUser, sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { coupleJSON } from '../services/serialize';
import { badRequest, notFound } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();
const nudgeSchema = z.object({ emoji: v.emoji, text: z.string().trim().min(1).max(60) });
const sendSchema = nudgeSchema.extend({ gif: v.gif.optional(), deliverAt: v.isoDate.optional() });

/** Delivers a nudge now: the animation, the notification, and the activity streak. */
export async function deliverNudge(nudge: InstanceType<typeof Nudge>, fromName: string, timezone: string) {
  emitToUser(nudge.toId, 'nudge', { ...nudge.toJSON(), fromName });
  sync(nudge.coupleId, 'nudges', 'dashboard');
  await notify({
    userId: nudge.toId,
    coupleId: nudge.coupleId,
    type: 'nudge',
    emoji: nudge.emoji,
    title: nudge.text,
    body: `From ${fromName}`,
    url: '/nudges',
    image: nudge.gif?.url ?? undefined,
    timezone,
  });
}

/** The nudge history only shows the last day; older nudges drop off (they still count in the year-in-review). */
export const HISTORY_MS = 24 * 3600 * 1000;
const deliveredSince = (since: Date) => ({
  $or: [
    { deliverAt: null, createdAt: { $gte: since } },
    { deliveredAt: { $gte: since } },
  ],
});

router.get('/', async (req, res) => {
  const [recent, scheduled] = await Promise.all([
    Nudge.find({ coupleId: req.couple._id, ...deliveredSince(new Date(Date.now() - HISTORY_MS)) }).sort({ createdAt: -1 }).limit(40),
    // Only the sender knows about a nudge that hasn't gone out yet.
    Nudge.find({ coupleId: req.couple._id, fromId: req.user._id, deliverAt: { $ne: null }, deliveredAt: null }).sort({ deliverAt: 1 }),
  ]);
  res.json({ recent, scheduled });
});

router.post('/', nudgeLimiter, async (req, res) => {
  const body = sendSchema.parse(req.body);
  if (!req.partnerId) throw badRequest("Your partner hasn't joined yet");
  if (body.deliverAt) {
    const ahead = body.deliverAt.getTime() - Date.now();
    if (ahead < 30_000 || ahead > 7 * 86400_000) throw badRequest('Schedule it between a minute and a week from now');
    const nudge = await Nudge.create({ ...body, coupleId: req.couple._id, fromId: req.user._id, toId: req.partnerId });
    return res.status(201).json({ nudge });
  }
  const nudge = await Nudge.create({ ...body, coupleId: req.couple._id, fromId: req.user._id, toId: req.partnerId });
  await deliverNudge(nudge, req.user.name, req.couple.timezone);
  touchActivity(req.couple, req.user._id);
  res.status(201).json({ nudge });
});

router.delete('/scheduled/:id', async (req, res) => {
  const nudge = await Nudge.findOne({ _id: v.objectId.parse(req.params.id), coupleId: req.couple._id, fromId: req.user._id, deliveredAt: null, deliverAt: { $ne: null } });
  if (!nudge) throw notFound('That scheduled nudge');
  await nudge.deleteOne();
  res.json({ ok: true });
});

/** "Thinking of you" style status: shown on the partner's home screen until replaced. */
router.post('/status', nudgeLimiter, async (req, res) => {
  const body = nudgeSchema.parse(req.body);
  req.user.status = { ...body, at: new Date() };
  await req.user.save();
  if (req.partnerId) {
    await Nudge.create({ ...body, kind: 'status', coupleId: req.couple._id, fromId: req.user._id, toId: req.partnerId });
    emitToUser(req.partnerId, 'nudge', { ...body, kind: 'status', fromName: req.user.name });
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'nudge',
      emoji: body.emoji,
      title: `${req.user.name}: ${body.text}`,
      url: '/',
    });
  }
  sync(req.couple._id, 'session', 'dashboard', 'nudges');
  touchActivity(req.couple, req.user._id);
  res.json({ status: req.user.status });
});

router.delete('/status', async (req, res) => {
  req.user.status = undefined;
  await req.user.save();
  sync(req.couple._id, 'session', 'dashboard');
  res.json({ ok: true });
});

router.post('/custom', async (req, res) => {
  const body = nudgeSchema.parse(req.body);
  if (req.couple.customNudges.length >= 30) throw badRequest('You can save up to 30 custom nudges');
  req.couple.customNudges.push(body);
  await req.couple.save();
  sync(req.couple._id, 'session');
  res.status(201).json({ couple: coupleJSON(req.couple) });
});

router.delete('/custom/:id', async (req, res) => {
  const item = req.couple.customNudges.id(String(req.params.id));
  if (!item) throw notFound('That nudge');
  item.deleteOne();
  await req.couple.save();
  sync(req.couple._id, 'session');
  res.json({ couple: coupleJSON(req.couple) });
});

export default router;
