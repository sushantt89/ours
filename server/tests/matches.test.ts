import { describe, expect, it } from 'vitest';
import { makeCouple } from './helpers';
import { Match, Notification } from '../src/models';
import { FLEET } from '../src/games/tactics';

type Person = Awaited<ReturnType<typeof makeCouple>>['one'];
const start = async (p: Person, game: string, setup?: unknown) => (await p.post('/api/matches', { game, setup })).body.match;
const move = async (p: Person, id: string, mv: unknown) => p.post(`/api/matches/${id}/move`, { move: mv });

describe('turn-based matches', () => {
  it('tic-tac-toe: takes turns, refuses out-of-turn moves, and records the win', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'tictactoe');
    expect(m.turn).toBe('me');
    expect((await move(two, m.id, { r: 0, c: 0 })).status).toBe(400);
    for (const [p, r, c] of [
      [one, 0, 0],
      [two, 1, 0],
      [one, 0, 1],
      [two, 1, 1],
    ] as const)
      expect((await move(p, m.id, { r, c })).status).toBe(200);
    expect((await move(two, m.id, { r: 2, c: 2 })).status).toBe(400); // not Sam's turn
    const won = (await move(one, m.id, { r: 0, c: 2 })).body.match;
    expect(won).toMatchObject({ status: 'done', result: 'won' });
    const list = (await two.get('/api/matches')).body;
    expect(list.matches[0].result).toBe('lost');
    expect(list.records.tictactoe).toEqual({ won: 0, lost: 1, drawn: 0 });
    expect(await Notification.countDocuments({ userId: two.id, title: 'Alex won Tic-tac-toe' })).toBe(1);
  });

  it('connect four: pieces stack and four in a column wins', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'connect4');
    for (let i = 0; i < 3; i++) {
      await move(one, m.id, { c: 3 });
      await move(two, m.id, { c: 4 });
    }
    const done = (await move(one, m.id, { c: 3 })).body.match;
    expect(done.result).toBe('won');
    expect(done.view.board[2][3]).toBe(0);
  });

  it('dots and boxes: closing a box gives another turn', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'dots');
    await move(one, m.id, { dir: 'h', r: 0, c: 0 });
    await move(two, m.id, { dir: 'h', r: 1, c: 0 });
    await move(one, m.id, { dir: 'v', r: 0, c: 0 });
    const closed = (await move(two, m.id, { dir: 'v', r: 0, c: 1 })).body.match;
    expect(closed.view.score).toEqual([0, 1]);
    expect(closed.turn).toBe('me'); // Sam goes again
  });

  it('battleship: fleets stay hidden and sinking everything wins', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'battleship');
    const fleet = FLEET.map((len, i) => ({ r: i, c: 0, len, dir: 'h' }));
    expect((await move(one, m.id, { fire: [0, 0] })).status).toBe(400); // not placed yet
    expect((await move(one, m.id, { place: [{ r: 0, c: 0, len: 9, dir: 'h' }] })).status).toBe(400);
    await move(one, m.id, { place: fleet });
    const placed = (await move(two, m.id, { place: fleet })).body.match;
    expect(placed.view.myShips).toHaveLength(FLEET.length);
    const alexView = (await one.get(`/api/matches/${m.id}`)).body.match.view;
    expect(alexView.sunk).toEqual([]); // can't see Sam's ships
    const targets = fleet.flatMap((s) => Array.from({ length: s.len }, (_, k) => [s.r, s.c + k]));
    let last;
    for (let i = 0; i < targets.length; i++) {
      last = (await move(one, m.id, { fire: targets[i] })).body.match;
      if (i < targets.length - 1) await move(two, m.id, { fire: [7 - Math.floor(i / 8), i % 8] });
    }
    expect(last.result).toBe('won');
    expect(last.view.sunk).toHaveLength(FLEET.length);
  });

  it('checkers: captures are compulsory', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'checkers');
    await move(one, m.id, { from: [5, 2], to: [4, 3] });
    await move(two, m.id, { from: [2, 5], to: [3, 4] });
    // Alex can take at (3,4), so a quiet move is refused.
    expect((await move(one, m.id, { from: [5, 0], to: [4, 1] })).body.error.message).toMatch(/have to take/);
    const took = (await move(one, m.id, { from: [4, 3], to: [2, 5] })).body.match;
    expect(took.view.board[3][4]).toBeNull();
  });

  it('mancala: ending in your store earns another go', async () => {
    const { one } = await makeCouple();
    const m = await start(one, 'mancala');
    const again = (await move(one, m.id, { pit: 2 })).body.match; // 4 seeds from pit 2 land in the store
    expect(again.view.pits[6]).toBe(1);
    expect(again.turn).toBe('me');
  });

  it('reversi: a move must flip something', async () => {
    const { one } = await makeCouple();
    const m = await start(one, 'reversi');
    expect((await move(one, m.id, { r: 0, c: 0 })).status).toBe(400);
    const ok = (await move(one, m.id, { r: 2, c: 3 })).body.match;
    expect(ok.view.score).toEqual([4, 1]);
  });

  it('rock paper scissors: picks stay secret until both are in', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'rps');
    await move(one, m.id, { pick: 'rock' });
    const samSees = (await two.get(`/api/matches/${m.id}`)).body.match.view;
    expect(samSees).toMatchObject({ theyPicked: true, myPick: null, rounds: [] });
    expect(JSON.stringify(samSees)).not.toContain('rock');
    for (let i = 0; i < 3; i++) {
      if (i) await move(one, m.id, { pick: 'rock' });
      await move(two, m.id, { pick: 'scissors' });
    }
    expect((await one.get(`/api/matches/${m.id}`)).body.match).toMatchObject({ status: 'done', result: 'won' });
  });

  it('hangman: the guesser never sees the word until the end', async () => {
    const { one, two } = await makeCouple();
    expect((await one.post('/api/matches', { game: 'hangman', setup: { word: 'no way!' } })).status).toBe(400);
    const m = await start(one, 'hangman', { word: 'Paris', hint: 'A city' });
    const sam = (await two.get(`/api/matches/${m.id}`)).body.match;
    expect(sam.view).toMatchObject({ word: null, length: 5, hint: 'A city' });
    expect(JSON.stringify(sam)).not.toContain('paris');
    expect((await move(one, m.id, { letter: 'a' })).status).toBe(400); // the setter doesn't guess
    await move(two, m.id, { letter: 'a' });
    expect((await two.get(`/api/matches/${m.id}`)).body.match.view.pattern).toEqual(['', 'a', '', '', '']);
    const solved = (await move(two, m.id, { solve: 'paris' })).body.match;
    expect(solved).toMatchObject({ result: 'won', view: { word: 'paris' } });
  });

  it('word chain: words must chain, be real and not repeat', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'wordchain');
    const first = m.view.chain[0].word as string;
    const last = first.slice(-1);
    expect((await move(one, m.id, { word: 'zzzz' })).status).toBe(400);
    const word = { a: 'apple', b: 'bread', c: 'cloud', d: 'dream', e: 'eagle', f: 'flame', g: 'grape', h: 'house', k: 'kitten', l: 'lemon', m: 'music', n: 'night', o: 'ocean', p: 'piano', r: 'river', s: 'smile', t: 'tiger', y: 'yellow' }[last] ?? null;
    if (word) expect((await move(one, m.id, { word })).status).toBe(200);
    const gaveUp = (await move(word ? two : one, m.id, { giveUp: true })).body.match;
    expect(gaveUp.status).toBe('done');
  });

  it('20 questions: the secret stays with the person who chose it', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'twentyq', { secret: 'The Eiffel Tower', category: 'Place' });
    expect((await two.get(`/api/matches/${m.id}`)).body.match.view.secret).toBeNull();
    await move(two, m.id, { ask: 'Is it in Europe?' });
    await move(one, m.id, { answer: 'yes' });
    await move(two, m.id, { guess: 'The Eiffel Tower' });
    const done = (await move(one, m.id, { correct: true })).body.match;
    expect(done.result).toBe('lost'); // Sam guessed it
    expect((await two.get(`/api/matches/${m.id}`)).body.match.view.secret).toBe('The Eiffel Tower');
  });

  it('draw and guess: the word is hidden from the guesser, and three tries are allowed', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'drawguess');
    expect(m.view.word).toBeTruthy();
    expect((await two.get(`/api/matches/${m.id}`)).body.match.view.word).toBeNull();
    await move(one, m.id, { strokes: [{ c: '#e0567a', w: 4, p: [10, 10, 50, 50] }] });
    await move(two, m.id, { guess: 'nope' });
    await move(two, m.id, { guess: 'still no' });
    const done = (await move(two, m.id, { guess: m.view.word })).body.match;
    expect(done).toMatchObject({ status: 'done', result: 'none', view: { solved: true } });
  });

  it('story together: lines alternate and it can be finished', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'story');
    for (let i = 0; i < 4; i++) await move(i % 2 ? two : one, m.id, { line: `Line ${i}` });
    const done = (await move(one, m.id, { end: true })).body.match;
    expect(done.view.lines).toHaveLength(5);
    expect(done.status).toBe('done');
  });

  it('trivia duel: both answer the same questions at once, answers stay hidden, more correct wins', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'trivia');
    expect(m.turn).toBe('both');
    expect(m.view.current.options).toHaveLength(4);
    expect(JSON.stringify(m.view.current)).not.toContain('answer');
    const answers = ((await Match.findById(m.id).lean())!.state as { questions: { answer: number }[] }).questions.map((q) => q.answer);
    // Both answer the first question at the same moment: neither answer may be lost.
    await Promise.all([move(one, m.id, { start: true }), move(two, m.id, { start: true })]);
    const [a, b] = await Promise.all([move(one, m.id, { pick: answers[0] }), move(two, m.id, { pick: (answers[0] + 1) % 4 })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const after = (await one.get(`/api/matches/${m.id}`)).body.match.view;
    expect(after).toMatchObject({ index: 1, myScore: 1, theirProgress: 1, theirScore: 0, theirPicks: null });
    for (let i = 1; i < 10; i++) {
      await move(one, m.id, { pick: answers[i] });
      await move(two, m.id, { pick: answers[i] });
    }
    const done = (await two.get(`/api/matches/${m.id}`)).body.match;
    expect(done).toMatchObject({ status: 'done', result: 'lost' });
    expect(done.view.theirPicks).toHaveLength(10);
    expect((await move(one, m.id, { pick: 0 })).status).toBe(400);
  });

  it('word race: only real words from the letters count, and the higher score wins', async () => {
    const { one, two } = await makeCouple();
    const m = await start(one, 'wordrace');
    const letters: string = m.view.letters;
    expect(letters).toHaveLength(7);
    expect((await move(one, m.id, { word: 'abc' })).status).toBe(400); // not started
    await Promise.all([move(one, m.id, { start: true }), move(two, m.id, { start: true })]);
    // The seed word itself always fits and is worth a bonus.
    const seed = ((await Match.findById(m.id).lean())!.state as { letters: string }).letters;
    const { RACE_LETTERS } = await import('../src/data/wordrace');
    expect(RACE_LETTERS.split(' ').length).toBeGreaterThan(7000);
    expect(m.view.possibleCount).toBeGreaterThanOrEqual(12);
    const full = RACE_LETTERS.split(' ').find((w) => w.length === 7 && [...w].sort().join('') === [...seed].sort().join(''))!;
    expect((await move(one, m.id, { word: full })).body.match.view.myPoints).toBe(10);
    expect((await move(one, m.id, { word: full })).status).toBe(400); // repeat
    expect((await move(one, m.id, { word: 'zzzzzzz' })).status).toBe(400); // wrong letters
    expect((await move(two, m.id, { finish: true })).body.match.status).toBe('active');
    const done = (await move(one, m.id, { finish: true })).body.match;
    expect(done).toMatchObject({ status: 'done', result: 'won' });
    expect(done.view.theirWords).toEqual([]);
    expect(done.view.missed.length).toBeGreaterThan(0);
    expect(done.view.missed).not.toContain(full);
  });

  it("keeps other couples' matches private", async () => {
    const a = await makeCouple('Ana', 'Ben');
    const b = await makeCouple('Cat', 'Dan');
    const m = await start(a.one, 'tictactoe');
    expect((await b.one.get(`/api/matches/${m.id}`)).status).toBe(404);
    expect((await move(b.one, m.id, { r: 0, c: 0 })).status).toBe(404);
  });
});
