import type { AnyId } from '../models';
import { CalendarEvent, User, type CoupleDoc } from '../models';
import { nextOccurrence, daysBetween, todayIn, type Recurrence } from '../utils/dates';

export interface EventView {
  id: string;
  title: string;
  emoji: string;
  type: string;
  date: string;
  time: string | null;
  recurrence: Recurrence;
  remindDaysBefore: number[];
  notes: string;
  visibility: 'shared' | 'personal';
  createdBy: string | null;
  /** Derived from the couple profile (anniversary, birthdays) rather than stored. */
  virtual: boolean;
}

/** The anniversary and both birthdays come straight from the profile, so they never drift. */
export async function virtualEvents(couple: CoupleDoc): Promise<EventView[]> {
  const out: EventView[] = [];
  const base = { time: null, recurrence: 'yearly' as const, notes: '', visibility: 'shared' as const, createdBy: null, virtual: true };
  if (couple.startDate) {
    out.push({
      ...base,
      id: 'virtual-anniversary',
      title: 'Our anniversary',
      emoji: '❤️',
      type: 'anniversary',
      date: couple.startDate,
      remindDaysBefore: [0, 1, 7],
    });
  }
  const members = await User.find({ _id: { $in: couple.members }, birthday: { $exists: true, $ne: null } }).select('name birthday');
  for (const member of members) {
    out.push({
      ...base,
      id: `virtual-birthday-${member._id}`,
      title: `${member.name}'s birthday`,
      emoji: '🎂',
      type: 'birthday',
      date: member.birthday!,
      remindDaysBefore: [0, 1, 7],
    });
  }
  return out;
}

export async function eventsFor(couple: CoupleDoc, userId: AnyId): Promise<EventView[]> {
  const stored = await CalendarEvent.find({
    coupleId: couple._id,
    $or: [{ visibility: 'shared' }, { createdBy: userId }],
  }).sort({ date: 1 });
  const mapped: EventView[] = stored.map((e) => ({
    id: String(e._id),
    title: e.title,
    emoji: e.emoji,
    type: e.type,
    date: e.date,
    time: e.time ?? null,
    recurrence: e.recurrence,
    remindDaysBefore: e.remindDaysBefore,
    notes: e.notes,
    visibility: e.visibility,
    createdBy: String(e.createdBy),
    virtual: false,
  }));
  return [...(await virtualEvents(couple)), ...mapped];
}

export interface Upcoming extends EventView {
  next: string;
  daysUntil: number;
}

export function upcoming(events: EventView[], timezone: string, limit = 5): Upcoming[] {
  const today = todayIn(timezone);
  return events
    .map((e) => {
      const next = nextOccurrence(e.date, e.recurrence, today);
      return next ? { ...e, next, daysUntil: daysBetween(today, next) } : null;
    })
    .filter((e): e is Upcoming => e !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);
}
