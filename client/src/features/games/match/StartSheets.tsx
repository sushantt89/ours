import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, post } from '@/lib/api';
import type { Match } from '@/lib/types';
import { usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Chip, Input, Sheet } from '@/components/ui';
import type { MatchEntry } from './registry';

const CATEGORIES = ['Person', 'Place', 'Animal', 'Food', 'Thing', 'Film or show'];

/** Starts a match, asking first for anything secret the game needs. */
export function useStartMatch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [setupFor, setSetupFor] = useState<MatchEntry | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  async function create(entry: MatchEntry, setup?: unknown) {
    setStarting(entry.id);
    try {
      const { match } = await post<{ match: Match }>('/matches', { game: entry.id, setup });
      setSetupFor(null);
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      navigate(`/games/match/${match.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(null);
    }
  }

  const start = (entry: MatchEntry) => (entry.setup ? setSetupFor(entry) : create(entry));
  const sheet = <SetupSheet entry={setupFor} onClose={() => setSetupFor(null)} onStart={create} busy={Boolean(starting)} />;
  return { start, starting, sheet };
}

function SetupSheet({ entry, onClose, onStart, busy }: { entry: MatchEntry | null; onClose: () => void; onStart: (e: MatchEntry, setup: unknown) => void; busy: boolean }) {
  const partner = usePartner();
  const [word, setWord] = useState('');
  const [hint, setHint] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const name = partner?.name ?? 'your partner';
  const hangmanOk = /^[a-zA-Z]{3,14}$/.test(word.trim());

  return (
    <Sheet open={Boolean(entry)} onClose={onClose} title={entry ? `${entry.emoji} ${entry.name}` : ''}>
      {entry?.setup === 'hangman' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Pick a word for {name} to guess. Letters only, 3 to 14 of them. They see the hint, never the word.</p>
          <Input value={word} onChange={(e) => setWord(e.target.value.replace(/\s/g, ''))} placeholder="pineapple" aria-label="Secret word" autoCapitalize="none" autoCorrect="off" data-autofocus />
          <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Hint (optional): a fruit" aria-label="Hint" maxLength={80} />
          <Button block size="lg" disabled={!hangmanOk} loading={busy} onClick={() => onStart(entry, { word: word.trim(), hint: hint.trim() })}>
            Challenge {name}
          </Button>
        </div>
      ) : entry?.setup === 'twentyq' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Think of something. {name} asks up to 20 yes or no questions to work it out. Only you can see your answer.</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </div>
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="The Eiffel Tower" aria-label="Your secret" maxLength={60} data-autofocus />
          <Button block size="lg" disabled={word.trim().length < 2} loading={busy} onClick={() => onStart(entry, { secret: word.trim(), category })}>
            Start 20 questions
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
