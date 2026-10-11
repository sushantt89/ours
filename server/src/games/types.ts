import { badRequest } from '../utils/http';

/** Player 0 started the match, player 1 is their partner. */
export type Seat = 0 | 1;

export interface Outcome {
  /** Whose move it is now. `null` while both can act (e.g. both placing ships) or when the game is over. */
  turn: Seat | null;
  /** Set when the game ends: the winning seat, 'draw', or 'none' for games without a winner (stories). */
  winner?: Seat | 'draw' | 'none';
}

/**
 * A turn-based game. The server keeps the full state, checks every move, and only shows
 * each player what they're allowed to see.
 */
export interface TurnGame<S = any> {
  name: string;
  /** Creates a new match. `setup` comes from the person starting it (e.g. a hangman word). */
  init(setup: unknown): Promise<S> | S;
  /** Whose turn it is at the start. */
  firstTurn: Seat | null;
  /** Applies a move by `seat`, or throws a friendly error. */
  move(state: S, seat: Seat, move: any): Promise<Outcome> | Outcome;
  /** What `seat` may see. Hidden things (ships, secret words) are removed here. */
  view(state: S, seat: Seat, done: boolean): unknown;
}

export const invalid = (message: string) => badRequest(message, 'invalid_move');
export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
export const isInt = (n: unknown, lo: number, hi: number): n is number => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;

/** Checks for `need` in a row through (r, c) on a grid of seats. */
export function lineFrom(grid: (Seat | null)[][], r: number, c: number, need: number) {
  const who = grid[r][c];
  if (who === null) return false;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    let count = 1;
    for (const dir of [1, -1]) {
      let rr = r + dr * dir;
      let cc = c + dc * dir;
      while (grid[rr]?.[cc] === who) {
        count++;
        rr += dr * dir;
        cc += dc * dir;
      }
    }
    if (count >= need) return true;
  }
  return false;
}
