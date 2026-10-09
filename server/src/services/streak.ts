import type { AnyId } from '../models';
import { ActivityDay, type CoupleDoc } from '../models';
import { addDays, todayIn } from '../utils/dates';

/** Records that a partner interacted today. Fire-and-forget. */
export function touchActivity(couple: CoupleDoc, userId: AnyId) {
  const date = todayIn(couple.timezone);
  ActivityDay.updateOne({ coupleId: couple._id, date }, { $addToSet: { users: userId } }, { upsert: true }).catch(
    () => undefined,
  );
}

/** Consecutive days (ending today or yesterday) on which both partners interacted. */
export async function loveStreak(couple: CoupleDoc): Promise<{ days: number; todayDone: boolean }> {
  const today = todayIn(couple.timezone);
  const rows = await ActivityDay.find({ coupleId: couple._id }).sort({ date: -1 }).limit(400).lean();
  const full = new Set(rows.filter((r) => (r.users?.length ?? 0) >= 2).map((r) => r.date));
  const todayDone = full.has(today);
  let cursor = todayDone ? today : addDays(today, -1);
  let days = 0;
  while (full.has(cursor)) {
    days++;
    cursor = addDays(cursor, -1);
  }
  return { days, todayDone };
}
