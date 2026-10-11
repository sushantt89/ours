import { connect4, dots, gomoku, mancala, reversi, tictactoe } from './boards';
import { battleship, checkers } from './tactics';
import { drawguess, hangman, rps, story, twentyq, wordchain } from './words';
import type { TurnGame } from './types';

/** Turn-based games played on both phones. */
export const TURN_GAMES: Record<string, TurnGame> = {
  tictactoe,
  connect4,
  dots,
  battleship,
  reversi,
  gomoku,
  checkers,
  mancala,
  rps,
  hangman,
  wordchain,
  twentyq,
  story,
  drawguess,
};
export type { Seat, TurnGame } from './types';
