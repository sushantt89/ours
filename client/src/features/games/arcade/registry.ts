import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ArcadeProps } from './shared';

export interface ArcadeEntry {
  id: string;
  name: string;
  emoji: string;
  hint: string;
  /** Lower scores win (times, moves, milliseconds). */
  lowWins?: boolean;
  unit?: string;
  component: LazyExoticComponent<ComponentType<ArcadeProps>>;
}

/** Arcade games: play on your own, beat your partner's best. Ids match the server's ARCADE list. */
export const ARCADE: ArcadeEntry[] = [
  { id: 'snake', name: 'Snake', emoji: '🐍', hint: 'Eat hearts, grow longer', component: lazy(() => import('./Snake')) },
  { id: '2048', name: '2048', emoji: '🔢', hint: 'Slide and merge numbers', component: lazy(() => import('./Game2048')) },
  { id: 'flappy', name: 'Flappy heart', emoji: '💖', hint: 'Tap to fly through gaps', component: lazy(() => import('./Flappy')) },
  { id: 'hearts', name: 'Tap the hearts', emoji: '💛', hint: '30-second tapping frenzy', component: lazy(() => import('./TapHearts')) },
  { id: 'blocks', name: 'Block puzzle', emoji: '🧱', hint: 'Clear rows of falling blocks', component: lazy(() => import('./Blocks')) },
  { id: 'minesweeper', name: 'Minesweeper', emoji: '💣', hint: 'Clear the board, fastest wins', lowWins: true, unit: 's', component: lazy(() => import('./Minesweeper')) },
  { id: 'memory', name: 'Memory match', emoji: '🃏', hint: 'Find the pairs, fewest moves', lowWins: true, unit: ' moves', component: lazy(() => import('./Memory')) },
  { id: 'scramble', name: 'Word scramble', emoji: '🔤', hint: 'Unscramble words in 60s', component: lazy(() => import('./Scramble')) },
  { id: 'simon', name: 'Simon says', emoji: '🎵', hint: 'Repeat the growing pattern', component: lazy(() => import('./Simon')) },
  { id: 'reaction', name: 'Reaction time', emoji: '⚡', hint: 'Tap the moment it turns green', lowWins: true, unit: ' ms', component: lazy(() => import('./Reaction')) },
  { id: 'math', name: 'Math sprint', emoji: '➗', hint: 'Quick sums in 60s', component: lazy(() => import('./MathSprint')) },
];

export const formatScore = (entry: Pick<ArcadeEntry, 'unit'>, score: number) => `${score.toLocaleString()}${entry.unit ?? ''}`;
