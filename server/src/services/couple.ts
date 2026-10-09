import type { AnyId } from '../models';
import {
  Couple,
  User,
  Media,
  Message,
  Note,
  Nudge,
  Memory,
  Album,
  CalendarEvent,
  Countdown,
  SharedList,
  BucketListItem,
  DateIdea,
  DailyQuestion,
  Mood,
  ActivityDay,
  Notification,
  Integration,
  Song,
  LittleThing,
  GiftItem,
  WatchItem,
  GameRound,
  JournalDay,
  type CoupleDoc,
  type UserDoc,
  Location,
} from '../models';
import { deleteMedia } from './media';
import { emitToCouple } from './realtime';
import { decrypt } from '../utils/crypto';
import * as drive from './storage/drive';

const COUPLE_COLLECTIONS = [
  Message,
  Note,
  Nudge,
  Memory,
  Album,
  CalendarEvent,
  Countdown,
  SharedList,
  BucketListItem,
  DateIdea,
  DailyQuestion,
  Mood,
  ActivityDay,
  Notification,
  Song,
  LittleThing,
  GiftItem,
  WatchItem,
  GameRound,
  JournalDay,
  Location,
] as const;

/** Starter albums and lists so a new space doesn't open onto blank screens. */
export async function seedCouple(couple: CoupleDoc, userId: AnyId) {
  const base = { coupleId: couple._id, createdBy: userId };
  await Album.insertMany([
    { ...base, name: 'Us', emoji: '❤️' },
    { ...base, name: 'Travel', emoji: '✈️' },
    { ...base, name: 'Dates', emoji: '🍽️' },
  ]);
  await SharedList.insertMany([
    { ...base, name: 'Shopping', emoji: '🛒', kind: 'shopping' },
    { ...base, name: 'Things to do', emoji: '🏠', kind: 'todo' },
  ]);
}

export async function disconnectDrive(coupleId: AnyId) {
  const integration = await Integration.findOne({ coupleId, provider: 'google_drive' }).select('+refreshTokenEnc');
  if (!integration) return;
  try {
    await drive.revoke(decrypt(integration.refreshTokenEnc));
  } catch {
    /* token already invalid */
  }
  drive.forgetClient(String(integration._id));
  await integration.deleteOne();
  await Couple.updateOne({ _id: coupleId }, { storage: 'app' });
}

/** Permanently removes a couple space and everything in it. */
export async function purgeCouple(coupleId: AnyId) {
  const media = await Media.find({ coupleId });
  for (const item of media) await deleteMedia(item);
  await disconnectDrive(coupleId);
  await Promise.all(COUPLE_COLLECTIONS.map((model) => (model as typeof Message).deleteMany({ coupleId })));
  await Couple.deleteOne({ _id: coupleId });
}

/**
 * Removes a user from their couple. The space is closed to new members; if the other
 * partner has also left, all of its data is deleted.
 */
export async function leaveCouple(user: UserDoc) {
  const coupleId = user.coupleId;
  if (!coupleId) return;
  const couple = await Couple.findById(coupleId);
  user.coupleId = undefined;
  await user.save();
  // Whoever leaves stops being locatable straight away.
  await Location.deleteMany({ userId: user._id });
  if (!couple) return;

  couple.members = couple.members.filter((m) => !m.equals(user._id));
  if (couple.members.length === 0) {
    await purgeCouple(couple._id);
    return;
  }
  // If the person leaving owns the connected Drive, the app must stop using it.
  const integration = await Integration.findOne({ coupleId, provider: 'google_drive' });
  if (integration?.userId.equals(user._id)) await disconnectDrive(coupleId);

  couple.status = 'ended';
  couple.inviteCode = undefined;
  await couple.save();
  emitToCouple(couple._id, 'sync', { keys: ['session'] });
}

export async function partnerOf(couple: CoupleDoc, userId: AnyId) {
  const id = couple.members.find((m) => String(m) !== String(userId));
  return id ? User.findById(id) : null;
}
