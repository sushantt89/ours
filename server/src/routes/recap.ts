import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  Message,
  Memory,
  Nudge,
  Note,
  DateIdea,
  BucketListItem,
  DailyQuestion,
  Song,
  JournalDay,
  WatchItem,
  ActivityDay,
  User,
} from '../models';
import { mediaJSON } from '../services/media';
import { Media } from '../models';
import { addDays, addMonths, daysBetween, todayIn } from '../utils/dates';
import { badRequest } from '../utils/http';

/**
 * "Year in review": a story of one relationship year (anniversary to anniversary),
 * or of a calendar year for couples who haven't set a start date.
 */
const router = Router();

interface Period {
  key: string;
  label: string;
  from: string; // inclusive, YYYY-MM-DD
  to: string; // exclusive
  complete: boolean;
}

function periods(req: Request): Period[] {
  const today = todayIn(req.couple.timezone);
  const out: Period[] = [];
  if (req.couple.startDate) {
    for (let k = 1; ; k++) {
      const from = addMonths(req.couple.startDate, 12 * (k - 1));
      if (from > today) break;
      const to = addMonths(req.couple.startDate, 12 * k);
      out.push({ key: `y${k}`, label: k === 1 ? 'Our first year' : `Year ${k}`, from, to, complete: to <= today });
    }
  } else {
    const first = Number(String(req.couple.get('createdAt').toISOString()).slice(0, 4));
    for (let y = first; y <= Number(today.slice(0, 4)); y++) {
      out.push({ key: String(y), label: String(y), from: `${y}-01-01`, to: `${y + 1}-01-01`, complete: `${y + 1}-01-01` <= today });
    }
  }
  return out.reverse();
}

router.get('/', async (req, res) => {
  res.json({ periods: periods(req) });
});

const EMOJI = /\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200d\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*/gu;

function topCounts(values: string[], n: number) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
}

router.get('/:key', async (req, res) => {
  const key = z.string().max(10).parse(req.params.key);
  const period = periods(req).find((p) => p.key === key);
  if (!period) throw badRequest("That year hasn't happened yet");

  const coupleId = req.couple._id;
  const range = { $gte: new Date(`${period.from}T00:00:00Z`), $lt: new Date(`${period.to}T00:00:00Z`) };
  const dateRange = { $gte: period.from, $lt: period.to };
  const members = await User.find({ _id: { $in: req.couple.members } }).select('name');
  const visible: Record<string, unknown> = { $or: [{ visibility: 'shared' }, { authorId: req.user._id }] };

  const [messages, memories, nudges, notes, dates, bucket, questions, songs, journalDays, watched, activity] = await Promise.all([
    Message.find({ coupleId, createdAt: range, deletedAt: null }).select('senderId type text createdAt call').lean(),
    Memory.find({ coupleId, date: dateRange, ...visible }).select('mediaId location caption date reactions favoriteBy comments event').lean(),
    Nudge.find({ coupleId, createdAt: range }).select('fromId emoji text').lean(),
    Note.countDocuments({ coupleId, audience: 'partner', createdAt: range }),
    DateIdea.find({ coupleId, status: 'done', completedAt: dateRange }).select('title emoji').lean(),
    BucketListItem.find({ coupleId, done: true, completedAt: dateRange }).select('title').lean(),
    DailyQuestion.countDocuments({ coupleId, date: dateRange, 'answers.1': { $exists: true } }),
    Song.find({ coupleId, date: dateRange }).select('userId title artist provider').lean(),
    JournalDay.countDocuments({ coupleId, date: dateRange }),
    WatchItem.find({ coupleId, status: 'watched', watchedAt: dateRange }).select('title ratings').lean(),
    ActivityDay.find({ coupleId, date: dateRange }).select('date users').lean(),
  ]);

  // Messages
  const byPerson = members.map((m) => ({ name: m.name, count: messages.filter((x) => x.senderId.equals(m._id) && x.type !== 'call').length }));
  const perDay = topCounts(messages.map((m) => todayIn(req.couple.timezone, m.createdAt as unknown as Date)), 1)[0];
  const emojis = topCounts(messages.filter((m) => m.type === 'text' || m.type === 'sticker').flatMap((m) => m.text.match(EMOJI) ?? []), 5);
  const iLoveYous = messages.filter((m) => /\bi\s*love\s*(you|u)\b/i.test(m.text ?? '')).length;
  const calls = messages.filter((m) => m.type === 'call' && m.call?.status === 'completed');
  const callMinutes = Math.round(calls.reduce((sum, c) => sum + (c.call?.duration ?? 0), 0) / 60);

  // Memories: the most loved ones first
  const ranked = [...memories].sort(
    (a, b) => b.favoriteBy.length * 2 + b.reactions.length + b.comments.length - (a.favoriteBy.length * 2 + a.reactions.length + a.comments.length),
  );
  const media = await Media.find({ _id: { $in: ranked.slice(0, 9).map((m) => m.mediaId) }, coupleId });
  const mediaById = new Map(media.map((m) => [String(m._id), mediaJSON(m)]));
  const places = topCounts(memories.map((m) => m.location).filter(Boolean), 12);

  // Streak: the longest run of days both of you showed up
  const both = new Set(activity.filter((a) => (a.users?.length ?? 0) >= 2).map((a) => a.date));
  let longest = 0;
  let run = 0;
  const end = period.complete ? period.to : addDays(todayIn(req.couple.timezone), 1);
  for (let d = period.from; d < end; d = addDays(d, 1)) {
    run = both.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  const days = Math.max(1, daysBetween(period.from, period.complete ? period.to : todayIn(req.couple.timezone)));
  const topNudge = topCounts(nudges.map((n) => `${n.emoji} ${n.text}`), 1)[0] ?? null;
  const bestWatch = [...watched]
    .map((w) => ({ title: w.title, stars: w.ratings.length ? w.ratings.reduce((s, r) => s + (r.stars ?? 0), 0) / w.ratings.length : 0 }))
    .sort((a, b) => b.stars - a.stars)[0];

  res.json({
    period,
    names: members.map((m) => m.name),
    days,
    messages: {
      total: byPerson.reduce((s, p) => s + p.count, 0),
      byPerson,
      perDay: Math.round(messages.length / days),
      busiestDay: perDay ? { date: perDay.value, count: perDay.count } : null,
      topEmojis: emojis,
      iLoveYous,
      encrypted: messages.filter((m) => m.type === 'encrypted').length,
    },
    calls: { count: calls.length, minutes: callMinutes },
    memories: {
      total: memories.length,
      top: ranked
        .slice(0, 9)
        .map((m) => ({ id: String(m._id), caption: m.caption, location: m.location, date: m.date, media: mediaById.get(String(m.mediaId)) }))
        .filter((m) => m.media),
      places,
    },
    nudges: { total: nudges.length, favourite: topNudge },
    notes,
    dateNights: dates.map((d) => `${d.emoji} ${d.title}`),
    bucketDone: bucket.map((b) => b.title),
    questions,
    songs: { total: songs.length, last: songs.at(-1) ?? null },
    journalDays,
    watched: { total: watched.length, favourite: bestWatch?.stars ? bestWatch : null },
    longestStreak: longest,
  });
});

export default router;
