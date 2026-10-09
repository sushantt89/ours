import type { AnyId } from '../models';
import { Notification, User, type NotificationCategory } from '../models';
import { emitToUser, isLooking } from './realtime';
import { sendPush } from './push';
import { hourIn } from '../utils/dates';

export type NotificationType =
  | 'message'
  | 'nudge'
  | 'note'
  | 'memory'
  | 'calendar'
  | 'milestone'
  | 'list'
  | 'countdown'
  | 'reminder'
  | 'question'
  | 'partner'
  | 'song'
  | 'game'
  | 'journal'
  | 'call'
  | 'recap';

/** Which user preference switch governs each notification type. */
const CATEGORY: Record<NotificationType, NotificationCategory | null> = {
  message: 'messages',
  nudge: 'nudges',
  note: 'notes',
  memory: 'memories',
  calendar: 'calendar',
  milestone: 'anniversaries',
  list: 'lists',
  countdown: 'calendar',
  reminder: 'reminders',
  question: 'questions',
  partner: null, // always delivered
  song: 'songs',
  game: 'games',
  journal: 'journal',
  call: 'calls',
  recap: 'anniversaries',
};

/** Time-sensitive types that are allowed through quiet hours. */
const URGENT: NotificationType[] = ['message', 'nudge', 'partner', 'call'];

export interface NotifyInput {
  userId: AnyId;
  coupleId?: AnyId;
  type: NotificationType;
  title: string;
  body?: string;
  emoji?: string;
  url?: string;
  /** A picture shown in the push notification where the platform supports it (Android, Windows). */
  image?: string;
  /** When set, the same key is never delivered twice to the same person. */
  dedupeKey?: string;
  /** Skip the in-app feed entry (used for chat, which has its own unread badge). */
  transient?: boolean;
  timezone?: string;
}

function inQuietHours(hour: number, start: number, end: number) {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Central notification pipeline: preference check → in-app feed → realtime → web push.
 * Returns false when the user has opted out or the notification was already sent.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const user = await User.findById(input.userId).select('notificationPrefs');
  if (!user) return false;
  const prefs = user.notificationPrefs!;
  const category = CATEGORY[input.type];
  if (category && (prefs as Record<string, unknown>)[category] === false) return false;

  const doc = {
    userId: user._id,
    coupleId: input.coupleId,
    type: input.type,
    title: input.title,
    body: input.body ?? '',
    emoji: input.emoji ?? '❤️',
    url: input.url ?? '/',
    dedupeKey: input.dedupeKey,
  };

  let saved: unknown = { ...doc, id: null, createdAt: new Date() };
  if (!input.transient) {
    try {
      saved = (await Notification.create(doc)).toJSON();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false; // already delivered
      throw err;
    }
  }

  emitToUser(user._id, 'notification', saved);

  const quiet = prefs.quietHours;
  const silenced =
    quiet?.enabled &&
    !URGENT.includes(input.type) &&
    inQuietHours(hourIn(input.timezone ?? 'UTC'), quiet.start, quiet.end);

  // Don't buzz a phone for something the person is already looking at.
  if (prefs.push !== false && !silenced && !isLooking(user._id)) {
    void sendPush(user._id, {
      title: `${doc.emoji} ${doc.title}`.trim(),
      body: doc.body,
      url: doc.url,
      tag: input.dedupeKey ?? input.type,
      image: input.image,
    });
  }
  return true;
}
