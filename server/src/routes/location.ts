import { Router, type Request } from 'express';
import { z } from 'zod';
import { Location } from '../models';
import { notify } from '../services/notify';
import { emitToUser, sync } from '../services/realtime';
import { badRequest, HttpError } from '../utils/http';

/**
 * Locate my partner. Each person decides for themselves whether to share; nobody can turn
 * on someone else's sharing. The server keeps only the latest position and forgets it as
 * soon as sharing stops.
 */
const router = Router();

export const REQUEST_COOLDOWN_MS = 5 * 60_000;

type LocationDoc = InstanceType<typeof Location>;

/** Sharing that has passed its end time counts as off (and is cleaned up). */
function isSharing(doc: LocationDoc | null): boolean {
  return Boolean(doc?.sharing && (!doc.until || doc.until.getTime() > Date.now()));
}

function view(doc: LocationDoc | null) {
  const sharing = isSharing(doc);
  return {
    sharing,
    until: sharing ? (doc!.until?.toISOString() ?? null) : null,
    position: sharing && doc!.lat != null && doc!.lng != null ? { lat: doc!.lat, lng: doc!.lng, accuracy: doc!.accuracy ?? null, at: doc!.at!.toISOString() } : null,
  };
}

const mine = (req: Request) => Location.findOne({ userId: req.user._id, coupleId: req.couple._id });
const partners = (req: Request) => (req.partnerId ? Location.findOne({ userId: req.partnerId, coupleId: req.couple._id }) : null);

/** Turns sharing off and forgets the position. */
async function stop(doc: LocationDoc) {
  doc.set({ sharing: false, until: null, lat: undefined, lng: undefined, accuracy: undefined, at: undefined });
  await doc.save();
}

router.get('/', async (req, res) => {
  const [me, partner] = await Promise.all([mine(req), partners(req)]);
  if (me?.sharing && !isSharing(me)) await stop(me);
  res.json({
    me: view(me),
    partner: view(partner),
    canRequestAt: me?.requestedAt ? new Date(me.requestedAt.getTime() + REQUEST_COOLDOWN_MS).toISOString() : null,
  });
});

router.put('/sharing', async (req, res) => {
  const body = z
    .object({
      sharing: z.boolean(),
      /** Minutes until it stops by itself; null shares until turned off. */
      minutes: z.union([z.literal(60), z.literal(480), z.literal(1440), z.null()]).default(60),
    })
    .parse(req.body);
  const doc = (await mine(req)) ?? new Location({ userId: req.user._id, coupleId: req.couple._id });
  const wasSharing = isSharing(doc);
  if (body.sharing) {
    doc.set({ sharing: true, until: body.minutes ? new Date(Date.now() + body.minutes * 60_000) : null });
    await doc.save();
  } else {
    await stop(doc);
  }
  if (req.partnerId && body.sharing && !wasSharing) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'location',
      emoji: '📍',
      title: `${req.user.name} is sharing their location with you`,
      url: '/locate',
      timezone: req.couple.timezone,
    });
  }
  sync(req.couple._id, 'location');
  res.json({ me: view(doc) });
});

router.post('/update', async (req, res) => {
  const body = z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100_000).optional(),
    })
    .parse(req.body);
  const doc = await mine(req);
  if (!doc || !isSharing(doc)) {
    if (doc?.sharing) await stop(doc);
    throw new HttpError(409, 'Location sharing is off', 'not_sharing');
  }
  doc.set({ lat: body.lat, lng: body.lng, accuracy: body.accuracy ?? null, at: new Date() });
  await doc.save();
  if (req.partnerId) emitToUser(req.partnerId, 'location', { userId: String(req.user._id), ...view(doc) });
  res.json({ me: view(doc) });
});

/** Asks the partner to share. Limited to once every few minutes so it can't become nagging. */
router.post('/request', async (req, res) => {
  if (!req.partnerId) throw badRequest("Your partner hasn't joined yet");
  const doc = (await mine(req)) ?? new Location({ userId: req.user._id, coupleId: req.couple._id });
  if (doc.requestedAt && Date.now() - doc.requestedAt.getTime() < REQUEST_COOLDOWN_MS) {
    throw new HttpError(429, 'You asked a moment ago. Give them a few minutes.', 'request_cooldown');
  }
  doc.requestedAt = new Date();
  await doc.save();
  await notify({
    userId: req.partnerId,
    coupleId: req.couple._id,
    type: 'location',
    emoji: '📍',
    title: `${req.user.name} would like to see where you are`,
    body: 'Tap to share your location, or ignore this.',
    url: '/locate?asked=1',
    timezone: req.couple.timezone,
  });
  res.json({ canRequestAt: new Date(doc.requestedAt.getTime() + REQUEST_COOLDOWN_MS).toISOString() });
});

/** Clears sharing that has run past its end time (called by the scheduler). */
export async function expireLocationSharing(now = new Date()) {
  const expired = await Location.find({ sharing: true, until: { $ne: null, $lte: now } });
  for (const doc of expired) {
    await stop(doc);
    sync(doc.coupleId, 'location');
  }
}

export default router;
