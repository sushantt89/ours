import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Match } from '@/lib/types';

/** `onError` replaces the usual error toast, for boards that show mistakes inline. */
export interface SendOptions {
  onError?: (message: string) => void;
}

export interface BoardProps<V = any> {
  match: Match<V>;
  /** Sends a move. Resolves to true when the server accepts it (errors are shown for you). */
  send: (move: unknown, opts?: SendOptions) => Promise<boolean>;
  busy: boolean;
  partnerName: string;
}

export interface MatchEntry {
  id: string;
  name: string;
  emoji: string;
  hint: string;
  /** Games where the person starting it chooses something secret first. */
  setup?: 'hangman' | 'twentyq';
  board: LazyExoticComponent<ComponentType<BoardProps>>;
}

/** Ids match the server's TURN_GAMES. */
export const MATCH_GAMES: MatchEntry[] = [
  { id: 'trivia', name: 'Trivia duel', emoji: '🧠', hint: 'Same 10 questions, live', board: lazy(() => import('./boards/Trivia')) },
  { id: 'wordrace', name: 'Word race', emoji: '🏁', hint: 'Same letters, 2 minutes', board: lazy(() => import('./boards/WordRace')) },
  { id: 'tictactoe', name: 'Tic-tac-toe', emoji: '⭕', hint: 'Three in a row', board: lazy(() => import('./boards/Grids').then((m) => ({ default: m.TicTacToe }))) },
  { id: 'connect4', name: 'Connect Four', emoji: '🔴', hint: 'Drop discs, line up four', board: lazy(() => import('./boards/Grids').then((m) => ({ default: m.ConnectFour }))) },
  { id: 'battleship', name: 'Battleship', emoji: '🚢', hint: 'Hide your fleet, sink theirs', board: lazy(() => import('./boards/Battleship')) },
  { id: 'dots', name: 'Dots and boxes', emoji: '🔲', hint: 'Close boxes to claim them', board: lazy(() => import('./boards/Dots')) },
  { id: 'checkers', name: 'Checkers', emoji: '🏁', hint: 'Jump and crown', board: lazy(() => import('./boards/Checkers')) },
  { id: 'reversi', name: 'Reversi', emoji: '⚫', hint: 'Flip their pieces', board: lazy(() => import('./boards/Reversi')) },
  { id: 'gomoku', name: 'Five in a row', emoji: '✖️', hint: 'Get five in a line first', board: lazy(() => import('./boards/Grids').then((m) => ({ default: m.Gomoku }))) },
  { id: 'mancala', name: 'Mancala', emoji: '🥜', hint: 'Sow seeds, fill your store', board: lazy(() => import('./boards/Mancala')) },
  { id: 'rps', name: 'Rock paper scissors', emoji: '✂️', hint: 'First to three, picked in secret', board: lazy(() => import('./boards/Rps')) },
  { id: 'hangman', name: 'Hangman', emoji: '🪢', hint: 'Pick a word, they guess it', setup: 'hangman', board: lazy(() => import('./boards/Hangman')) },
  { id: 'wordchain', name: 'Word chain', emoji: '🔗', hint: 'Each word starts with the last letter', board: lazy(() => import('./boards/WordChain')) },
  { id: 'twentyq', name: '20 questions', emoji: '❓', hint: 'Think of something, they ask', setup: 'twentyq', board: lazy(() => import('./boards/TwentyQ')) },
  { id: 'drawguess', name: 'Draw and guess', emoji: '🎨', hint: 'Draw the word, they guess', board: lazy(() => import('./boards/DrawGuess')) },
  { id: 'story', name: 'Story together', emoji: '📖', hint: 'Write a story, a line each', board: lazy(() => import('./boards/Story')) },
];

/** Colours for your pieces and your partner's, by seat. */
export const MINE = 'bg-accent';
export const THEIRS = 'bg-indigo-500';
export const pieceClass = (pieceSeat: number, mySeat: number) => (pieceSeat === mySeat ? MINE : THEIRS);
