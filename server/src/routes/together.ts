import type { AnyId } from '../models';
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { DateIdea, DailyQuestion, Mood, DATE_CATEGORIES, type CoupleDoc } from '../models';
import { DATE_IDEAS } from '../data/dateIdeas';
import { QUESTIONS } from '../data/questions';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { todayIn } from '../utils/dates';
import { owned } from '../utils/owned';
import { badRequest, conflict } from '../utils/http';
import * as v from '../utils/validation';

/* ── Date night ─────────────────────────────────────────────────────── */

export const dates = Router();

const dateSchema = z.object({
  title: z.string().trim().min(1, 'Describe the date').max(140),
  emoji: v.emoji.default('🍽️'),
  category: z.enum(DATE_CATEGORIES).default('home'),
  notes: z.string().trim().max(1000).default(''),
  status: z.enum(['idea', 'done']).default('idea'),
  completedAt: v.dateOnly.nullish(),
});

dates.get('/', async (req, res) => {
  res.json({ ideas: await DateIdea.find({ coupleId: req.couple._id }).sort({ status: -1, createdAt: -1 }) });
});

/** Picks a random date from the couple's own saved ideas plus the built-in collection. */
dates.get('/random', async (req, res) => {
  const { category, exclude } = z
    .object({ category: z.enum(DATE_CATEGORIES).optional(), exclude: z.string().max(140).optional() })
    .parse(req.query);
  const saved = await DateIdea.find({ coupleId: req.couple._id });
  const doneTitles = new Set(saved.filter((s) => s.status === 'done').map((s) => s.title));
  const pool = [
    ...saved.filter((s) => s.status === 'idea').map((s) => ({ id: String(s._id), emoji: s.emoji, title: s.title, category: s.category, saved: true })),
    ...DATE_IDEAS.filter((d) => !doneTitles.has(d.title) && !saved.some((s) => s.title === d.title)).map((d) => ({ id: null, ...d, saved: false })),
  ].filter((d) => (!category || d.category === category) && d.title !== exclude);
  if (!pool.length) throw badRequest("You've done every idea in this category. Add some new ones!");
  res.json({ idea: pool[crypto.randomInt(pool.length)] });
});

dates.post('/', async (req, res) => {
  const body = dateSchema.parse(req.body);
  if (await DateIdea.exists({ coupleId: req.couple._id, title: body.title, status: 'idea' })) {
    throw conflict('That idea is already on your list');
  }
  const idea = await DateIdea.create({
    ...body,
    completedAt: body.status === 'done' ? (body.completedAt ?? todayIn(req.couple.timezone)) : undefined,
    coupleId: req.couple._id,
    createdBy: req.user._id,
  });
  sync(req.couple._id, 'dates');
  res.status(201).json({ idea });
});

dates.patch('/:id', async (req, res) => {
  const body = dateSchema.partial().parse(req.body);
  const idea = await owned(DateIdea, req, 'That date idea');
  const wasDone = idea.status === 'done';
  const { completedAt, ...rest } = body;
  Object.assign(idea, rest);
  if (idea.status === 'done') idea.completedAt = completedAt ?? idea.completedAt ?? todayIn(req.couple.timezone);
  else idea.completedAt = undefined;
  await idea.save();
  sync(req.couple._id, 'dates', 'dashboard');
  if (!wasDone && idea.status === 'done') touchActivity(req.couple, req.user._id);
  res.json({ idea });
});

dates.delete('/:id', async (req, res) => {
  const idea = await owned(DateIdea, req, 'That date idea');
  await idea.deleteOne();
  sync(req.couple._id, 'dates');
  res.json({ ok: true });
});

/* ── Daily question ─────────────────────────────────────────────────── */

export const questions = Router();

/** Finds or creates today's question, avoiding ones this couple has already had. */
export async function todaysQuestion(couple: CoupleDoc) {
  const date = todayIn(couple.timezone);
  const existing = await DailyQuestion.findOne({ coupleId: couple._id, date });
  if (existing) return existing;

  const used = new Set((await DailyQuestion.find({ coupleId: couple._id }).select('question').lean()).map((q) => q.question));
  let pool = QUESTIONS.filter(([, q]) => !used.has(q));
  if (!pool.length) pool = QUESTIONS; // every question asked: start the cycle again
  // Deterministic per couple and day, so both partners always get the same question.
  const seed = crypto.createHash('sha256').update(`${couple._id}:${date}`).digest().readUInt32BE(0);
  const [emoji, question] = pool[seed % pool.length];
  try {
    return await DailyQuestion.create({ coupleId: couple._id, date, emoji, question });
  } catch {
    return (await DailyQuestion.findOne({ coupleId: couple._id, date }))!;
  }
}

type QuestionDoc = Awaited<ReturnType<typeof todaysQuestion>>;

/** A partner's answer stays hidden until you have answered too. */
export function questionJSON(q: QuestionDoc, userId: AnyId) {
  const mine = q.answers.find((a) => String(a.userId) === String(userId));
  const theirs = q.answers.find((a) => String(a.userId) !== String(userId));
  return {
    id: String(q._id),
    date: q.date,
    emoji: q.emoji,
    question: q.question,
    myAnswer: mine?.text ?? null,
    partnerAnswered: Boolean(theirs),
    partnerAnswer: mine && theirs ? theirs.text : null,
  };
}

questions.get('/today', async (req, res) => {
  res.json({ question: questionJSON(await todaysQuestion(req.couple), req.user._id) });
});

questions.post('/today/answer', async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1, 'Write your answer first').max(1000) }).parse(req.body);
  const today = await todaysQuestion(req.couple);
  const firstTime = !today.answers.some((a) => a.userId.equals(req.user._id));
  // Answers lock once both partners have answered, so a reveal can't be rewritten afterwards.
  if (!firstTime && today.answers.length >= 2) throw badRequest("You've both answered. This one is locked in.");
  today.answers.pull({ userId: req.user._id });
  today.answers.push({ userId: req.user._id, text });
  await today.save();
  sync(req.couple._id, 'question', 'dashboard');
  touchActivity(req.couple, req.user._id);
  if (firstTime && req.partnerId) {
    const both = today.answers.length >= 2;
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'question',
      emoji: today.emoji,
      title: both ? 'You both answered. Reveal time!' : `${req.user.name} answered today's question`,
      body: both ? today.question : 'Answer to see what they said.',
      url: '/question',
    });
  }
  res.json({ question: questionJSON(today, req.user._id) });
});

questions.get('/history', async (req, res) => {
  const today = todayIn(req.couple.timezone);
  const list = await DailyQuestion.find({ coupleId: req.couple._id, date: { $lt: today }, 'answers.0': { $exists: true } })
    .sort({ date: -1 })
    .limit(200);
  // Past days are revealed in full once the day is over, if both answered.
  res.json({
    questions: list.map((q) => {
      const json = questionJSON(q, req.user._id);
      const theirs = q.answers.find((a) => !a.userId.equals(req.user._id));
      return { ...json, partnerAnswer: q.answers.length >= 2 ? (theirs?.text ?? null) : json.partnerAnswer };
    }),
  });
});

/* ── Mood sharing ───────────────────────────────────────────────────── */

export const moods = Router();

moods.get('/', async (req, res) => {
  const mine = await Mood.find({ coupleId: req.couple._id, userId: req.user._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ moods: mine });
});

moods.post('/', async (req, res) => {
  const body = z
    .object({ emoji: v.emoji, label: z.string().trim().min(1).max(30), note: z.string().trim().max(140).default('') })
    .parse(req.body);
  const mood = await Mood.create({ ...body, coupleId: req.couple._id, userId: req.user._id });
  sync(req.couple._id, 'session', 'dashboard');
  touchActivity(req.couple, req.user._id);
  res.status(201).json({ mood });
});

export async function myMood(coupleId: AnyId, userId: AnyId) {
  const mood = await Mood.findOne({ coupleId, userId }).sort({ createdAt: -1 }).lean();
  if (!mood || Date.now() - new Date(mood.createdAt as unknown as Date).getTime() > 24 * 3600 * 1000) return null;
  return { emoji: mood.emoji, label: mood.label, note: mood.note, at: mood.createdAt };
}
