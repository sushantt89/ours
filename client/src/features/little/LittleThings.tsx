import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { LITTLE_THING_CATEGORIES, LOVE_LANGUAGES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import type { LittleThing, LoveLanguage, User } from '@/lib/types';
import { useAuth, useMe, usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Card, Chip, EmptyState, IconButton, SectionTitle, Sheet, SkeletonList } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const languageOf = (id: string) => LOVE_LANGUAGES.find((l) => l.id === id);
const categoryOf = (id: string) => LITTLE_THING_CATEGORIES.find((c) => c.id === id) ?? LITTLE_THING_CATEGORIES[LITTLE_THING_CATEGORIES.length - 1];

function LanguagePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const [order, setOrder] = useState<LoveLanguage[]>(me.loveLanguages);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setOrder(me.loveLanguages);
  }, [open, me.loveLanguages]);

  const toggle = (id: LoveLanguage) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  async function save() {
    setBusy(true);
    try {
      const { user } = await patch<{ user: User }>('/me', { loveLanguages: order });
      useAuth.setState({ user });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="My love languages" footer={<Button block size="lg" loading={busy} onClick={save}>Save</Button>}>
      <p className="mb-4 text-sm text-muted">Tap them in order of what matters most to you. Your partner sees this.</p>
      <div className="space-y-2">
        {LOVE_LANGUAGES.map((l) => {
          const rank = order.indexOf(l.id);
          return (
            <button
              key={l.id}
              onClick={() => toggle(l.id)}
              aria-pressed={rank >= 0}
              className={cn('flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition', rank >= 0 ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
            >
              <span className="text-2xl">{l.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{l.label}</span>
                <span className="block text-sm text-muted">{l.hint}</span>
              </span>
              {rank >= 0 && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">{rank + 1}</span>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export default function LittleThings() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [newCategory, setNewCategory] = useState('food');
  const [picking, setPicking] = useState(false);
  const partnerName = partner?.name ?? 'your partner';

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
  const { data, isLoading } = useQuery({
    queryKey: ['little-things', query, category],
    queryFn: () => get<{ items: LittleThing[] }>(`/little-things?${params}`).then((r) => r.items),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['little-things'] });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await post('/little-things', { text: text.trim(), category: newCategory });
      setText('');
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const run = (fn: () => Promise<unknown>) => fn().then(refresh).catch((err) => toast.error(errorMessage(err)));

  return (
    <Page title="Little things" subtitle={`What makes ${partnerName} feel loved`} back={<BackButton />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{partner ? `${partner.name}'s love languages` : 'Their love languages'}</p>
          {partner?.loveLanguages.length ? (
            <ol className="mt-3 space-y-2">
              {partner.loveLanguages.map((id, i) => (
                <li key={id} className="flex items-center gap-2.5">
                  <span className="text-xl">{languageOf(id)?.emoji}</span>
                  <span className={cn('font-medium', i === 0 && 'font-display text-lg')}>{languageOf(id)?.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">{partner ? `${partner.name} hasn't chosen theirs yet.` : 'Once your partner joins, theirs appear here.'}</p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Yours</p>
          {me.loveLanguages.length ? (
            <p className="mt-3 font-medium">{me.loveLanguages.map((id) => `${languageOf(id)?.emoji} ${languageOf(id)?.label}`).join(' · ')}</p>
          ) : (
            <p className="mt-3 text-sm text-muted">Let {partnerName} know how you like to be loved.</p>
          )}
          <Button variant="soft" size="sm" className="mt-4" onClick={() => setPicking(true)}>
            {me.loveLanguages.length ? 'Change' : 'Choose mine'}
          </Button>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> My notebook about {partnerName}
          </span>
        </SectionTitle>
        <p className="mb-3 px-1 text-sm text-muted">Only you can see this. Jot down the small things, then search it when you need a gift idea or a way to make their day.</p>

        <Card className="p-4">
          <form onSubmit={add} className="space-y-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Oat latte, no sugar"
              aria-label="Something they love"
              maxLength={500}
              className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 outline-none placeholder:text-faint focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                {LITTLE_THING_CATEGORIES.map((c) => (
                  <Chip key={c.id} active={newCategory === c.id} onClick={() => setNewCategory(c.id)} className="h-8 px-3 text-[13px]">
                    {c.emoji} {c.label}
                  </Chip>
                ))}
              </div>
              <Button type="submit" size="sm" disabled={!text.trim()}>
                Save
              </Button>
            </div>
          </form>
        </Card>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your notes"
              aria-label="Search your notes"
              className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 outline-none focus:border-accent"
            />
          </div>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <Chip active={!category} onClick={() => setCategory(null)}>
            All
          </Chip>
          {LITTLE_THING_CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>

        <div className="mt-4">
          {isLoading ? (
            <SkeletonList rows={3} className="h-14" />
          ) : !data?.length ? (
            <EmptyState emoji="🫶" title={query || category ? 'Nothing matches' : 'Start noticing'} body={query || category ? 'Try another word or category.' : 'Their coffee order, the flowers they like, the band they keep humming.'} />
          ) : (
            <Card className="divide-y divide-line/70 overflow-hidden">
              {data.map((item) => (
                <div key={item.id} className="group flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 text-xl" aria-hidden>
                    {categoryOf(item.category).emoji}
                  </span>
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.text}</p>
                  <IconButton size="sm" label={item.pinned ? 'Unpin' : 'Pin'} active={item.pinned} onClick={() => run(() => patch(`/little-things/${item.id}`, { pinned: !item.pinned }))}>
                    {item.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                  </IconButton>
                  <IconButton size="sm" label="Delete" onClick={() => run(() => del(`/little-things/${item.id}`))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
      <LanguagePicker open={picking} onClose={() => setPicking(false)} />
    </Page>
  );
}
