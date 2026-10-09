import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { BookmarkPlus, Check, Dices, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { del, errorMessage, get, patch, post, upload } from '@/lib/api';
import { DATE_CATEGORIES } from '@/lib/constants';
import { formatDate, todayIn } from '@/lib/dates';
import type { DateIdea } from '@/lib/types';
import { useCouple } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, Chip, EmojiButton, EmptyState, ErrorState, Input, Segmented, Sheet, SkeletonList, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const KEY = ['dates'];
interface Suggestion {
  id: string | null;
  emoji: string;
  title: string;
  category: string;
  saved: boolean;
}

const categoryOf = (id: string) => DATE_CATEGORIES.find((c) => c.id === id);

function IdeaSheet({ open, onClose, idea }: { open: boolean; onClose: () => void; idea: DateIdea | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', emoji: '🍽️', category: 'home', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ title: idea?.title ?? '', emoji: idea?.emoji ?? '🍽️', category: idea?.category ?? 'home', notes: idea?.notes ?? '' });
  }, [open, idea]);

  async function save() {
    if (!form.title.trim()) return setError('Describe the date');
    setBusy(true);
    try {
      const body = { ...form, title: form.title.trim() };
      if (idea) await patch(`/dates/${idea.id}`, body);
      else await post('/dates', body);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!idea) return;
    if (!(await confirm({ title: 'Remove this date idea?', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await del(`/dates/${idea.id}`);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={idea ? 'Edit date idea' : 'New date idea'}
      footer={
        <div className="flex gap-2">
          {idea && (
            <Button variant="outline" className="text-danger" aria-label="Remove idea" onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button block size="lg" loading={busy} onClick={save}>
            {idea ? 'Save' : 'Add to our list'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <EmojiButton value={form.emoji} onChange={(emoji) => setForm({ ...form, emoji })} />
          <div className="flex-1">
            <Input label="The idea" placeholder="Sunset picnic at the beach" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} error={error} data-autofocus />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_CATEGORIES.map((c) => (
            <Chip key={c.id} active={form.category === c.id} onClick={() => setForm({ ...form, category: c.id })}>
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>
        <Textarea label="Notes" rows={3} placeholder="Where, when, what to bring…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
      </div>
    </Sheet>
  );
}

/** Marks a date as done and optionally saves photos from it straight into Memories. */
function CompleteSheet({ idea, onClose }: { idea: DateIdea | null; onClose: () => void }) {
  const couple = useCouple();
  const queryClient = useQueryClient();
  const today = todayIn(couple.timezone);
  const input = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (idea) {
      setDate(today);
      setNotes(idea.notes);
      setFiles([]);
    }
  }, [idea, today]);

  async function save() {
    if (!idea) return;
    setBusy(true);
    try {
      await patch(`/dates/${idea.id}`, { status: 'done', completedAt: date, notes });
      if (files.length) {
        const form = new FormData();
        files.forEach((f) => form.append('files', f));
        form.append('event', idea.title.slice(0, 80));
        form.append('date', date);
        form.append('caption', notes.slice(0, 1000));
        await upload('/memories', form);
        void queryClient.invalidateQueries({ queryKey: ['memories'] });
      }
      await queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(files.length ? 'Date night saved, with memories' : 'Date night saved', '🥂');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(idea)} onClose={onClose} title="How was it?" footer={<Button block size="lg" loading={busy} onClick={save}>Mark as done</Button>}>
      {idea && (
        <div className="space-y-4">
          <p className="font-display text-xl leading-snug">
            {idea.emoji} {idea.title}
          </p>
          <Input label="When did you go?" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <Textarea label="A few words to remember it by" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          <div>
            <p className="mb-1.5 px-1 text-sm font-medium">Add photos to your memories</p>
            <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => setFiles((old) => [...old, ...Array.from(e.target.files ?? [])].slice(0, 12))} />
            <div className="flex flex-wrap items-center gap-2">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-sm">
                  <span className="max-w-32 truncate">{f.name}</span>
                  <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((old) => old.filter((_, j) => j !== i))} className="grid size-5 place-items-center rounded-full hover:bg-line">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Button variant="outline" size="sm" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
                Choose photos
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function DateNight() {
  const queryClient = useQueryClient();
  const { data: ideas, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => get<{ ideas: DateIdea[] }>('/dates').then((r) => r.ideas) });
  const [category, setCategory] = useState<string>('any');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [rolling, setRolling] = useState(false);
  const [tab, setTab] = useState<'idea' | 'done'>('idea');
  const [sheet, setSheet] = useState<{ open: boolean; idea: DateIdea | null }>({ open: false, idea: null });
  const [completing, setCompleting] = useState<DateIdea | null>(null);

  async function roll() {
    setRolling(true);
    navigator.vibrate?.(20);
    try {
      const params = new URLSearchParams();
      if (category !== 'any') params.set('category', category);
      if (suggestion) params.set('exclude', suggestion.title);
      const [{ idea }] = await Promise.all([get<{ idea: Suggestion }>(`/dates/random?${params}`), new Promise((r) => setTimeout(r, 550))]);
      setSuggestion(idea);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRolling(false);
    }
  }

  async function saveSuggestion(andComplete = false) {
    if (!suggestion) return;
    try {
      let idea = ideas?.find((i) => i.id === suggestion.id);
      if (!idea) {
        idea = (await post<{ idea: DateIdea }>('/dates', { title: suggestion.title, emoji: suggestion.emoji, category: suggestion.category })).idea;
        await queryClient.invalidateQueries({ queryKey: KEY });
      }
      setSuggestion({ ...suggestion, id: idea.id, saved: true });
      if (andComplete) setCompleting(idea);
      else toast.success('Saved to your date list', '🔖');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const list = (ideas ?? []).filter((i) => i.status === tab);
  const doneCount = ideas?.filter((i) => i.status === 'done').length ?? 0;

  return (
    <Page
      title="Date night"
      subtitle={doneCount ? `${doneCount} date ${doneCount === 1 ? 'night' : 'nights'} and counting` : "Can't decide? Let the dice choose."}
      back={<BackButton />}
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, idea: null })}>
          Idea
        </Button>
      }
    >
      <Card className="relative overflow-hidden p-5 text-center">
        <div className="absolute inset-x-0 top-0 h-28 opacity-[0.14] accent-gradient [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative">
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            <Chip active={category === 'any'} onClick={() => setCategory('any')}>
              🎲 Anything
            </Chip>
            {DATE_CATEGORIES.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.emoji} {c.label}
              </Chip>
            ))}
          </div>

          <div className="grid min-h-44 place-items-center py-6" aria-live="polite">
            <AnimatePresence mode="wait">
              {rolling ? (
                <motion.div key="rolling" animate={{ rotate: [0, 180, 360], scale: [1, 1.2, 1] }} transition={{ duration: 0.55, repeat: Infinity }} className="text-accent">
                  <Dices className="size-14" />
                </motion.div>
              ) : suggestion ? (
                <motion.div key={suggestion.title} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', damping: 18 }}>
                  <p className="text-6xl" aria-hidden>
                    {suggestion.emoji}
                  </p>
                  <p className="mt-3 font-display text-2xl leading-snug">"{suggestion.title}"</p>
                  <p className="mt-1.5 text-sm text-muted">
                    {categoryOf(suggestion.category)?.label}
                    {suggestion.saved && ' · from your list'}
                  </p>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <p className="text-6xl" aria-hidden>
                    🎲
                  </p>
                  <p className="mt-3 text-muted">Roll for a date from your own ideas and ours.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" icon={<Dices className="size-5" />} onClick={roll} disabled={rolling}>
              {suggestion ? 'Roll again' : 'Random date'}
            </Button>
            {suggestion && !rolling && (
              <>
                {!suggestion.saved && (
                  <Button size="lg" variant="outline" icon={<BookmarkPlus className="size-5" />} onClick={() => saveSuggestion()}>
                    Save
                  </Button>
                )}
                <Button size="lg" variant="soft" icon={<Check className="size-5" />} onClick={() => saveSuggestion(true)}>
                  We did this
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-3 mt-7 flex items-center justify-between">
        <h2 className="text-xl">❤️ Date bucket list</h2>
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'idea', label: 'To do' },
            { value: 'done', label: `Done${doneCount ? ` · ${doneCount}` : ''}` },
          ]}
        />
      </div>

      {isLoading ? (
        <SkeletonList rows={3} className="h-16" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          emoji={tab === 'idea' ? '🍽️' : '🥂'}
          title={tab === 'idea' ? 'No saved ideas yet' : 'No date nights logged yet'}
          body={tab === 'idea' ? 'Save ideas from the dice, or add ones you dream up yourselves.' : 'When you finish a date, mark it done and add a photo or two.'}
        />
      ) : (
        <ul className="space-y-2.5">
          {list.map((idea) => (
            <li key={idea.id}>
              <Card className="flex items-center gap-3 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl" aria-hidden>
                  {idea.emoji}
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ open: true, idea })}>
                  <p className="font-semibold leading-snug">{idea.title}</p>
                  <p className="text-sm text-muted">
                    {categoryOf(idea.category)?.label}
                    {idea.status === 'done' && idea.completedAt && ` · ${formatDate(idea.completedAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  </p>
                </button>
                {idea.status === 'idea' ? (
                  <Button size="sm" variant="soft" onClick={() => setCompleting(idea)}>
                    Done
                  </Button>
                ) : (
                  <Check className="size-5 shrink-0 text-success" aria-label="Completed" />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <IdeaSheet open={sheet.open} idea={sheet.idea} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
      <CompleteSheet idea={completing} onClose={() => setCompleting(null)} />
    </Page>
  );
}
