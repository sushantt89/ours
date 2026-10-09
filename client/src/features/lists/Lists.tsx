import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { SharedList } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, Chip, EmojiButton, EmptyState, ErrorState, IconButton, Input, Segmented, Sheet, SkeletonList } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const KEY = ['lists'];

function ListSheet({ open, onClose, list, onCreated }: { open: boolean; onClose: () => void; list: SharedList | null; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🛒');
  const [kind, setKind] = useState<'shopping' | 'todo'>('shopping');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(list?.name ?? '');
    setEmoji(list?.emoji ?? '🛒');
    setKind(list?.kind ?? 'shopping');
  }, [open, list]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), emoji, kind };
      const res = list ? await patch<{ list: SharedList }>(`/lists/${list.id}`, body) : await post<{ list: SharedList }>('/lists', body);
      await queryClient.invalidateQueries({ queryKey: KEY });
      if (!list) onCreated(res.list.id);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!list) return;
    if (!(await confirm({ title: `Delete "${list.name}"?`, body: 'The list and everything on it will be removed for both of you.', confirmLabel: 'Delete list', danger: true }))) return;
    try {
      await del(`/lists/${list.id}`);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={list ? 'Edit list' : 'New list'}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-end gap-3">
          <EmojiButton value={emoji} onChange={setEmoji} />
          <div className="flex-1">
            <Input label="List name" placeholder="Weekend trip" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} data-autofocus />
          </div>
        </div>
        <Segmented
          label="List type"
          className="w-full"
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (!list) setEmoji(k === 'shopping' ? '🛒' : '🏠');
          }}
          options={[
            { value: 'shopping', label: '🛒 Shopping' },
            { value: 'todo', label: '✅ To-do' },
          ]}
        />
        <Button type="submit" block size="lg" loading={busy} disabled={!name.trim()}>
          {list ? 'Save' : 'Create list'}
        </Button>
        {list && (
          <Button variant="ghost" block className="text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
            Delete list
          </Button>
        )}
      </form>
    </Sheet>
  );
}

export default function Lists() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data: lists, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => get<{ lists: SharedList[] }>('/lists').then((r) => r.lists) });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<{ open: boolean; list: SharedList | null }>({ open: false, list: null });
  const input = useRef<HTMLInputElement>(null);

  const active = lists?.find((l) => l.id === activeId) ?? lists?.[0] ?? null;

  /** Applies a change on screen immediately, then confirms it with the server. */
  async function mutate(optimistic: (list: SharedList) => SharedList, request: () => Promise<{ list: SharedList }>) {
    if (!active) return;
    const previous = queryClient.getQueryData<SharedList[]>(KEY);
    queryClient.setQueryData<SharedList[]>(KEY, (old) => old?.map((l) => (l.id === active.id ? optimistic(l) : l)));
    try {
      const { list } = await request();
      queryClient.setQueryData<SharedList[]>(KEY, (old) => old?.map((l) => (l.id === list.id ? list : l)));
    } catch (err) {
      queryClient.setQueryData(KEY, previous);
      toast.error(errorMessage(err));
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !active) return;
    setText('');
    input.current?.focus();
    void mutate(
      (l) => ({ ...l, items: [...l.items, { id: `temp-${Date.now()}`, text: value, done: false, addedBy: me.id }] }),
      () => post(`/lists/${active.id}/items`, { text: value }),
    );
  }

  const toggle = (itemId: string, done: boolean) =>
    mutate(
      (l) => ({ ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, done, doneBy: done ? me.id : undefined } : i)) }),
      () => patch(`/lists/${active!.id}/items/${itemId}`, { done }),
    );

  const remove = (itemId: string) =>
    mutate(
      (l) => ({ ...l, items: l.items.filter((i) => i.id !== itemId) }),
      () => del(`/lists/${active!.id}/items/${itemId}`),
    );

  const clearDone = () =>
    mutate(
      (l) => ({ ...l, items: l.items.filter((i) => !i.done) }),
      () => post(`/lists/${active!.id}/clear-done`),
    );

  const todo = active?.items.filter((i) => !i.done) ?? [];
  const done = active?.items.filter((i) => i.done) ?? [];
  const who = (id?: string) => (id === me.id ? 'you' : id && partner ? partner.name : null);

  return (
    <Page
      title="Shared lists"
      subtitle="Changes appear for both of you instantly"
      back={<BackButton />}
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, list: null })}>
          List
        </Button>
      }
    >
      {isLoading ? (
        <SkeletonList rows={5} className="h-14" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !lists?.length || !active ? (
        <EmptyState emoji="🛒" title="No lists yet" body="Shopping, chores, packing for a trip. Make a list you can both tick off." action={<Button onClick={() => setSheet({ open: true, list: null })}>Create a list</Button>} />
      ) : (
        <>
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {lists.map((l) => {
              const left = l.items.filter((i) => !i.done).length;
              return (
                <Chip key={l.id} active={l.id === active.id} onClick={() => setActiveId(l.id)}>
                  {l.emoji} {l.name}
                  {left > 0 && <span className={cn('rounded-full px-1.5 text-xs', l.id === active.id ? 'bg-bg/20' : 'bg-surface-2')}>{left}</span>}
                </Chip>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 px-5 pb-1 pt-4">
              <span className="text-3xl" aria-hidden>
                {active.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl">{active.name}</h2>
                <p className="text-sm text-muted">{todo.length === 0 && done.length > 0 ? 'All done 🎉' : `${todo.length} to go`}</p>
              </div>
              <IconButton label="Edit list" onClick={() => setSheet({ open: true, list: active })}>
                <MoreHorizontal className="size-5" />
              </IconButton>
            </div>

            <form onSubmit={add} className="flex items-center gap-2 px-4 py-3">
              <input
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={active.kind === 'shopping' ? 'Add milk, eggs, ice cream…' : 'Add something to do…'}
                aria-label="Add an item"
                maxLength={200}
                enterKeyHint="done"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 outline-none placeholder:text-faint focus:border-accent"
              />
              <button type="submit" disabled={!text.trim()} aria-label="Add item" className="grid size-11 shrink-0 place-items-center rounded-full accent-gradient text-on-accent transition active:scale-90 disabled:opacity-40">
                <Plus className="size-5" />
              </button>
            </form>

            <ul className="px-2 pb-2">
              <AnimatePresence initial={false}>
                {[...todo, ...done].map((item) => (
                  <motion.li key={item.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="group overflow-hidden">
                    <div className="flex items-center gap-1 rounded-2xl px-2 hover:bg-surface-2">
                      <button
                        role="checkbox"
                        aria-checked={item.done}
                        aria-label={item.text}
                        onClick={() => toggle(item.id, !item.done)}
                        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                      >
                        <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2 transition', item.done ? 'border-accent bg-accent text-on-accent' : 'border-faint')}>
                          {item.done && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block break-words', item.done && 'text-muted line-through')}>{item.text}</span>
                          {item.done && who(item.doneBy) && <span className="block text-xs text-faint">Ticked off by {who(item.doneBy)}</span>}
                        </span>
                      </button>
                      <button onClick={() => remove(item.id)} aria-label={`Remove ${item.text}`} className="grid size-9 shrink-0 place-items-center rounded-full text-faint hover:text-danger sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100">
                        <X className="size-4" />
                      </button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {active.items.length === 0 && <p className="px-5 pb-6 text-center text-muted">Nothing here yet. Add the first thing above.</p>}
            {done.length > 0 && (
              <div className="border-t border-line/70 px-4 py-2 text-right">
                <Button variant="ghost" size="sm" onClick={clearDone}>
                  Clear {done.length} ticked
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
      <ListSheet open={sheet.open} list={sheet.list} onCreated={setActiveId} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Page>
  );
}
