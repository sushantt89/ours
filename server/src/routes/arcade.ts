import { Router, type Request } from 'express';
import { z } from 'zod';
import { ArcadeScore, DailyWordPlay } from '../models';
import { DAILY_WORDS } from '../data/wordgames';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { isWord, markGuess, pick } from '../services/words';
import { todayIn } from '../utils/dates';
import { badRequest, notFound } from '../utils/http';

/**
 * Arcade: games you play on your own, with a leaderboard against your partner.
 * The games themselves run in the app; the server keeps the scores.
 */
const router = Router();

type Better = 'high' | 'low';
interface ArcadeGame {
  name: string;
  better: Better;
  /** Plausible score range, to keep obviously broken scores out of the leaderboard. */
  min: number;
  max: number;
  unit?: string;
}

export const ARCADE: Record<string, ArcadeGame> = {
  snake: { name: 'Snake', better: 'high', min: 0, max: 5000 },
  '2048': { name: '2048', better: 'high', min: 0, max: 5_000_000 },
  flappy: { name: 'Flappy heart', better: 'high', min: 0, max: 10_000 },
  hearts: { name: 'Tap the hearts', better: 'high', min: 0, max: 5000 },
  blocks: { name: 'Block puzzle', better: 'high', min: 0, max: 10_000_000 },
  minesweeper: { name: 'Minesweeper', better: 'low', min: 1, max: 9999, unit: 's' },
  memory: { name: 'Memory match', better: 'low', min: 8, max: 999, unit: ' moves' },
  scramble: { name: 'Word scramble', better: 'high', min: 0, max: 500 },
  simon: { name: 'Simon says', better: 'high', min: 0, max: 500 },
  reaction: { name: 'Reaction time', better: 'low', min: 80, max: 5000, unit: ' ms' },
  math: { name: 'Math sprint', better: 'high', min: 0, max: 500 },
  typing: { name: 'Typing race', better: 'high', min: 0, max: 300, unit: ' wpm' },
  breakout: { name: 'Breakout', better: 'high', min: 0, max: 100_000 },
  slide: { name: '15-puzzle', better: 'low', min: 1, max: 99_999, unit: ' moves' },
  whack: { name: 'Whack-a-mole', better: 'high', min: 0, max: 5000 },
  stroop: { name: 'Colour trap', better: 'high', min: 0, max: 500 },
  stack: { name: 'Stack tower', better: 'high', min: 0, max: 1000 },
  sudoku: { name: 'Sudoku', better: 'low', min: 20, max: 99_999, unit: 's' },
};

const better = (game: ArcadeGame, a: number, b: number) => (game.better === 'high' ? a > b : a < b);
const fmt = (game: ArcadeGame, score: number) => `${score.toLocaleString('en')}${game.unit ?? ''}`;

/** Best score and number of plays per game for each of you. */
async function leaderboard(req: Request) {
  const rows = await ArcadeScore.aggregate<{ _id: { game: string; userId: unknown }; max: number; min: number; plays: number }>([
    { $match: { coupleId: req.couple._id } },
    { $group: { _id: { game: '$game', userId: '$userId' }, max: { $max: '$score' }, min: { $min: '$score' }, plays: { $sum: 1 } } },
  ]);
  const board: Record<string, { mine: number | null; partner: number | null; myPlays: number; partnerPlays: number }> = {};
  for (const id of Object.keys(ARCADE)) board[id] = { mine: null, partner: null, myPlays: 0, partnerPlays: 0 };
  for (const row of rows) {
    const game = ARCADE[row._id.game];
    if (!game) continue;
    const best = game.better === 'high' ? row.max : row.min;
    const mine = String(row._id.userId) === String(req.user._id);
    board[row._id.game][mine ? 'mine' : 'partner'] = best;
    board[row._id.game][mine ? 'myPlays' : 'partnerPlays'] = row.plays;
  }
  return board;
}

router.get('/', async (req, res) => {
  res.json({ games: ARCADE, board: await leaderboard(req) });
});

router.post('/:game/score', async (req, res) => {
  const id = String(req.params.game);
  const game = ARCADE[id];
  if (!game) throw notFound('That game');
  const { score } = z.object({ score: z.number().int().min(game.min).max(game.max) }).parse(req.body);

  const before = (await leaderboard(req))[id];
  await ArcadeScore.create({ coupleId: req.couple._id, userId: req.user._id, game: id, score });
  const personalBest = before.mine === null || better(game, score, before.mine);
  // You took the lead: your new score beats theirs, and you weren't already ahead.
  const tookLead = before.partner !== null && better(game, score, before.partner) && (before.mine === null || !better(game, before.mine, before.partner));

  if (tookLead && req.partnerId) {
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'game',
      emoji: '🏆',
      title: `${req.user.name} beat your ${game.name} score`,
      body: `${fmt(game, score)} vs your ${fmt(game, before.partner!)}. Your move!`,
      url: `/games/arcade/${id}`,
      timezone: req.couple.timezone,
    });
  }
  sync(req.couple._id, 'arcade');
  touchActivity(req.couple, req.user._id);
  const after = (await leaderboard(req))[id];
  res.status(201).json({ best: after, personalBest, tookLead });
});

/* ── Daily word: the same secret word for both of you each day ───────── */

const MAX_GUESSES = 6;

function wordOfTheDay(req: Request, date: string) {
  return pick(DAILY_WORDS, `${req.couple._id}:${date}`);
}

type Play = InstanceType<typeof DailyWordPlay>;

function playJSON(play: Play | null, answer: string) {
  return {
    guesses: (play?.guesses ?? []).map((g) => ({ word: g, marks: markGuess(g, answer) })),
    solved: play?.solved ?? false,
    finished: play?.finished ?? false,
  };
}

async function dailyView(req: Request) {
  const date = todayIn(req.couple.timezone);
  const answer = wordOfTheDay(req, date);
  const [mine, theirs, history] = await Promise.all([
    DailyWordPlay.findOne({ coupleId: req.couple._id, date, userId: req.user._id }),
    req.partnerId ? DailyWordPlay.findOne({ coupleId: req.couple._id, date, userId: req.partnerId }) : null,
    DailyWordPlay.find({ coupleId: req.couple._id, finished: true, date: { $ne: date } }).select('date userId solved guesses').lean(),
  ]);
  const me = playJSON(mine, answer);
  const partner = playJSON(theirs, answer);

  // Head-to-head over past days: fewer guesses wins; not solving loses to solving.
  const byDate = new Map<string, { mine?: number; theirs?: number }>();
  for (const p of history) {
    const tries = p.solved ? p.guesses.length : MAX_GUESSES + 1;
    const entry = byDate.get(p.date) ?? {};
    if (String(p.userId) === String(req.user._id)) entry.mine = tries;
    else entry.theirs = tries;
    byDate.set(p.date, entry);
  }
  const tally = { wins: 0, losses: 0, ties: 0 };
  for (const day of byDate.values()) {
    if (day.mine === undefined || day.theirs === undefined) continue;
    if (day.mine < day.theirs) tally.wins++;
    else if (day.mine > day.theirs) tally.losses++;
    else tally.ties++;
  }

  return {
    date,
    length: answer.length,
    maxGuesses: MAX_GUESSES,
    me,
    // Their letters stay hidden until you've finished; you only see how far along they are.
    partner: me.finished ? partner : { guesses: partner.guesses.map((g) => ({ word: '', marks: g.marks.map(() => -1) })), solved: partner.solved, finished: partner.finished },
    answer: me.finished ? answer : null,
    tally,
  };
}

router.get('/daily-word', async (req, res) => {
  res.json(await dailyView(req));
});

router.post('/daily-word/guess', async (req, res) => {
  const { guess } = z.object({ guess: z.string().trim().toLowerCase().regex(/^[a-z]{5}$/, 'Guesses are 5 letters') }).parse(req.body);
  const date = todayIn(req.couple.timezone);
  const answer = wordOfTheDay(req, date);
  const play = (await DailyWordPlay.findOne({ coupleId: req.couple._id, date, userId: req.user._id })) ?? new DailyWordPlay({ coupleId: req.couple._id, date, userId: req.user._id });
  if (play.finished) throw badRequest("You've finished today's word. A new one comes tomorrow.");
  if (!(await isWord(guess))) throw badRequest("That's not in the word list", 'not_a_word');

  play.guesses.push(guess);
  if (guess === answer) play.solved = true;
  if (play.solved || play.guesses.length >= MAX_GUESSES) play.finished = true;
  await play.save();

  if (play.finished && req.partnerId) {
    const partnerDone = await DailyWordPlay.exists({ coupleId: req.couple._id, date, userId: req.partnerId, finished: true });
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'game',
      emoji: play.solved ? '🟩' : '🟥',
      title: play.solved ? `${req.user.name} solved today's word in ${play.guesses.length}` : `${req.user.name} didn't get today's word`,
      body: partnerDone ? 'See how you compare.' : 'Can you do better?',
      url: '/games/arcade/daily-word',
      dedupeKey: `daily-word:${req.user._id}:${date}`,
      timezone: req.couple.timezone,
    });
  }
  sync(req.couple._id, 'arcade');
  touchActivity(req.couple, req.user._id);
  res.json(await dailyView(req));
});

export default router;
