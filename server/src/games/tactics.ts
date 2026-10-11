import { invalid, isInt, other, type Seat, type TurnGame } from './types';

/* ── Checkers ────────────────────────────────────────────────────────── */

interface Piece {
  s: Seat;
  k: boolean;
}
interface CheckersState {
  board: (Piece | null)[][];
  /** After a capture, the same piece must keep jumping if it can. */
  must: [number, number] | null;
  last: [number, number][] | null;
}
type Step = { from: [number, number]; to: [number, number]; capture: [number, number] | null };

function stepsFor(board: CheckersState['board'], r: number, c: number): Step[] {
  const p = board[r][c];
  if (!p) return [];
  // Seat 0 starts at the bottom and moves up; seat 1 moves down. Kings go both ways.
  const forward = p.s === 0 ? -1 : 1;
  const dirs = p.k ? [-1, 1] : [forward];
  const out: Step[] = [];
  for (const dr of dirs)
    for (const dc of [-1, 1]) {
      const r1 = r + dr;
      const c1 = c + dc;
      if (!board[r1] || c1 < 0 || c1 > 7) continue;
      const target = board[r1][c1];
      if (!target) out.push({ from: [r, c], to: [r1, c1], capture: null });
      else if (target.s !== p.s) {
        const r2 = r1 + dr;
        const c2 = c1 + dc;
        if (board[r2] && c2 >= 0 && c2 <= 7 && !board[r2][c2]) out.push({ from: [r, c], to: [r2, c2], capture: [r1, c1] });
      }
    }
  return out;
}

/** Legal moves for a seat. Captures are compulsory. */
function legal(s: CheckersState, seat: Seat): Step[] {
  if (s.must) return stepsFor(s.board, ...s.must).filter((m) => m.capture);
  const all: Step[] = [];
  s.board.forEach((row, r) => row.forEach((p, c) => p?.s === seat && all.push(...stepsFor(s.board, r, c))));
  const captures = all.filter((m) => m.capture);
  return captures.length ? captures : all;
}

export const checkers: TurnGame<CheckersState> = {
  name: 'Checkers',
  firstTurn: 0,
  init() {
    const board: CheckersState['board'] = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) continue;
        if (r < 3) board[r][c] = { s: 1, k: false };
        if (r > 4) board[r][c] = { s: 0, k: false };
      }
    return { board, must: null, last: null };
  },
  move(s, seat, m: { from: [number, number]; to: [number, number] }) {
    const ok = (p: unknown): p is [number, number] => Array.isArray(p) && isInt(p[0], 0, 7) && isInt(p[1], 0, 7);
    if (!ok(m?.from) || !ok(m?.to)) throw invalid('Pick a piece and where to move it');
    const step = legal(s, seat).find((x) => x.from[0] === m.from[0] && x.from[1] === m.from[1] && x.to[0] === m.to[0] && x.to[1] === m.to[1]);
    if (!step) throw invalid(legal(s, seat).some((x) => x.capture) ? 'You have to take a piece when you can' : "That piece can't move there");
    const piece = s.board[m.from[0]][m.from[1]]!;
    s.board[m.from[0]][m.from[1]] = null;
    s.board[m.to[0]][m.to[1]] = piece;
    if (step.capture) s.board[step.capture[0]][step.capture[1]] = null;
    s.last = [m.from, m.to];
    const crowned = !piece.k && (m.to[0] === 0 || m.to[0] === 7);
    if (crowned) piece.k = true;
    // Keep jumping with the same piece if possible (but crowning ends the turn).
    if (step.capture && !crowned && stepsFor(s.board, m.to[0], m.to[1]).some((x) => x.capture)) {
      s.must = m.to;
      return { turn: seat };
    }
    s.must = null;
    const opponent = other(seat);
    if (!legal(s, opponent).length) return { turn: null, winner: seat };
    return { turn: opponent };
  },
  view: (s, seat) => ({ ...s, moves: legal(s, seat).map((m) => ({ from: m.from, to: m.to })) }),
};

/* ── Battleship ──────────────────────────────────────────────────────── */

export const FLEET = [4, 3, 3, 2, 2];
const SEA = 8;
interface Ship {
  r: number;
  c: number;
  len: number;
  dir: 'h' | 'v';
}
interface BattleState {
  ships: [Ship[] | null, Ship[] | null];
  /** shots[seat]: where that seat has fired. */
  shots: [[number, number][], [number, number][]];
  last: [number, number] | null;
}

const cellsOf = (ship: Ship) => Array.from({ length: ship.len }, (_, i): [number, number] => (ship.dir === 'h' ? [ship.r, ship.c + i] : [ship.r + i, ship.c]));
const hitAt = (ships: Ship[], r: number, c: number) => ships.find((sh) => cellsOf(sh).some(([y, x]) => y === r && x === c)) ?? null;
const sunk = (ship: Ship, shots: [number, number][]) => cellsOf(ship).every(([y, x]) => shots.some(([a, b]) => a === y && b === x));

function validFleet(ships: unknown): ships is Ship[] {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const lens = ships.map((s) => s?.len).sort();
  if (lens.join() !== [...FLEET].sort().join()) return false;
  const used = new Set<string>();
  for (const s of ships as Ship[]) {
    if (!isInt(s.r, 0, SEA - 1) || !isInt(s.c, 0, SEA - 1) || (s.dir !== 'h' && s.dir !== 'v')) return false;
    for (const [r, c] of cellsOf(s)) {
      if (r >= SEA || c >= SEA || used.has(`${r},${c}`)) return false;
      used.add(`${r},${c}`);
    }
  }
  return true;
}

export const battleship: TurnGame<BattleState> = {
  name: 'Battleship',
  firstTurn: null, // both place their ships first
  init: () => ({ ships: [null, null], shots: [[], []], last: null }),
  move(s, seat, m: { place?: Ship[]; fire?: [number, number] }) {
    if (m?.place) {
      if (s.ships[seat]) throw invalid("You've already placed your ships");
      if (!validFleet(m.place)) throw invalid('Place all your ships inside the grid without overlapping');
      s.ships[seat] = m.place.map(({ r, c, len, dir }) => ({ r, c, len, dir }));
      return { turn: s.ships[0] && s.ships[1] ? 0 : null };
    }
    if (!s.ships[0] || !s.ships[1]) throw invalid('Waiting for both fleets to be placed');
    const f = m?.fire;
    if (!Array.isArray(f) || !isInt(f[0], 0, SEA - 1) || !isInt(f[1], 0, SEA - 1)) throw invalid('Pick a square to fire at');
    if (s.shots[seat].some(([r, c]) => r === f[0] && c === f[1])) throw invalid("You've already fired there");
    s.shots[seat].push([f[0], f[1]]);
    s.last = [f[0], f[1]];
    const enemy = s.ships[other(seat)]!;
    if (enemy.every((ship) => sunk(ship, s.shots[seat]))) return { turn: null, winner: seat };
    return { turn: other(seat) };
  },
  view(s, seat, done) {
    const enemy = s.ships[other(seat)];
    const mine = s.ships[seat];
    return {
      size: SEA,
      fleet: FLEET,
      placed: [Boolean(s.ships[0]), Boolean(s.ships[1])],
      myShips: mine,
      // Their shots at you.
      incoming: s.shots[other(seat)].map(([r, c]) => ({ r, c, hit: Boolean(mine && hitAt(mine, r, c)) })),
      // Your shots at them, plus any ships you've fully sunk.
      outgoing: s.shots[seat].map(([r, c]) => ({ r, c, hit: Boolean(enemy && hitAt(enemy, r, c)) })),
      sunk: enemy ? enemy.filter((ship) => done || sunk(ship, s.shots[seat])) : [],
      last: s.last,
    };
  },
};
