import type { AnyId } from '../models';
import { Couple, Note, User, Memory, DateIdea, Countdown, CalendarEvent, Nudge, type CoupleDoc } from '../models';
import { deliverNudge } from '../routes/nudges';
import { backfillPlaces } from './geo';
import { expireLocationSharing } from '../routes/location';
import { notify } from './notify';
import { sync } from './realtime';
import { virtualEvents } from './calendar';
import { announceNote } from '../routes/notes';
import { addDays, daysBetween, hourIn, milestonesFor, nextOccurrence, todayIn } from '../utils/dates';
import { env } from '../config/env';

/**
 * Background jobs. Every job is idempotent: each reminder carries a dedupe key, so running
 * a job twice (or catching up after the server slept) never sends the same thing twice.
 */

/** Delivers love notes that were scheduled for later. */
export async function deliverScheduledNotes(now = new Date()) {
  const due = await Note.find({ audience: 'partner', deliveredAt: null, deliverAt: { $lte: now } }).limit(200);
  for (const note of due) {
    note.deliveredAt = now;
    await note.save();
    const couple = await Couple.findById(note.coupleId);
    const author = await User.findById(note.authorId).select('name');
    const partnerId = couple?.members.find((m) => !m.equals(note.authorId));
    if (couple && partnerId) {
      await announceNote(note, author?.name ?? 'Your partner', partnerId, couple.timezone);
      sync(couple._id, 'notes', 'dashboard');
    }
  }
  return due.length;
}

/** Sends nudges that were scheduled for the partner's morning or evening. */
export async function deliverScheduledNudges(now = new Date()) {
  const due = await Nudge.find({ deliverAt: { $lte: now }, deliveredAt: null }).limit(200);
  for (const nudge of due) {
    // Mark first so a slow delivery can never send the same nudge twice.
    const claimed = await Nudge.updateOne({ _id: nudge._id, deliveredAt: null }, { deliveredAt: now });
    if (!claimed.modifiedCount) continue;
    const [couple, sender] = await Promise.all([Couple.findById(nudge.coupleId).select('timezone members'), User.findById(nudge.fromId).select('name')]);
    if (!couple || !couple.members.some((m) => m.equals(nudge.toId))) continue;
    await deliverNudge(nudge, sender?.name ?? 'Your partner', couple.timezone);
  }
  return due.length;
}

/** Tells the recipient when a locked surprise becomes available. */
export async function announceUnlockedNotes(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000);
  const notes = await Note.find({ audience: 'partner', deliveredAt: { $ne: null }, unlockAt: { $gt: since, $lte: now }, readAt: null }).limit(200);
  for (const note of notes) {
    const couple = await Couple.findById(note.coupleId);
    const partnerId = couple?.members.find((m) => !m.equals(note.authorId));
    if (!couple || !partnerId) continue;
    const sent = await notify({
      userId: partnerId,
      coupleId: couple._id,
      type: 'note',
      emoji: '🎁',
      title: 'A surprise just unlocked',
      body: 'Open it when you have a quiet moment.',
      url: '/notes',
      dedupeKey: `unlock:${note._id}`,
      timezone: couple.timezone,
    });
    if (sent) sync(couple._id, 'notes', 'dashboard');
  }
}

const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

async function dailyForCouple(couple: CoupleDoc) {
  const tz = couple.timezone;
  const today = todayIn(tz);
  const members = couple.members;
  const all = (input: Omit<Parameters<typeof notify>[0], 'userId' | 'coupleId' | 'timezone'>, only?: AnyId) =>
    Promise.all(
      members
        .filter((m) => !only || String(m) === String(only))
        .map((userId) => notify({ ...input, userId, coupleId: couple._id, timezone: tz })),
    );

  // Relationship milestones
  if (couple.startDate) {
    for (const m of milestonesFor(couple.startDate)) {
      if (m.date === today) {
        await all({ type: 'milestone', emoji: '🎉', title: `${m.label} together!`, body: 'Look how far you two have come.', url: '/story', dedupeKey: `milestone:${m.key}` });
        if (/^y\d+$/.test(m.key)) {
          await all({ type: 'recap', emoji: '🎞️', title: `Your ${m.label === '1 year' ? 'first year' : `year ${m.key.slice(1)}`} in review is ready`, body: 'A little look back at everything you shared.', url: `/recap?year=${m.key}`, dedupeKey: `recap:${m.key}` });
        }
      }
    }
  }

  // Calendar reminders (stored events plus the anniversary and birthdays from the profile)
  const stored = await CalendarEvent.find({ coupleId: couple._id });
  const events = [
    ...(await virtualEvents(couple)).map((e) => ({ ...e, owner: null as AnyId | null })),
    ...stored.map((e) => ({
      id: String(e._id), title: e.title, emoji: e.emoji, type: e.type, date: e.date, recurrence: e.recurrence,
      remindDaysBefore: e.remindDaysBefore, owner: e.visibility === 'personal' ? e.createdBy : null,
    })),
  ];
  for (const event of events) {
    const next = nextOccurrence(event.date, event.recurrence, today);
    if (!next) continue;
    const days = daysBetween(today, next);
    if (!event.remindDaysBefore.includes(days)) continue;
    const special = event.type === 'anniversary' || event.type === 'birthday';
    await all(
      {
        type: special ? 'milestone' : 'calendar',
        emoji: event.emoji,
        title: days === 0 ? `${event.title} is today` : `${event.title} is ${inDays(days)}`,
        body: special && days > 0 ? 'A little time to plan something lovely.' : '',
        url: '/calendar',
        dedupeKey: `event:${event.id}:${next}:${days}`,
      },
      event.owner ?? undefined,
    );
  }

  // Countdowns that have arrived
  for (const c of await Countdown.find({ coupleId: couple._id, date: today })) {
    await all({ type: 'countdown', emoji: c.emoji, title: `${c.title} is today!`, body: 'The wait is over.', url: '/countdowns', dedupeKey: `countdown:${c._id}` });
  }

  // On this day
  const memories = await Memory.find({ coupleId: couple._id, visibility: 'shared', monthDay: today.slice(5), date: { $lt: `${today.slice(0, 4)}-01-01` } })
    .sort({ date: -1 }).limit(1);
  if (memories[0]) {
    const years = Number(today.slice(0, 4)) - Number(memories[0].date.slice(0, 4));
    await all({
      type: 'memory', emoji: '📸',
      title: `On this day, ${years} year${years === 1 ? '' : 's'} ago`,
      body: memories[0].location ? `You were in ${memories[0].location}` : memories[0].caption || 'You have a memory from today.',
      url: '/memories?view=on-this-day', dedupeKey: `otd:${today}`,
    });
  }

  // A gentle date-night reminder, at most once every 30 days
  if (couple.status === 'active') {
    const cutoff = addDays(today, -30);
    const lastNudge = couple.lastDateNudgeAt ? todayIn(tz, couple.lastDateNudgeAt) : null;
    const createdDay = todayIn(tz, couple.get('createdAt'));
    if (createdDay <= cutoff && (!lastNudge || lastNudge <= cutoff)) {
      const recent = await DateIdea.exists({ coupleId: couple._id, status: 'done', completedAt: { $gt: cutoff } });
      if (!recent) {
        await all({ type: 'reminder', emoji: '🍽️', title: "You haven't had a date night recently", body: 'Want a random idea for this week?', url: '/date-night', dedupeKey: `datenight:${today}` });
        couple.lastDateNudgeAt = new Date();
        await couple.save();
      }
    }
  }
}

/** Runs each couple's daily reminders once it is morning in their own time zone. */
export async function runDailyReminders(now = new Date(), force = false) {
  const couples = Couple.find({ status: { $ne: 'ended' } }).cursor();
  for await (const couple of couples) {
    const hour = hourIn(couple.timezone, now);
    if (!force && (hour < 8 || hour > 21)) continue;
    try {
      await dailyForCouple(couple);
    } catch (err) {
      console.error('[scheduler] daily reminders failed for couple', String(couple._id), err);
    }
  }
}

let running = false;
let ticks = 0;
async function tick() {
  if (running) return;
  running = true;
  try {
    await deliverScheduledNotes();
    await deliverScheduledNudges();
    await expireLocationSharing();
    await announceUnlockedNotes();
    // Date-based reminders only need checking a few times an hour.
    if (ticks++ % 15 === 0) {
      await runDailyReminders();
      await backfillPlaces();
    }
  } catch (err) {
    console.error('[scheduler]', err);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (env.isTest) return;
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000).unref();
}
