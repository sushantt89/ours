import { invalid, isInt, lineFrom, other, type Seat, type TurnGame } from './types';

type Cell = Seat | null;
const grid = (rows: number, cols: number): Cell[][] => Array.from({ length: rows }, () => Array<Cell>(cols).fill(null));
const full = (g: Cell[][]) => g.every((row) => row.every((c) => c !== null));

/* ── Tic-tac-toe ─────────────────────────────────────────────────────── */

interface GridState {
  board: Cell[][];
  last: [number, number] | null;
}

export const tictactoe: TurnGame<GridState> = {
  name: 'Tic-tac-toe',
  firstTurn: 0,
  init: () => ({ board: grid(3, 3), last: null }),
  move(s, seat, m: { r: number; c: number }) {
    if (!isInt(m?.r, 0, 2) || !isInt(m?.c, 0, 2) || s.board[m.r][m.c] !== null) throw invalid('Pick an empty square');
    s.board[m.r][m.c] = seat;
    s.last = [m.r, m.c];
    if (lineFrom(s.board, m.r, m.c, 3)) return { turn: null, winner: seat };
    if (full(s.board)) return { turn: null, winner: 'draw' };
    return { turn: other(seat) };
  },
  view: (s) => s,
};

/* ── Connect Four ────────────────────────────────────────────────────── */

export const connect4: TurnGame<GridState> = {
  name: 'Connect Four',
  firstTurn: 0,
  init: () => ({ board: grid(6, 7), last: null }),
  move(s, seat, m: { c: number }) {
    if (!isInt(m?.c, 0, 6)) throw invalid('Pick a column');
    let r = 5;
    while (r >= 0 && s.board[r][m.c] !== null) r--;
    if (r < 0) throw invalid('That column is full');
    s.board[r][m.c] = seat;
    s.last = [r, m.c];
    if (lineFrom(s.board, r, m.c, 4)) return { turn: null, winner: seat };
    if (full(s.board)) return { turn: null, winner: 'draw' };
    return { turn: other(seat) };
  },
  view: (s) => s,
};

/* ── Five in a row (gomoku) ──────────────────────────────────────────── */

const GOMOKU = 13;
export const gomoku: TurnGame<GridState> = {
  name: 'Five in a row',
  firstTurn: 0,
  init: () => ({ board: grid(GOMOKU, GOMOKU), last: null }),
  move(s, seat, m: { r: number; c: number }) {
    if (!isInt(m?.r, 0, GOMOKU - 1) || !isInt(m?.c, 0, GOMOKU - 1) || s.board[m.r][m.c] !== null) throw invalid('Pick an empty spot');
    s.board[m.r][m.c] = seat;
    s.last = [m.r, m.c];
    if (lineFrom(s.board, m.r, m.c, 5)) return { turn: null, winner: seat };
    if (full(s.board)) return { turn: null, winner: 'draw' };
    return { turn: other(seat) };
  },
  view: (s) => s,
};

/* ── Dots and boxes ──────────────────────────────────────────────────── */

const BOXES = 4; // 4×4 boxes, 5×5 dots
interface DotsState {
  /** h[r][c]: line from dot (r,c) to (r,c+1); v[r][c]: line from (r,c) to (r+1,c). Value: who drew it. */
  h: Cell[][];
  v: Cell[][];
  boxes: Cell[][];
  score: [number, number];
}

export const dots: TurnGame<DotsState> = {
  name: 'Dots and boxes',
  firstTurn: 0,
  init: () => ({ h: grid(BOXES + 1, BOXES), v: grid(BOXES, BOXES + 1), boxes: grid(BOXES, BOXES), score: [0, 0] }),
  move(s, seat, m: { dir: 'h' | 'v'; r: number; c: number }) {
    const lines = m?.dir === 'h' ? s.h : m?.dir === 'v' ? s.v : null;
    if (!lines || !isInt(m.r, 0, lines.length - 1) || !isInt(m.c, 0, lines[0].length - 1) || lines[m.r][m.c] !== null) throw invalid('Pick an empty line');
    lines[m.r][m.c] = seat;
    // Did this line close one or two boxes?
    let closed = 0;
    for (let r = 0; r < BOXES; r++)
      for (let c = 0; c < BOXES; c++) {
        if (s.boxes[r][c] !== null) continue;
        if (s.h[r][c] !== null && s.h[r + 1][c] !== null && s.v[r][c] !== null && s.v[r][c + 1] !== null) {
          s.boxes[r][c] = seat;
          s.score[seat]++;
          closed++;
        }
      }
    if (s.score[0] + s.score[1] === BOXES * BOXES) {
      return { turn: null, winner: s.score[0] === s.score[1] ? 'draw' : s.score[0] > s.score[1] ? 0 : 1 };
    }
    // Closing a box earns another go.
    return { turn: closed ? seat : other(seat) };
  },
  view: (s) => s,
};

/* ── Reversi ─────────────────────────────────────────────────────────── */

interface ReversiState {
  board: Cell[][];
  last: [number, number] | null;
  passed: boolean;
}
const DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function flips(board: Cell[][], r: number, c: number, seat: Seat) {
  if (board[r][c] !== null) return [];
  const out: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const run: [number, number][] = [];
    let rr = r + dr;
    let cc = c + dc;
    while (board[rr]?.[cc] === other(seat)) {
      run.push([rr, cc]);
      rr += dr;
      cc += dc;
    }
    if (run.length && board[rr]?.[cc] === seat) out.push(...run);
  }
  return out;
}
const hasMove = (board: Cell[][], seat: Seat) => board.some((row, r) => row.some((_, c) => flips(board, r, c, seat).length > 0));
const count = (board: Cell[][], seat: Seat) => board.flat().filter((x) => x === seat).length;

export const reversi: TurnGame<ReversiState> = {
  name: 'Reversi',
  firstTurn: 0,
  init() {
    const board = grid(8, 8);
    board[3][3] = 1;
    board[4][4] = 1;
    board[3][4] = 0;
    board[4][3] = 0;
    return { board, last: null, passed: false };
  },
  move(s, seat, m: { r: number; c: number }) {
    if (!isInt(m?.r, 0, 7) || !isInt(m?.c, 0, 7)) throw invalid('Pick a square');
    const turned = flips(s.board, m.r, m.c, seat);
    if (!turned.length) throw invalid('That move has to flip at least one piece');
    s.board[m.r][m.c] = seat;
    for (const [r, c] of turned) s.board[r][c] = seat;
    s.last = [m.r, m.c];
    s.passed = false;
    if (hasMove(s.board, other(seat))) return { turn: other(seat) };
    if (hasMove(s.board, seat)) {
      s.passed = true; // the other player has no move and must pass
      return { turn: seat };
    }
    const a = count(s.board, 0);
    const b = count(s.board, 1);
    return { turn: null, winner: a === b ? 'draw' : a > b ? 0 : 1 };
  },
  view: (s, seat) => ({ ...s, score: [count(s.board, 0), count(s.board, 1)], hints: s.board.map((row, r) => row.map((_, c) => flips(s.board, r, c, seat).length > 0)) }),
};

/* ── Mancala (Kalah) ─────────────────────────────────────────────────── */

interface MancalaState {
  /** pits[0..5] seat 0, [6] seat 0's store, [7..12] seat 1, [13] seat 1's store */
  pits: number[];
  last: number | null;
}

export const mancala: TurnGame<MancalaState> = {
  name: 'Mancala',
  firstTurn: 0,
  init: () => ({ pits: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], last: null }),
  move(s, seat, m: { pit: number }) {
    const base = seat === 0 ? 0 : 7;
    if (!isInt(m?.pit, 0, 5) || s.pits[base + m.pit] === 0) throw invalid('Pick one of your pits with seeds in it');
    const myStore = seat === 0 ? 6 : 13;
    const theirStore = seat === 0 ? 13 : 6;
    let i = base + m.pit;
    let seeds = s.pits[i];
    s.pits[i] = 0;
    while (seeds > 0) {
      i = (i + 1) % 14;
      if (i === theirStore) continue;
      s.pits[i]++;
      seeds--;
    }
    s.last = i;
    // Last seed in an empty pit on your side captures the opposite pit.
    const mine = seat === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12;
    if (mine && s.pits[i] === 1 && s.pits[12 - i] > 0) {
      s.pits[myStore] += s.pits[12 - i] + 1;
      s.pits[i] = 0;
      s.pits[12 - i] = 0;
    }
    const sideEmpty = (from: number) => s.pits.slice(from, from + 6).every((n) => n === 0);
    if (sideEmpty(0) || sideEmpty(7)) {
      for (let k = 0; k < 6; k++) {
        s.pits[6] += s.pits[k];
        s.pits[13] += s.pits[k + 7];
        s.pits[k] = 0;
        s.pits[k + 7] = 0;
      }
      return { turn: null, winner: s.pits[6] === s.pits[13] ? 'draw' : s.pits[6] > s.pits[13] ? 0 : 1 };
    }
    // Ending in your own store earns another go.
    return { turn: i === myStore ? seat : other(seat) };
  },
  view: (s) => s,
};
