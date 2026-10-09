import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { GameRound, DailyQuestion, type GameDoc } from '../models';
import { THIS_OR_THAT, MOST_LIKELY } from '../data/games';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { owned } from '../utils/owned';
import { badRequest } from '../utils/http';

const router = Router();
const ROUND_SIZE = 10;

const NAMES = { this_or_that: 'This or that', most_likely: "Who's more likely to…", know_me: 'How well do you know me?' } as const;

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
  if (game.game === 'know_me') return couple.members.filter((m) => !m.equals(game.subjectId!));
  return couple.members;
}

/**
 * Scores a finished round.
 *  - this or that: how many picks match;
 *  - most likely: answers are "me"/"you" from each person's own view, so agreement means opposite picks;
 *  - know me: how many of the subject's real answers the partner recognised.
 */
function score(game: GameDoc) {
  if (game.game === 'know_me') {
    const picks = game.answers[0]?.picks ?? [];
    return game.prompts.filter((p, i) => picks[i] === p.correct).length;
  }
  const [a, b] = game.answers;
  if (!a || !b) return 0;
  return game.prompts.filter((_, i) => (game.game === 'most_likely' ? a.picks[i] !== b.picks[i] : a.picks[i] === b.picks[i])).length;
}

function gameJSON(game: GameDoc, req: Request) {
  const me = req.user._id;
  const mine = game.answers.find((a) => a.userId?.equals(me));
  const theirs = game.answers.find((a) => !a.userId?.equals(me));
  const done = game.status === 'done';
  const isSubject = game.game === 'know_me' && game.subjectId?.equals(me);
  return {
    id: String(game._id),
    game: game.game,
    name: NAMES[game.game],
    createdBy: String(game.createdBy),
    subjectId: game.subjectId ? String(game.subjectId) : null,
    youPlay: !isSubject,
    prompts: game.prompts.map((p) => ({
      text: p.text,
      options: p.options,
      // The real answer stays hidden from the guesser until they've finished.
      correct: game.game === 'know_me' && (done || isSubject) ? p.correct : null,
    })),
    myPicks: mine?.picks ?? null,
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
  const { game } = z.object({ game: z.enum(['this_or_that', 'most_likely', 'know_me']) }).parse(req.body);
  if (!req.partnerId) throw badRequest('Games need two players. Invite your partner first.');

  let prompts: { text: string; options: string[]; correct?: number }[];
  if (game === 'this_or_that') {
    prompts = shuffle(THIS_OR_THAT).slice(0, ROUND_SIZE).map(([a, b]) => ({ text: `${a} or ${b}?`, options: [a, b] }));
  } else if (game === 'most_likely') {
    prompts = shuffle(MOST_LIKELY).slice(0, ROUND_SIZE).map((text) => ({ text, options: ['Me', 'You'] }));
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
    subjectId: game === 'know_me' ? req.user._id : undefined,
    prompts,
  });
  sync(req.couple._id, 'games');
  await notify({
    userId: req.partnerId,
    coupleId: req.couple._id,
    type: 'game',
    emoji: '🎲',
    title: game === 'know_me' ? `${req.user.name} made you a quiz: how well do you know them?` : `${req.user.name} started "${NAMES[game]}"`,
    body: 'Your turn!',
    url: `/games?play=${round._id}`,
  });
  res.status(201).json({ game: gameJSON(round, req) });
});

router.post('/:id/answer', async (req, res) => {
  const { picks } = z.object({ picks: z.array(z.number().int().min(0).max(3)).max(20) }).parse(req.body);
  const round = await owned(GameRound, req, 'That game');
  if (round.status === 'done') throw badRequest('This round is already finished');
  if (!players(round, req.couple).some((p) => p.equals(req.user._id))) throw badRequest("This one is for your partner to answer");
  if (picks.length !== round.prompts.length || picks.some((p, i) => p >= round.prompts[i].options.length)) {
    throw badRequest('Answer every question');
  }
  if (round.answers.some((a) => a.userId?.equals(req.user._id))) throw badRequest("You've already played this round");

  round.answers.push({ userId: req.user._id, picks, at: new Date() });
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
      title:
        round.status === 'done'
          ? round.game === 'know_me'
            ? `${req.user.name} got ${score(round)} of ${round.prompts.length} on your quiz`
            : `"${NAMES[round.game]}" results are in: ${score(round)} of ${round.prompts.length} match`
          : `${req.user.name} played "${NAMES[round.game]}". Your turn!`,
      url: `/games?play=${round._id}`,
    });
  }
  res.json({ game: gameJSON(round, req) });
});

router.delete('/:id', async (req, res) => {
  const round = await owned(GameRound, req, 'That game');
  await round.deleteOne();
  sync(req.couple._id, 'games');
  res.json({ ok: true });
});

export default router;
