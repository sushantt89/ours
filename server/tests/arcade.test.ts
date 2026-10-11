import { describe, expect, it } from 'vitest';
import { makeCouple } from './helpers';
import { Notification } from '../src/models';
import { DAILY_WORDS, SCRAMBLE_WORDS } from '../src/data/wordgames';
import { isWord, markGuess, pick } from '../src/services/words';
import { todayIn } from '../src/utils/dates';

describe('arcade leaderboard', () => {
  it('keeps each best score and tells your partner when you take the lead', async () => {
    const { one, two } = await makeCouple();
    await two.post('/api/arcade/snake/score', { score: 40 });
    const first = await one.post('/api/arcade/snake/score', { score: 25 });
    expect(first.body).toMatchObject({ personalBest: true, tookLead: false, best: { mine: 25, partner: 40 } });

    const second = await one.post('/api/arcade/snake/score', { score: 55 });
    expect(second.body).toMatchObject({ personalBest: true, tookLead: true, best: { mine: 55, partner: 40, myPlays: 2 } });
    const told = await Notification.find({ userId: two.id, type: 'game' }).lean();
    expect(told.map((n) => n.title)).toContain('Alex beat your Snake score');

    // Beating your own lead again doesn't keep notifying.
    await one.post('/api/arcade/snake/score', { score: 60 });
    expect(await Notification.countDocuments({ userId: two.id, title: 'Alex beat your Snake score' })).toBe(1);
    expect((await two.get('/api/arcade')).body.board.snake).toMatchObject({ mine: 40, partner: 60 });
  });

  it('treats lower as better where it should, and refuses impossible scores', async () => {
    const { one, two } = await makeCouple();
    await one.post('/api/arcade/reaction/score', { score: 300 });
    await one.post('/api/arcade/reaction/score', { score: 240 });
    await two.post('/api/arcade/reaction/score', { score: 260 });
    expect((await one.get('/api/arcade')).body.board.reaction).toMatchObject({ mine: 240, partner: 260 });
    expect((await one.post('/api/arcade/reaction/score', { score: 3 })).status).toBe(400);
    expect((await one.post('/api/arcade/nope/score', { score: 3 })).status).toBe(404);
  });
});

describe('daily word', () => {
  it('only ever uses real words', async () => {
    for (const w of [...DAILY_WORDS, ...SCRAMBLE_WORDS]) expect(await isWord(w)).toBe(true);
    expect(await isWord('zzzzz')).toBe(false);
  });

  it('marks letters like Wordle, including repeated letters', () => {
    expect(markGuess('apple', 'apple')).toEqual([2, 2, 2, 2, 2]);
    expect(markGuess('eerie', 'there')).toEqual([1, 0, 1, 0, 2]);
    expect(markGuess('llama', 'hello')).toEqual([1, 1, 0, 0, 0]);
  });

  it('gives both partners the same word, hides theirs until you finish, and keeps score', async () => {
    const { one, two, coupleId } = await makeCouple();
    const date = todayIn('Australia/Adelaide');
    const answer = pick(DAILY_WORDS, `${coupleId}:${date}`);

    expect((await one.post('/api/arcade/daily-word/guess', { guess: 'qwxyz' })).status).toBe(400);
    const wrong = DAILY_WORDS.find((w) => w !== answer)!;
    let view = (await one.post('/api/arcade/daily-word/guess', { guess: wrong })).body;
    expect(view.me.guesses).toHaveLength(1);
    expect(view.answer).toBeNull();
    view = (await one.post('/api/arcade/daily-word/guess', { guess: answer })).body;
    expect(view.me).toMatchObject({ solved: true, finished: true });
    expect(view.answer).toBe(answer);

    // Sam hasn't finished: Alex's letters are hidden from Sam, only the shape shows.
    const samView = (await two.get('/api/arcade/daily-word')).body;
    expect(samView.partner.guesses[0].word).toBe('');
    expect(samView.partner.solved).toBe(true);
    expect(samView.answer).toBeNull();
    expect(await Notification.countDocuments({ userId: two.id, type: 'game' })).toBe(1);

    expect((await one.post('/api/arcade/daily-word/guess', { guess: answer })).status).toBe(400);
  });
});

describe('more couple games', () => {
  it('plays "Would you rather" and counts matches', async () => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: 'would_you_rather' })).body.game;
    expect(game.prompts).toHaveLength(10);
    const picks = game.prompts.map(() => 0);
    await one.post(`/api/games/${game.id}/answer`, { picks });
    const done = (await two.post(`/api/games/${game.id}/answer`, { picks: picks.map((_: number, i: number) => (i < 7 ? 0 : 1)) })).body.game;
    expect(done).toMatchObject({ status: 'done', score: 7 });
  });

  it.each(['dream_date', 'love_language', 'our_future', 'flags'])('plays %s with identical picks as a full match', async (id) => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: id })).body.game;
    expect(game.prompts.length).toBeGreaterThanOrEqual(8);
    const picks = game.prompts.map((p: { options: string[] }) => p.options.length - 1);
    await one.post(`/api/games/${game.id}/answer`, { picks });
    const done = (await two.post(`/api/games/${game.id}/answer`, { picks })).body.game;
    expect(done).toMatchObject({ status: 'done', score: game.prompts.length });
  });

  it('deep questions take long written answers', async () => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: 'deep_questions' })).body.game;
    expect(game.prompts).toHaveLength(3);
    const texts = game.prompts.map(() => 'x'.repeat(900));
    expect((await one.post(`/api/games/${game.id}/answer`, { texts })).status).toBe(200);
    expect((await two.post(`/api/games/${game.id}/answer`, { texts })).body.game.status).toBe('done');
  });

  it('counts ratings within one point as a match', async () => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: 'rate_it' })).body.game;
    await one.post(`/api/games/${game.id}/answer`, { picks: [4, 4, 4, 4, 0, 0, 0, 0] });
    const done = (await two.post(`/api/games/${game.id}/answer`, { picks: [3, 4, 2, 0, 1, 0, 4, 0] })).body.game;
    expect(done.score).toBe(5);
  });

  it('keeps written answers hidden until both have finished the sentence', async () => {
    const { one, two } = await makeCouple();
    const game = (await one.post('/api/games', { game: 'finish_sentence' })).body.game;
    const texts = game.prompts.map((_: unknown, i: number) => `answer ${i}`);
    expect((await one.post(`/api/games/${game.id}/answer`, { picks: [] })).status).toBe(400);
    await one.post(`/api/games/${game.id}/answer`, { texts });
    expect((await two.get('/api/games')).body.games[0].partnerTexts).toBeNull();
    const done = (await two.post(`/api/games/${game.id}/answer`, { texts: texts.map((t: string) => `${t}!`) })).body.game;
    expect(done).toMatchObject({ status: 'done', score: null, partnerTexts: texts });
  });

  it('two truths and a lie: the lie stays secret until the guess', async () => {
    const { one, two } = await makeCouple();
    const made = await one.post('/api/games', { game: 'two_truths', statements: ['I have been to Japan', 'I can juggle', 'I hate chocolate'], lie: 2 });
    expect(made.body.game.youPlay).toBe(false);
    const seen = (await two.get('/api/games')).body.games[0];
    expect(seen.prompts[0].correct).toBeNull();
    expect((await one.post(`/api/games/${seen.id}/answer`, { picks: [2] })).status).toBe(400);
    const done = (await two.post(`/api/games/${seen.id}/answer`, { picks: [2] })).body.game;
    expect(done).toMatchObject({ status: 'done', score: 1 });
    expect(done.prompts[0].correct).toBe(2);
    expect((await one.post('/api/games', { game: 'two_truths', statements: ['a', 'b'] })).status).toBe(400);
  });
});
