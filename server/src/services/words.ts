import crypto from 'node:crypto';

let dictionary: Set<string> | null = null;

/** True for English words of 3–8 letters (the word games' dictionary). Loaded on first use. */
export async function isWord(word: string) {
  if (!dictionary) {
    const { DICTIONARY_WORDS } = await import('../data/dictionary');
    dictionary = new Set(DICTIONARY_WORDS.split(' '));
  }
  return dictionary.has(word.toLowerCase());
}

/** A stable pseudo-random pick, so both partners get the same item for the same key. */
export function pick<T>(items: readonly T[], key: string): T {
  const n = crypto.createHash('sha256').update(key).digest().readUInt32BE(0);
  return items[n % items.length];
}

/** Wordle-style marks for a guess: 2 = right place, 1 = in the word elsewhere, 0 = not in the word. */
export function markGuess(guess: string, answer: string): number[] {
  const marks = Array(guess.length).fill(0);
  const left: Record<string, number> = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 2;
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 2) continue;
    if (left[guess[i]]) {
      marks[i] = 1;
      left[guess[i]]--;
    }
  }
  return marks;
}
