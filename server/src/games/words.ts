import crypto from 'node:crypto';
import { SCRAMBLE_WORDS } from '../data/wordgames';
import { isWord } from '../services/words';
import { invalid, other, type Seat, type TurnGame } from './types';

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const randomOf = <T>(items: readonly T[]) => items[crypto.randomInt(items.length)];

/* ── Rock paper scissors: first to 3 ─────────────────────────────────── */

type Throw = 'rock' | 'paper' | 'scissors';
const BEATS: Record<Throw, Throw> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
interface RpsState {
  current: [Throw | null, Throw | null];
  rounds: { picks: [Throw, Throw]; winner: Seat | null }[];
  score: [number, number];
}

export const rps: TurnGame<RpsState> = {
  name: 'Rock paper scissors',
  firstTurn: null, // both pick at the same time
  init: () => ({ current: [null, null], rounds: [], score: [0, 0] }),
  move(s, seat, m: { pick: Throw }) {
    if (!m || !(m.pick in BEATS)) throw invalid('Pick rock, paper or scissors');
    if (s.current[seat]) throw invalid("You've picked. Waiting for your partner");
    s.current[seat] = m.pick;
    const [a, b] = s.current;
    if (a && b) {
      const winner: Seat | null = a === b ? null : BEATS[a] === b ? 0 : 1;
      s.rounds.push({ picks: [a, b], winner });
      if (winner !== null) s.score[winner]++;
      s.current = [null, null];
      if (s.score[0] === 3 || s.score[1] === 3) return { turn: null, winner: s.score[0] === 3 ? 0 : 1 };
    }
    return { turn: null };
  },
  // You only see whether they've picked this round, not what.
  view: (s, seat) => ({ rounds: s.rounds, score: s.score, myPick: s.current[seat], theyPicked: Boolean(s.current[other(seat)]) }),
};

/* ── Hangman: one sets a word, the other guesses ─────────────────────── */

const MAX_WRONG = 6;
interface HangmanState {
  word: string;
  hint: string;
  guessed: string[];
  wrong: number;
}

export const hangman: TurnGame<HangmanState> = {
  name: 'Hangman',
  firstTurn: 1, // the person who set the word watches
  async init(setup) {
    const { word, hint } = (setup ?? {}) as { word?: string; hint?: string };
    const w = clean(word, 20).toLowerCase();
    if (!/^[a-z]{3,14}$/.test(w)) throw invalid('Choose a word of 3 to 14 letters (letters only)');
    return { word: w, hint: clean(hint, 80), guessed: [], wrong: 0 };
  },
  move(s, seat, m: { letter?: string; solve?: string }) {
    if (seat !== 1) throw invalid('Your partner is guessing this one');
    if (m?.solve !== undefined) {
      const guess = clean(m.solve, 20).toLowerCase();
      if (guess === s.word) {
        s.guessed = [...new Set([...s.guessed, ...s.word])];
        return { turn: null, winner: 1 };
      }
      s.wrong = Math.min(MAX_WRONG, s.wrong + 2);
    } else {
      const letter = clean(m?.letter, 1).toLowerCase();
      if (!/^[a-z]$/.test(letter) || s.guessed.includes(letter)) throw invalid('Pick a letter you haven’t tried');
      s.guessed.push(letter);
      if (!s.word.includes(letter)) s.wrong++;
      if ([...s.word].every((ch) => s.guessed.includes(ch))) return { turn: null, winner: 1 };
    }
    if (s.wrong >= MAX_WRONG) return { turn: null, winner: 0 };
    return { turn: 1 };
  },
  view: (s, seat, done) => ({
    hint: s.hint,
    length: s.word.length,
    pattern: [...s.word].map((ch) => (done || seat === 0 || s.guessed.includes(ch) ? ch : '')),
    guessed: s.guessed,
    wrong: s.wrong,
    maxWrong: MAX_WRONG,
    word: done || seat === 0 ? s.word : null,
  }),
};

/* ── Word chain: each word starts with the last letter of the one before ── */

interface ChainState {
  chain: { word: string; by: Seat }[];
  gaveUp: Seat | null;
}

export const wordchain: TurnGame<ChainState> = {
  name: 'Word chain',
  firstTurn: 0,
  init: () => ({ chain: [{ word: randomOf(SCRAMBLE_WORDS.filter((w) => w.length <= 6)), by: 1 }], gaveUp: null }),
  async move(s, seat, m: { word?: string; giveUp?: boolean }) {
    if (m?.giveUp) {
      s.gaveUp = seat;
      return { turn: null, winner: other(seat) };
    }
    const word = clean(m?.word, 20).toLowerCase();
    const need = s.chain[s.chain.length - 1].word.slice(-1);
    if (!word.startsWith(need)) throw invalid(`Your word has to start with “${need.toUpperCase()}”`);
    if (s.chain.some((x) => x.word === word)) throw invalid('That word’s already been used');
    if (word.length < 3 || !(await isWord(word))) throw invalid("That's not in the word list");
    s.chain.push({ word, by: seat });
    return { turn: other(seat) };
  },
  view: (s) => s,
};

/* ── 20 questions ────────────────────────────────────────────────────── */

const MAX_QUESTIONS = 20;
interface TwentyState {
  secret: string;
  category: string;
  /** Questions and guesses from the asker, answered by the one who knows the secret. */
  log: { text: string; guess: boolean; answer: 'yes' | 'no' | 'maybe' | 'right' | 'wrong' | null }[];
}

export const twentyq: TurnGame<TwentyState> = {
  name: '20 questions',
  firstTurn: 1, // seat 0 chose the secret; seat 1 asks first
  init(setup) {
    const { secret, category } = (setup ?? {}) as { secret?: string; category?: string };
    const s = clean(secret, 60);
    if (s.length < 2) throw invalid('Choose something for them to guess');
    return { secret: s, category: clean(category, 40), log: [] };
  },
  move(s, seat, m: { ask?: string; guess?: string; answer?: 'yes' | 'no' | 'maybe'; correct?: boolean }) {
    const pending = s.log[s.log.length - 1];
    if (seat === 1) {
      if (pending && pending.answer === null) throw invalid('Waiting for an answer');
      const text = clean(m?.guess ?? m?.ask, 140);
      if (!text) throw invalid('Ask a yes or no question, or make a guess');
      s.log.push({ text, guess: m?.guess !== undefined, answer: null });
      return { turn: 0 };
    }
    if (!pending || pending.answer !== null) throw invalid('Waiting for a question');
    if (pending.guess) {
      if (typeof m?.correct !== 'boolean') throw invalid('Say whether the guess is right');
      pending.answer = m.correct ? 'right' : 'wrong';
      if (m.correct) return { turn: null, winner: 1 };
    } else {
      if (!m?.answer || !['yes', 'no', 'maybe'].includes(m.answer)) throw invalid('Answer yes, no or maybe');
      pending.answer = m.answer;
    }
    if (s.log.length >= MAX_QUESTIONS) return { turn: null, winner: 0 };
    return { turn: 1 };
  },
  view: (s, seat, done) => ({ ...s, secret: done || seat === 0 ? s.secret : null, max: MAX_QUESTIONS }),
};

/* ── Story together: write a story one line each ─────────────────────── */

const STORY_STARTS = [
  'Once upon a time, two people found a mysterious map under their bed…',
  'It was the strangest date night ever, and it started with a knock at the door.',
  'On the morning they woke up with superpowers, the first thing they did was…',
  'The cat had been acting weird all week. Then it spoke.',
  'Their holiday was going perfectly, until the luggage started talking.',
  'Nobody expected the pizza delivery to change their lives.',
  'In a tiny village by the sea, a lighthouse keeper received a letter with no name.',
  'They were the last two people on Earth, and the fridge was almost empty.',
  'The time machine only had enough power for one trip.',
  'It began, like all great adventures, with a wrong turn.',
];
const MAX_LINES = 16;
interface StoryState {
  lines: { text: string; by: Seat | null }[];
}

export const story: TurnGame<StoryState> = {
  name: 'Story together',
  firstTurn: 0,
  init: () => ({ lines: [{ text: randomOf(STORY_STARTS), by: null }] }),
  move(s, seat, m: { line?: string; end?: boolean }) {
    if (m?.end) {
      if (s.lines.length < 5) throw invalid('Write a few more lines before the end');
      return { turn: null, winner: 'none' };
    }
    const line = clean(m?.line, 160);
    if (!line) throw invalid('Write the next line');
    s.lines.push({ text: line, by: seat });
    if (s.lines.length >= MAX_LINES) return { turn: null, winner: 'none' };
    return { turn: other(seat) };
  },
  view: (s) => ({ ...s, max: MAX_LINES }),
};

/* ── Draw and guess ──────────────────────────────────────────────────── */

const DRAW_WORDS = [
  'cat', 'house', 'sun', 'heart', 'pizza', 'tree', 'car', 'flower', 'fish', 'star', 'moon', 'cake', 'umbrella', 'guitar', 'bicycle',
  'rainbow', 'snowman', 'cloud', 'boat', 'apple', 'banana', 'butterfly', 'dog', 'bird', 'castle', 'rocket', 'ice cream', 'glasses',
  'crown', 'key', 'clock', 'phone', 'book', 'camera', 'balloon', 'kite', 'mountain', 'beach', 'coffee', 'sock', 'shoe', 'hat', 'ring',
  'gift', 'candle', 'spider', 'snail', 'whale', 'turtle', 'cactus', 'mushroom', 'carrot', 'egg', 'burger', 'donut', 'lamp', 'chair',
  'bed', 'door', 'ladder', 'bridge', 'train', 'plane', 'tent', 'fire', 'lightning', 'eye', 'ghost', 'robot', 'dragon', 'unicorn',
  'penguin', 'octopus', 'pineapple', 'cherry', 'lollipop', 'snake', 'frog', 'bee', 'owl', 'mermaid', 'pirate', 'volcano', 'island',
  'anchor', 'sandwich', 'toothbrush', 'hamburger', 'popcorn', 'teddy bear', 'diamond', 'kiss', 'wedding', 'love letter', 'sunflower',
];
const MAX_GUESSES = 3;
interface Stroke {
  c: string;
  w: number;
  p: number[];
}
interface DrawState {
  word: string;
  strokes: Stroke[] | null;
  guesses: string[];
  solved: boolean;
}
const sameWord = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '');
  return n(a) === n(b);
};

export const drawguess: TurnGame<DrawState> = {
  name: 'Draw and guess',
  firstTurn: 0, // seat 0 draws
  init: () => ({ word: randomOf(DRAW_WORDS), strokes: null, guesses: [], solved: false }),
  move(s, seat, m: { strokes?: Stroke[]; guess?: string }) {
    if (seat === 0) {
      if (s.strokes) throw invalid('Your drawing has been sent');
      const strokes = m?.strokes;
      const ok =
        Array.isArray(strokes) &&
        strokes.length > 0 &&
        strokes.length <= 400 &&
        strokes.every((st) => typeof st?.c === 'string' && /^#[0-9a-f]{3,8}$/i.test(st.c) && typeof st.w === 'number' && Array.isArray(st.p) && st.p.length <= 2000 && st.p.every((n) => Number.isFinite(n)));
      if (!ok || JSON.stringify(strokes).length > 120_000) throw invalid('Draw something first');
      s.strokes = strokes!.map((st) => ({ c: st.c, w: Math.max(1, Math.min(30, st.w)), p: st.p.map((n) => Math.round(n)) }));
      return { turn: 1 };
    }
    if (!s.strokes) throw invalid('Wait for the drawing');
    const guess = clean(m?.guess, 40);
    if (!guess) throw invalid('Type a guess');
    s.guesses.push(guess);
    if (sameWord(guess, s.word)) {
      s.solved = true;
      return { turn: null, winner: 'none' };
    }
    if (s.guesses.length >= MAX_GUESSES) return { turn: null, winner: 'none' };
    return { turn: 1 };
  },
  view: (s, seat, done) => ({ word: done || seat === 0 ? s.word : null, letters: s.word.length, strokes: s.strokes, guesses: s.guesses, solved: s.solved, maxGuesses: MAX_GUESSES }),
};
