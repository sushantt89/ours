import crypto from 'node:crypto';
import { TRIVIA } from '../data/trivia';
import { COMMON_WORDS, RACE_LETTERS } from '../data/wordrace';
import { isWord } from '../services/words';
import { invalid, isInt, other, type Seat, type TurnGame } from './types';

const shuffled = <T>(items: readonly T[]) => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/* ── Trivia duel: the same 10 questions, both answer at once ─────────── */

const QUESTIONS = 10;
interface TriviaState {
  questions: { q: string; options: string[]; answer: number }[];
  /** Per seat: the option picked for each question answered so far, and how long it took. */
  picks: [number[], number[]];
  ms: [number[], number[]];
  /** When each seat's current question was shown, so speed can break ties. */
  shownAt: [number | null, number | null];
}

const correctCount = (s: TriviaState, seat: Seat) => s.picks[seat].filter((p, i) => p === s.questions[i].answer).length;
const totalMs = (s: TriviaState, seat: Seat) => s.ms[seat].reduce((a, b) => a + b, 0);

export const trivia: TurnGame<TriviaState> = {
  name: 'Trivia duel',
  firstTurn: null,
  init: () => ({
    questions: shuffled(TRIVIA)
      .slice(0, QUESTIONS)
      .map(([q, right, ...wrong]) => {
        const options = shuffled([right, ...wrong]);
        return { q, options, answer: options.indexOf(right) };
      }),
    picks: [[], []],
    ms: [[], []],
    shownAt: [null, null],
  }),
  move(s, seat, m: { start?: true; pick?: number }) {
    const i = s.picks[seat].length;
    if (i >= QUESTIONS) throw invalid("You've answered them all. Waiting for your partner");
    if (m?.start) {
      // Phone says the question is on screen: start its clock (once).
      s.shownAt[seat] ??= Date.now();
      return { turn: null };
    }
    if (!isInt(m?.pick, 0, 3)) throw invalid('Pick one of the answers');
    const shown = s.shownAt[seat] ?? Date.now();
    s.picks[seat].push(m.pick);
    s.ms[seat].push(Math.min(60_000, Date.now() - shown));
    s.shownAt[seat] = i + 1 < QUESTIONS ? Date.now() : null;
    if (s.picks[0].length === QUESTIONS && s.picks[1].length === QUESTIONS) {
      const [a, b] = [correctCount(s, 0), correctCount(s, 1)];
      if (a !== b) return { turn: null, winner: a > b ? 0 : 1 };
      const [ta, tb] = [totalMs(s, 0), totalMs(s, 1)];
      return { turn: null, winner: ta === tb ? 'draw' : ta < tb ? 0 : 1 };
    }
    return { turn: null };
  },
  view(s, seat, done) {
    const mine = s.picks[seat];
    const theirs = s.picks[other(seat)];
    const i = mine.length;
    return {
      total: QUESTIONS,
      index: i,
      // The next question, without its answer.
      current: i < QUESTIONS ? { q: s.questions[i].q, options: s.questions[i].options } : null,
      // Your answers so far, marked; theirs only as a running score until the end.
      mine: mine.map((p, k) => ({ q: s.questions[k].q, options: s.questions[k].options, picked: p, answer: s.questions[k].answer })),
      myScore: correctCount(s, seat),
      myMs: totalMs(s, seat),
      theirProgress: theirs.length,
      theirScore: correctCount(s, other(seat)),
      theirMs: done ? totalMs(s, other(seat)) : null,
      theirPicks: done ? theirs : null,
    };
  },
};

/* ── Word race: same letters, most points in two minutes ─────────────── */

const RACE_MS = 120_000;
const LETTERS = 7;
interface RaceState {
  letters: string;
  words: [string[], string[]];
  startedAt: [number | null, number | null];
  finished: [boolean, boolean];
  /** Everyday words these letters make (the dictionary accepts many more). Older matches don't have it. */
  possible?: string[];
}

let raceSeeds: string[] | null = null;
let common: string[] | null = null;

const wordPoints = (w: string) => (w.length <= 3 ? 1 : w.length - 2) + (w.length === LETTERS ? 5 : 0);
const points = (words: string[]) => words.reduce((t, w) => t + wordPoints(w), 0);
const fromLetters = (word: string, letters: string) => {
  const pool = [...letters];
  for (const ch of word) {
    const k = pool.indexOf(ch);
    if (k < 0) return false;
    pool.splice(k, 1);
  }
  return true;
};
const timeUp = (s: RaceState, seat: Seat) => s.startedAt[seat] !== null && Date.now() - s.startedAt[seat]! > RACE_MS + 3000;

function raceOutcome(s: RaceState) {
  const done = (seat: Seat) => s.finished[seat] || timeUp(s, seat);
  if (!done(0) || !done(1)) return { turn: null } as const;
  const [a, b] = [points(s.words[0]), points(s.words[1])];
  return { turn: null, winner: a === b ? ('draw' as const) : a > b ? (0 as const) : (1 as const) };
}

export const wordrace: TurnGame<RaceState> = {
  name: 'Word race',
  firstTurn: null,
  init: () => {
    raceSeeds ??= RACE_LETTERS.split(' ');
    common ??= COMMON_WORDS.split(' ');
    const letters = shuffled([...raceSeeds[crypto.randomInt(raceSeeds.length)]]).join('');
    const possible = common.filter((w) => fromLetters(w, letters)).sort((a, b) => b.length - a.length || a.localeCompare(b));
    return { letters, words: [[], []], startedAt: [null, null], finished: [false, false], possible };
  },
  async move(s, seat, m: { start?: true; word?: string; finish?: true }) {
    if (s.finished[seat]) throw invalid("You're done. Waiting for your partner");
    if (m?.start) {
      s.startedAt[seat] ??= Date.now();
      return raceOutcome(s);
    }
    if (m?.finish || timeUp(s, seat)) {
      s.finished[seat] = true;
      s.startedAt[seat] ??= Date.now();
      // A word sent after the clock ran out just ends your round (throwing would lose that).
      return raceOutcome(s);
    }
    if (s.startedAt[seat] === null) throw invalid('Press start first');
    const word = typeof m?.word === 'string' ? m.word.trim().toLowerCase() : '';
    if (!/^[a-z]{3,7}$/.test(word)) throw invalid('Words need at least 3 letters');
    if (!fromLetters(word, s.letters)) throw invalid('Use only the letters you have');
    if (s.words[seat].includes(word)) throw invalid('You already found that one');
    if (!(await isWord(word))) throw invalid(`“${word}” isn’t in our dictionary`);
    s.words[seat].push(word);
    return { turn: null };
  },
  view(s, seat, done) {
    const theirs = s.words[other(seat)];
    return {
      letters: s.letters,
      durationMs: RACE_MS,
      startedAt: s.startedAt[seat],
      finished: s.finished[seat] || timeUp(s, seat),
      mine: s.words[seat],
      myPoints: points(s.words[seat]),
      theirCount: theirs.length,
      theirPoints: points(theirs),
      theirFinished: s.finished[other(seat)] || timeUp(s, other(seat)),
      theirWords: done ? theirs : null,
      possibleCount: s.possible?.length ?? null,
      // At the end: the best everyday words neither of you found.
      missed: done && s.possible ? s.possible.filter((w) => !s.words[0].includes(w) && !s.words[1].includes(w)).slice(0, 24) : null,
    };
  },
};
