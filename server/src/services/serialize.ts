import { Couple, Mood, User, type UserDoc, type CoupleDoc } from '../models';
import { env } from '../config/env';
import { isOnline } from './realtime';

const mediaUrl = (id: unknown, thumb = true) => (id ? `/api/media/${id}${thumb ? '?thumb=1' : ''}` : null);

/** The signed-in person's own profile, including their private settings. */
export function selfJSON(user: UserDoc) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    avatarUrl: mediaUrl(user.avatarId),
    birthday: user.birthday ?? null,
    timezone: user.timezone ?? 'UTC',
    loveLanguages: user.loveLanguages ?? [],
    emailVerified: user.emailVerified,
    hasGoogle: Boolean(user.googleId),
    coupleId: user.coupleId ? String(user.coupleId) : null,
    status: user.status?.at ? user.status : null,
    privacy: user.privacy,
    notificationPrefs: user.notificationPrefs,
    dashboard: user.dashboard,
    createdAt: user.get('createdAt'),
  };
}

/** What one partner may see about the other. Honours the other person's privacy settings. */
export async function partnerJSON(partner: UserDoc | null) {
  if (!partner) return null;
  const privacy = partner.privacy!;
  const mood = privacy.shareMood
    ? await Mood.findOne({ coupleId: partner.coupleId, userId: partner._id }).sort({ createdAt: -1 }).lean()
    : null;
  const moodFresh = mood && Date.now() - new Date(mood.createdAt as unknown as Date).getTime() < 24 * 3600 * 1000;
  return {
    id: String(partner._id),
    name: partner.name,
    avatarUrl: mediaUrl(partner.avatarId),
    birthday: partner.birthday ?? null,
    timezone: partner.timezone ?? 'UTC',
    loveLanguages: partner.loveLanguages ?? [],
    online: privacy.showOnline ? isOnline(partner._id) : null,
    lastSeenAt: privacy.showLastSeen ? (partner.lastSeenAt ?? null) : null,
    status: partner.status?.at ? partner.status : null,
    mood: moodFresh ? { emoji: mood.emoji, label: mood.label, note: mood.note, at: mood.createdAt } : null,
    sharesMood: privacy.shareMood,
  };
}

export function coupleJSON(couple: CoupleDoc) {
  return {
    id: String(couple._id),
    name: couple.name,
    description: couple.description,
    status: couple.status,
    startDate: couple.startDate ?? null,
    theme: couple.theme,
    timezone: couple.timezone,
    storage: couple.storage,
    avatarUrl: mediaUrl(couple.avatarId),
    coverUrl: mediaUrl(couple.coverId, false),
    inviteCode: couple.status === 'pending' ? couple.inviteCode : null,
    inviteLink: couple.status === 'pending' ? `${env.CLIENT_URL}/join/${couple.inviteCode}` : null,
    customNudges: couple.customNudges.map((n) => ({ id: String(n._id), emoji: n.emoji, text: n.text })),
    longDistance: couple.longDistance ?? false,
    reunionDate: couple.reunionDate ?? null,
    e2ee: {
      enabled: couple.e2ee?.enabled ?? false,
      // Public parameters only. The passphrase and the key never reach the server.
      keys: (couple.e2ee?.keys ?? []).map((k) => ({ keyId: k.keyId, salt: k.salt, iterations: k.iterations, verifier: k.verifier, createdAt: k.createdAt })),
    },
    memberCount: couple.members.length,
    createdAt: couple.get('createdAt'),
  };
}

/** Everything the app needs to boot for a signed-in user. */
export async function sessionJSON(user: UserDoc, couple?: CoupleDoc | null) {
  if (couple === undefined) {
    couple = user.coupleId ? await Couple.findById(user.coupleId) : null;
  }
  const partnerId = couple?.members.find((m) => !m.equals(user._id));
  const partner = partnerId ? await User.findById(partnerId) : null;
  return {
    user: selfJSON(user),
    couple: couple ? coupleJSON(couple) : null,
    partner: await partnerJSON(partner),
  };
}
