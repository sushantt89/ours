import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { GameRound, DailyQuestion, PROMPT_GAMES, type GameDoc, type PromptGame } from '../models';
import { THIS_OR_THAT, MOST_LIKELY } from '../data/games';
import { DEEP_QUESTIONS, DREAM_DATE, FINISH_SENTENCE, FLAGS, HOT_TAKES, LOVE_LANGUAGE, NEVER_HAVE_I_EVER, OUR_FUTURE, RATE_IT, RATE_SCALE, WOULD_YOU_RATHER } from '../data/packs';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { owned } from '../utils/owned';
import { badRequest } from '../utils/http';

const router = Router();
const ROUND_SIZE = 10;

/**
 * How each game is scored once both have played:
 *  match    – how many answers are the same
 *  opposite – "who's more likely": answers are me/you from each side, so agreeing means opposite picks
 *  close    – ratings within one point of each other count
 *  quiz     – one person is guessed about (know me, two truths and a lie); count right guesses
 *  text     – written answers, revealed side by side; no score
 */
type Kind = 'match' | 'opposite' | 'close' | 'quiz' | 'text';
const DEFS: Record<PromptGame, { name: string; kind: Kind }> = {
  this_or_that: { name: 'This or that', kind: 'match' },
  most_likely: { name: "Who's more likely to…", kind: 'opposite' },
  know_me: { name: 'How well do you know me?', kind: 'quiz' },
  would_you_rather: { name: 'Would you rather', kind: 'match' },
  never_have_i_ever: { name: 'Never have I ever', kind: 'match' },
  hot_takes: { name: 'Hot takes', kind: 'match' },
  rate_it: { name: 'Rate it', kind: 'close' },
  finish_sentence: { name: 'Finish the sentence', kind: 'text' },
  two_truths: { name: 'Two truths and a lie', kind: 'quiz' },
  deep_questions: { name: 'Deep questions', kind: 'text' },
  dream_date: { name: 'Dream date', kind: 'match' },
  love_language: { name: 'Love languages', kind: 'match' },
  our_future: { name: 'Plan our future', kind: 'match' },
  flags: { name: 'Green flag, red flag', kind: 'match' },
};
const NAMES = Object.fromEntries(Object.entries(DEFS).map(([k, v]) => [k, v.name])) as Record<PromptGame, string>;
const kindOf = (game: GameDoc) => DEFS[game.game as PromptGame].kind;

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Who has to answer this round. In "know me" only the partner guesses. */
function players(game: GameDoc, couple: Request['couple']) {
  if (kindOf(game) === 'quiz') return couple.members.filter((m) => !m.equals(game.subjectId!));
  return couple.members;
}

/**
 * Scores a finished round.
 *  - this or that: how many picks match;
 *  - most likely: answers are "me"/"you" from each person's own view, so agreement means opposite picks;
 *  - know me: how many of the subject's real answers the partner recognised.
 */
function score(game: GameDoc): number | null {
  const kind = kindOf(game);
  if (kind === 'text') return null;
  if (kind === 'quiz') {
    const picks = game.answers[0]?.picks ?? [];
    return game.prompts.filter((p, i) => picks[i] === p.correct).length;
  }
  const [a, b] = game.answers;
  if (!a || !b) return 0;
  return game.prompts.filter((_, i) => {
    const x = a.picks[i];
    const y = b.picks[i];
    if (kind === 'opposite') return x !== y;
    if (kind === 'close') return Math.abs(x - y) <= 1;
    return x === y;
  }).length;
}

function gameJSON(game: GameDoc, req: Request) {
  const me = req.user._id;
  const mine = game.answers.find((a) => a.userId?.equals(me));
  const theirs = game.answers.find((a) => !a.userId?.equals(me));
  const done = game.status === 'done';
  const kind = kindOf(game);
  const isSubject = kind === 'quiz' && game.subjectId?.equals(me);
  return {
    id: String(game._id),
    game: game.game,
    name: NAMES[game.game as PromptGame],
    kind,
    createdBy: String(game.createdBy),
    subjectId: game.subjectId ? String(game.subjectId) : null,
    youPlay: !isSubject,
    prompts: game.prompts.map((p) => ({
      text: p.text,
      options: p.options,
      // The real answer stays hidden from the guesser until they've finished.
      correct: kind === 'quiz' && (done || isSubject) ? p.correct : null,
    })),
    myPicks: mine ? mine.picks : null,
    myTexts: mine && kind === 'text' ? mine.texts : null,
    partnerTexts: done && kind === 'text' ? (theirs?.texts ?? null) : null,
    partnerAnswered: Boolean(theirs),
    // Nobody sees the other's picks until the round is over.
    partnerPicks: done ? (theirs?.picks ?? null) : null,
    status: game.status,
    score: done ? score(game) : null,
    total: game.prompts.length,
    createdAt: game.get('createdAt'),
  };
}

router.get('/', async (req, res) => {
  const games = await GameRound.find({ coupleId: req.couple._id }).sort({ createdAt: -1 }).limit(40);
  res.json({ games: games.map((g) => gameJSON(g, req)) });
});

router.post('/', async (req, res) => {
  const body = z
    .object({
      game: z.enum(PROMPT_GAMES),
      /** Two truths and a lie: your three statements and which one is the lie. */
      statements: z.array(z.string().trim().min(1).max(200)).length(3).optional(),
      lie: z.number().int().min(0).max(2).optional(),
    })
    .parse(req.body);
  const { game } = body;
  if (!req.partnerId) throw badRequest('Games need two players. Invite your partner first.');

  let prompts: { text: string; options: string[]; correct?: number }[];
  if (game === 'this_or_that') {
    prompts = shuffle(THIS_OR_THAT).slice(0, ROUND_SIZE).map(([a, b]) => ({ text: `${a} or ${b}?`, options: [a, b] }));
  } else if (game === 'most_likely') {
    prompts = shuffle(MOST_LIKELY).slice(0, ROUND_SIZE).map((text) => ({ text, options: ['Me', 'You'] }));
  } else if (game === 'would_you_rather') {
    prompts = shuffle(WOULD_YOU_RATHER).slice(0, ROUND_SIZE).map(([a, b]) => ({ text: 'Would you rather…', options: [a, b] }));
  } else if (game === 'never_have_i_ever') {
    prompts = shuffle(NEVER_HAVE_I_EVER).slice(0, ROUND_SIZE).map((text) => ({ text, options: ['🙋 I have', '🙅 Never'] }));
  } else if (game === 'hot_takes') {
    prompts = shuffle(HOT_TAKES).slice(0, ROUND_SIZE).map((text) => ({ text, options: ['👍 Agree', '👎 Disagree'] }));
  } else if (game === 'rate_it') {
    prompts = shuffle(RATE_IT).slice(0, 8).map((text) => ({ text, options: RATE_SCALE }));
  } else if (game === 'finish_sentence') {
    prompts = shuffle(FINISH_SENTENCE).slice(0, 5).map((text) => ({ text, options: [] }));
  } else if (game === 'deep_questions') {
    prompts = shuffle(DEEP_QUESTIONS).slice(0, 3).map((text) => ({ text, options: [] }));
  } else if (game === 'dream_date') {
    prompts = shuffle(DREAM_DATE).slice(0, 8).map(([text, options]) => ({ text, options }));
  } else if (game === 'love_language') {
    prompts = shuffle(LOVE_LANGUAGE).slice(0, ROUND_SIZE).map(([a, b]) => ({ text: 'Which would mean more to you?', options: shuffle([a, b]) }));
  } else if (game === 'our_future') {
    prompts = shuffle(OUR_FUTURE).slice(0, ROUND_SIZE).map(([text, options]) => ({ text, options }));
  } else if (game === 'flags') {
    prompts = shuffle(FLAGS).slice(0, ROUND_SIZE).map((text) => ({ text, options: ['💚 Green flag', '🚩 Red flag'] }));
  } else if (game === 'two_truths') {
    if (!body.statements || body.lie === undefined) throw badRequest('Write two truths and a lie, and mark which is the lie');
    prompts = [{ text: 'Which one is the lie?', options: body.statements, correct: body.lie }];
  } else {
    // Built from the creator's own daily-question answers: can the partner spot the real one?
    const answered = await DailyQuestion.find({ coupleId: req.couple._id, 'answers.userId': req.user._id }).sort({ date: -1 }).limit(60);
    const mine = answered
      .map((q) => ({ question: q.question, answer: q.answers.find((a) => a.userId.equals(req.user._id))!.text.trim() }))
      .filter((x) => x.answer);
    const distinct = [...new Set(mine.map((m) => m.answer))];
    if (mine.length < 4 || distinct.length < 4) {
      throw badRequest('Answer at least 4 daily questions first. This quiz is made from your answers.');
    }
    prompts = shuffle(mine)
      .slice(0, Math.min(6, mine.length))
      .map(({ question, answer }) => {
        const decoys = shuffle(distinct.filter((d) => d !== answer)).slice(0, 3);
        const options = shuffle([answer, ...decoys]).map((o) => o.slice(0, 300));
        return { text: question, options, correct: options.indexOf(answer.slice(0, 300)) };
      });
  }

  const round = await GameRound.create({
    coupleId: req.couple._id,
    createdBy: req.user._id,
    game,
    subjectId: DEFS[game].kind === 'quiz' ? req.user._id : undefined,
    prompts,
  });
  sync(req.couple._id, 'games');
  await notify({
    userId: req.partnerId,
    coupleId: req.couple._id,
    type: 'game',
    emoji: '🎲',
    title:
      game === 'know_me'
        ? `${req.user.name} made you a quiz: how well do you know them?`
        : game === 'two_truths'
          ? `${req.user.name} told you two truths and a lie. Can you spot it?`
          : `${req.user.name} started "${NAMES[game]}"`,
    body: 'Your turn!',
    url: `/games?play=${round._id}`,
  });
  res.status(201).json({ game: gameJSON(round, req) });
});

router.post('/:id/answer', async (req, res) => {
  const body = z
    .object({ picks: z.array(z.number().int().min(0).max(4)).max(20).default([]), texts: z.array(z.string().trim().min(1).max(1000)).max(20).optional() })
    .parse(req.body);
  const round = await owned(GameRound, req, 'That game');
  const textGame = kindOf(round) === 'text';
  const picks = body.picks;
  if (round.status === 'done') throw badRequest('This round is already finished');
  if (!players(round, req.couple).some((p) => p.equals(req.user._id))) throw badRequest("This one is for your partner to answer");
  if (textGame ? body.texts?.length !== round.prompts.length : picks.length !== round.prompts.length || picks.some((p, i) => p >= round.prompts[i].options.length)) {
    throw badRequest('Answer every question');
  }
  if (round.answers.some((a) => a.userId?.equals(req.user._id))) throw badRequest("You've already played this round");

  round.answers.push({ userId: req.user._id, picks: textGame ? [] : picks, texts: textGame ? body.texts : [], at: new Date() });
  const everyone = players(round, req.couple);
  if (everyone.every((p) => round.answers.some((a) => a.userId?.equals(p)))) round.status = 'done';
  await round.save();
  sync(req.couple._id, 'games');
  touchActivity(req.couple, req.user._id);

  if (req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'game',
      emoji: round.status === 'done' ? '🏆' : '🎲',
      title: doneTitle(round, req.user.name),
      url: `/games?play=${round._id}`,
    });
  }
  res.json({ game: gameJSON(round, req) });
});

function doneTitle(round: GameDoc, name: string) {
  const title = NAMES[round.game as PromptGame];
  if (round.status !== 'done') return `${name} played "${title}". Your turn!`;
  const kind = kindOf(round);
  if (round.game === 'two_truths') return score(round) ? `${name} spotted your lie 🕵️` : `${name} fell for your lie 😏`;
  if (kind === 'quiz') return `${name} got ${score(round)} of ${round.prompts.length} on your quiz`;
  if (kind === 'text') return `"${title}" is ready: see what you both wrote`;
  return `"${title}" results are in: ${score(round)} of ${round.prompts.length} match`;
}

router.delete('/:id', async (req, res) => {
  const round = await owned(GameRound, req, 'That game');
  await round.deleteOne();
  sync(req.couple._id, 'games');
  res.json({ ok: true });
});

export default router;
