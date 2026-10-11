import { Router, type Request } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Match, type MatchDoc } from '../models';
import { TURN_GAMES, type Seat } from '../games';
import { notify } from '../services/notify';
import { sync } from '../services/realtime';
import { touchActivity } from '../services/streak';
import { owned } from '../utils/owned';
import { badRequest, notFound } from '../utils/http';

/**
 * Turn-based games on both phones: tic-tac-toe, battleship, hangman and friends.
 * The server holds the real state, checks every move and only shows each player
 * what they're allowed to see.
 */
const router = Router();

const seatOf = (match: MatchDoc, req: Request): Seat => (match.players[0].equals(req.user._id) ? 0 : 1);

function matchJSON(match: MatchDoc, req: Request) {
  const game = TURN_GAMES[match.game];
  const seat = seatOf(match, req);
  const done = match.status === 'done';
  const winner = match.winner as Seat | 'draw' | 'none' | null;
  return {
    id: String(match._id),
    game: match.game,
    name: game?.name ?? match.game,
    seat,
    turn: done ? null : match.turn === null ? 'both' : match.turn === seat ? 'me' : 'partner',
    status: match.status,
    result: !done ? null : winner === 'draw' || winner === 'none' ? winner : winner === seat ? 'won' : 'lost',
    view: game ? game.view(structuredClone(match.state), seat, done) : null,
    moves: match.moves,
    createdAt: match.get('createdAt'),
    updatedAt: match.get('updatedAt'),
  };
}

/** Wins, losses and draws for each game, from your side. */
async function records(req: Request) {
  const finished = await Match.find({ coupleId: req.couple._id, status: 'done' }).select('game players winner').lean();
  const out: Record<string, { won: number; lost: number; drawn: number }> = {};
  for (const m of finished) {
    const r = (out[m.game] ??= { won: 0, lost: 0, drawn: 0 });
    const seat = String(m.players[0]) === String(req.user._id) ? 0 : 1;
    if (m.winner === 'draw') r.drawn++;
    else if (m.winner === 0 || m.winner === 1) r[m.winner === seat ? 'won' : 'lost']++;
  }
  return out;
}

router.get('/', async (req, res) => {
  const [active, recent] = await Promise.all([
    Match.find({ coupleId: req.couple._id, status: 'active' }).sort({ updatedAt: -1 }).limit(30),
    Match.find({ coupleId: req.couple._id, status: 'done' }).sort({ updatedAt: -1 }).limit(15),
  ]);
  res.json({ matches: [...active, ...recent].map((m) => matchJSON(m, req)), records: await records(req) });
});

router.get('/:id', async (req, res) => {
  res.json({ match: matchJSON(await owned(Match, req, 'That game'), req) });
});

router.post('/', async (req, res) => {
  const body = z.object({ game: z.string().max(32), setup: z.unknown().optional() }).parse(req.body);
  const game = TURN_GAMES[body.game];
  if (!game) throw notFound('That game');
  if (!req.partnerId) throw badRequest('Games need two players. Invite your partner first.');
  const state = await game.init(body.setup);
  const match = await Match.create({ coupleId: req.couple._id, game: body.game, players: [req.user._id, req.partnerId], state, turn: game.firstTurn });
  sync(req.couple._id, 'matches');
  await notify({
    userId: req.partnerId,
    coupleId: req.couple._id,
    type: 'game',
    emoji: '🎲',
    title: `${req.user.name} challenged you to ${game.name}`,
    body: game.firstTurn === 0 ? 'They go first.' : 'Your move!',
    url: `/games/match/${match._id}`,
    timezone: req.couple.timezone,
  });
  res.status(201).json({ match: matchJSON(match, req) });
});

router.post('/:id/move', async (req, res) => {
  const { move } = z.object({ move: z.unknown() }).parse(req.body);
  // Load, apply and save; if your partner's move landed in between, start again from theirs.
  let match: MatchDoc;
  let game: (typeof TURN_GAMES)[string];
  let seat: Seat;
  for (let attempt = 0; ; attempt++) {
    match = await owned(Match, req, 'That game');
    game = TURN_GAMES[match.game];
    if (!game) throw notFound('That game');
    if (match.status === 'done') throw badRequest('This game is over');
    seat = seatOf(match, req);
    if (match.turn !== null && match.turn !== seat) throw badRequest("It's your partner's turn", 'not_your_turn');

    const state = structuredClone(match.state);
    const outcome = await game.move(state, seat, move);
    match.state = state;
    match.markModified('state');
    match.moves += 1;
    match.turn = outcome.turn;
    if (outcome.winner !== undefined) {
      match.status = 'done';
      match.winner = outcome.winner;
      match.turn = null;
    }
    try {
      await match.save();
      break;
    } catch (err) {
      if (!(err instanceof mongoose.Error.VersionError) || attempt >= 4) throw err;
    }
  }
  sync(req.couple._id, 'matches');
  touchActivity(req.couple, req.user._id);

  // Let your partner know when it's on them (or the game is over).
  const partnerSeat: Seat = seat === 0 ? 1 : 0;
  if (req.partnerId && (match.status === 'done' || match.turn === partnerSeat)) {
    const result = match.status === 'done' ? (match.winner === seat ? 'won' : match.winner === partnerSeat ? 'lost' : 'ended') : null;
    await notify({
      userId: req.partnerId,
      coupleId: req.couple._id,
      type: 'game',
      emoji: result === 'won' ? '🏆' : '🎲',
      title:
        result === 'won'
          ? `${req.user.name} won ${game.name}`
          : result === 'lost'
            ? `You won ${game.name}! 🎉`
            : result === 'ended'
              ? `${game.name} is finished`
              : `Your turn in ${game.name}`,
      url: `/games/match/${match._id}`,
      // Moves would flood the notification list; they still reach the phone.
      transient: !result,
      timezone: req.couple.timezone,
    });
  }
  res.json({ match: matchJSON(match, req) });
});

router.delete('/:id', async (req, res) => {
  const match = await owned(Match, req, 'That game');
  await match.deleteOne();
  sync(req.couple._id, 'matches');
  res.json({ ok: true });
});

export default router;
