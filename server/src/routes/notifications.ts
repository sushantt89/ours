import { Router } from 'express';
import { z } from 'zod';
import { Notification, PushSubscription } from '../models';
import { env } from '../config/env';
import { sendPush } from '../services/push';
import { emitToUser } from '../services/realtime';
import { badRequest } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();

router.get('/', async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(80),
    Notification.countDocuments({ userId: req.user._id, readAt: null }),
  ]);
  res.json({ notifications: items, unread });
});

router.post('/read', async (req, res) => {
  const { ids } = z.object({ ids: z.array(v.objectId).max(100).optional() }).parse(req.body ?? {});
  await Notification.updateMany(
    { userId: req.user._id, readAt: null, ...(ids ? { _id: { $in: ids } } : {}) },
    { $set: { readAt: new Date() } },
  );
  emitToUser(req.user._id, 'sync', { keys: ['notifications'] });
  res.json({ ok: true });
});

router.delete('/', async (req, res) => {
  await Notification.deleteMany({ userId: req.user._id });
  res.json({ ok: true });
});

/* Web push subscriptions: one per browser/device. */

const subscription = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith('https://'), 'Invalid push endpoint'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

router.post('/push/subscribe', async (req, res) => {
  if (!env.pushEnabled) throw badRequest('Push notifications are not configured on this server', 'push_disabled');
  const body = subscription.parse(req.body);
  await PushSubscription.findOneAndUpdate(
    { endpoint: body.endpoint },
    { ...body, userId: req.user._id, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200) },
    { upsert: true },
  );
  res.status(201).json({ ok: true });
});

router.post('/push/unsubscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
  await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  res.json({ ok: true });
});

router.post('/push/test', async (req, res) => {
  if (!env.pushEnabled) throw badRequest('Push notifications are not configured on this server', 'push_disabled');
  const count = await PushSubscription.countDocuments({ userId: req.user._id });
  if (!count) throw badRequest('This device is not subscribed yet');
  await sendPush(req.user._id, { title: '💌 It works', body: 'This is how notifications from Ours will look.', url: '/', tag: 'test' });
  res.json({ ok: true });
});

export default router;
