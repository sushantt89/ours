import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Clock, Lock, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { ACCENTS, OPEN_WHEN } from '@/lib/constants';
import { formatDateTime, isoToLocalInput, localInputToISO, timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Accent, Media, Note } from '@/lib/types';
import { usePartner } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Chip, EmojiButton, EmptyState, ErrorState, IconButton, Input, Lightbox, PhotoPicker, Sheet, SkeletonList, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

const HUES: Record<Accent, string> = { rose: '#e0527a', peach: '#e8774c', plum: '#9a5fd0', sage: '#559a76', ocean: '#3a8cc6', gold: '#c4902e' };
const paper = (color: Accent) => ({
  background: `color-mix(in oklab, ${HUES[color] ?? HUES.rose} 14%, var(--surface))`,
  borderColor: `color-mix(in oklab, ${HUES[color] ?? HUES.rose} 26%, var(--surface))`,
});

type Tab = 'inbox' | 'sent' | 'shared' | 'private' | 'archived';
type Kind = 'note' | 'open_when' | 'surprise' | 'daily' | 'shared' | 'private';

const KINDS: { id: Kind; emoji: string; label: string; hint: string }[] = [
  { id: 'note', emoji: '💌', label: 'Love note', hint: 'Send now or schedule it' },
  { id: 'open_when', emoji: '✉️', label: 'Open when…', hint: 'A sealed letter for a certain moment' },
  { id: 'surprise', emoji: '🎁', label: 'Surprise', hint: 'Stays locked until a date you choose' },
  { id: 'daily', emoji: '☀️', label: "Today's message", hint: 'A line for their home screen today' },
  { id: 'shared', emoji: '📝', label: 'Shared note', hint: 'You can both read and edit' },
  { id: 'private', emoji: '🔒', label: 'Private note', hint: 'Only you can see it' },
];

const useNotes = () => useQuery({ queryKey: ['notes'], queryFn: () => get<{ notes: Note[] }>('/notes').then((r) => r.notes) });

function NoteCard({ note, onOpen, partnerName }: { note: Note; onOpen: () => void; partnerName: string }) {
  const unread = note.audience === 'partner' && !note.mine && !note.readAt;
  const scheduled = note.mine && note.audience === 'partner' && !note.delivered;
  const hidden = note.locked || note.sealed;
  return (
    <button onClick={onOpen} style={paper(note.color)} className="relative block w-full break-inside-avoid rounded-[24px] border p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-float active:scale-[0.99]">
      <div className="flex items-start gap-2">
        <span className="text-2xl" aria-hidden>
          {note.locked ? '🎁' : note.sealed ? '✉️' : note.emoji}
        </span>
        <div className="min-w-0 flex-1">
          {(note.title || hidden) && (
            <p className="font-display text-lg leading-snug">{note.locked && !note.title ? 'A surprise is waiting' : note.title || 'A sealed letter'}</p>
          )}
          {!hidden && note.body && <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/85">{note.body}</p>}
          {note.locked && note.unlockAt && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Lock className="size-3.5" /> Unlocks {formatDateTime(note.unlockAt)}
            </p>
          )}
          {note.sealed && <p className="mt-1 text-sm text-muted">Tap when the moment is right.</p>}
        </div>
        {note.pinned && <Pin className="size-4 shrink-0 text-muted" aria-label="Pinned" />}
      </div>
      {!hidden && note.media.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-hidden rounded-2xl">
          {note.media.slice(0, 3).map((m) => (
            <img key={m.id} src={m.thumbUrl ?? m.url} alt="" loading="lazy" className="h-24 min-w-0 flex-1 object-cover" />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        {unread && <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-on-accent">New</span>}
        {scheduled && note.deliverAt && (
          <span className="flex items-center gap-1 font-medium">
            <Clock className="size-3.5" /> Sends {formatDateTime(note.deliverAt)}
          </span>
        )}
        {note.mine && note.audience === 'partner' && note.delivered && <span>{note.readAt ? `Read ${timeAgo(note.readAt)}` : 'Delivered'}</span>}
        <span className="ml-auto">
          {note.audience === 'partner' && !note.mine ? `From ${partnerName} · ` : ''}
          {timeAgo(note.createdAt)}
        </span>
      </div>
    </button>
  );
}

function Editor({ open, onClose, editing, initialKind }: { open: boolean; onClose: () => void; editing: Note | null; initialKind: Kind }) {
  const partner = usePartner();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [emoji, setEmoji] = useState('💌');
  const [color, setColor] = useState<Accent>('rose');
  const [media, setMedia] = useState<Media[]>([]);
  const [deliverAt, setDeliverAt] = useState('');
  const [unlockAt, setUnlockAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editing) {
      setKind(editing.audience === 'partner' ? editing.kind : editing.audience);
      setTitle(editing.title);
      setBody(editing.body);
      setEmoji(editing.emoji);
      setColor(editing.color);
      setMedia(editing.media);
      setDeliverAt(isoToLocalInput(editing.deliverAt));
      setUnlockAt(isoToLocalInput(editing.unlockAt));
    } else {
      setKind(initialKind);
      setTitle('');
      setBody('');
      setEmoji(initialKind === 'daily' ? '☀️' : '💌');
      setColor('rose');
      setMedia([]);
      setDeliverAt('');
      setUnlockAt('');
    }
  }, [open, editing, initialKind]);

  const forPartner = !['shared', 'private'].includes(kind);
  const needsPartner = forPartner && !partner;

  async function save() {
    if (!body.trim() && !title.trim() && !media.length) return setError('Write something first');
    if (kind === 'open_when' && !title.trim()) return setError('Give the letter an "open when…" label');
    if (kind === 'surprise' && !unlockAt) return setError('Choose when the surprise unlocks');
    setBusy(true);
    setError('');
    const payload = {
      title: title.trim(),
      body: body.trim(),
      emoji,
      color,
      mediaIds: media.map((m) => m.id),
      deliverAt: kind === 'note' ? localInputToISO(deliverAt) : null,
      unlockAt: kind === 'surprise' ? localInputToISO(unlockAt) : null,
    };
    try {
      if (editing) await patch(`/notes/${editing.id}`, payload);
      else await post('/notes', { ...payload, audience: forPartner ? 'partner' : kind, kind: forPartner ? kind : 'note' });
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(
        editing ? 'Saved' : kind === 'note' && deliverAt ? 'Scheduled' : forPartner ? `On its way to ${partner?.name}` : 'Saved',
        forPartner ? '💌' : undefined,
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const now = isoToLocalInput(new Date().toISOString());

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit note' : 'New note'}
      wide
      footer={
        <Button block size="lg" loading={busy} disabled={needsPartner} onClick={save}>
          {editing ? 'Save changes' : kind === 'note' && deliverAt ? 'Schedule' : forPartner ? 'Send' : 'Save'}
        </Button>
      }
    >
      {!editing && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => {
                setKind(k.id);
                if (k.id === 'daily') setEmoji('☀️');
              }}
              aria-pressed={kind === k.id}
              className={cn('rounded-2xl border p-3 text-left transition', kind === k.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
            >
              <span className="text-xl">{k.emoji}</span>
              <span className="mt-1 block text-sm font-semibold">{k.label}</span>
              <span className="block text-xs leading-snug text-muted">{k.hint}</span>
            </button>
          ))}
        </div>
      )}

      {needsPartner ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">You can write this once your partner has joined. Shared and private notes work right away.</p>
      ) : (
        <div className="space-y-4">
          {kind === 'open_when' && (
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {OPEN_WHEN.map((label) => (
                <Chip key={label} active={title === label} onClick={() => setTitle(label)}>
                  {label}
                </Chip>
              ))}
            </div>
          )}
          {kind !== 'daily' && (
            <div className="flex items-end gap-3">
              <EmojiButton value={emoji} onChange={setEmoji} />
              <div className="flex-1">
                <Input
                  label={kind === 'open_when' ? 'Open when…' : 'Title'}
                  placeholder={kind === 'open_when' ? 'Open when you miss me' : 'Optional'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
          )}
          <Textarea
            label={kind === 'daily' ? 'A little message for today' : 'Your words'}
            placeholder={kind === 'daily' ? 'Have a beautiful day ❤️' : 'I hope you have an amazing day ❤️'}
            rows={kind === 'daily' ? 2 : 6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={kind === 'daily' ? 200 : 10000}
            data-autofocus
          />
          {kind !== 'daily' && (
            <>
              <div>
                <p className="mb-1.5 px-1 text-sm font-medium">Photos</p>
                <PhotoPicker value={media} onChange={setMedia} purpose="note" />
              </div>
              <div>
                <p className="mb-1.5 px-1 text-sm font-medium">Paper</p>
                <div className="flex gap-2" role="radiogroup" aria-label="Note colour">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      role="radio"
                      aria-checked={color === a.id}
                      aria-label={a.label}
                      onClick={() => setColor(a.id)}
                      className={cn('size-9 rounded-full border-2 transition', color === a.id ? 'scale-110 border-ink' : 'border-transparent')}
                      style={{ background: HUES[a.id] }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {kind === 'note' && !(editing && editing.delivered) && (
            <Input label="Send later" hint="Leave empty to send now." type="datetime-local" min={now} value={deliverAt} onChange={(e) => setDeliverAt(e.target.value)} />
          )}
          {kind === 'surprise' && (
            <Input label="Unlocks on" hint="They'll see a wrapped surprise until then, but not what's inside." type="datetime-local" min={now} value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} />
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default function Notes() {
  const partner = usePartner();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotes();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('inbox');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; editing: Note | null; kind: Kind }>({ open: false, editing: null, kind: 'note' });
  const [viewer, setViewer] = useState<Media | null>(null);
  const partnerName = partner?.name ?? 'Your partner';

  useEffect(() => {
    if (params.get('new')) {
      setEditor({ open: true, editing: null, kind: (params.get('new') as Kind) || 'note' });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const groups = useMemo(() => {
    const all = (data ?? []).filter((n) => n.kind !== 'daily' || n.mine);
    const live = all.filter((n) => !n.archived);
    const sort = (list: Note[]) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return {
      inbox: sort(live.filter((n) => n.audience === 'partner' && !n.mine)),
      sent: sort(live.filter((n) => n.audience === 'partner' && n.mine)),
      shared: sort(live.filter((n) => n.audience === 'shared')),
      private: sort(live.filter((n) => n.audience === 'private')),
      archived: all.filter((n) => n.archived),
    } satisfies Record<Tab, Note[]>;
  }, [data]);

  const unread = groups.inbox.filter((n) => !n.readAt).length;
  const open = data?.find((n) => n.id === openId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notes'] });

  async function openNote(note: Note) {
    if (note.locked) return toast.info(`This unlocks ${formatDateTime(note.unlockAt!)}`, '🎁');
    if (note.sealed) {
      const ok = await confirm({ title: note.title, body: 'Open this letter now? Your partner will know you opened it.', confirmLabel: 'Open it' });
      if (!ok) return;
    }
    setOpenId(note.id);
    if (note.audience === 'partner' && !note.mine && !note.readAt) {
      try {
        await post(`/notes/${note.id}/open`);
        await refresh();
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }
  }

  async function flag(note: Note, flags: { pinned?: boolean; archived?: boolean }) {
    try {
      await post(`/notes/${note.id}/flags`, flags);
      await refresh();
      if (flags.archived !== undefined) setOpenId(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(note: Note) {
    if (!(await confirm({ title: 'Delete this note?', body: note.audience === 'private' ? 'This cannot be undone.' : 'It will be removed for both of you.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await del(`/notes/${note.id}`);
      setOpenId(null);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'inbox', label: `For you${unread ? ` · ${unread}` : ''}` },
    { id: 'sent', label: 'From you' },
    { id: 'shared', label: 'Ours' },
    { id: 'private', label: 'Private' },
    { id: 'archived', label: 'Archived' },
  ];

  const empty: Record<Tab, { emoji: string; title: string; body: string }> = {
    inbox: { emoji: '💌', title: 'No notes yet', body: `When ${partnerName} leaves you a note, it will be waiting here.` },
    sent: { emoji: '✍️', title: 'Write the first one', body: 'A few kind words go a long way. Send it now, schedule it, or seal it for later.' },
    shared: { emoji: '📝', title: 'Nothing shared yet', body: 'Keep things you both need: the wifi password, gift ideas for mum, the plan for Saturday.' },
    private: { emoji: '🔒', title: 'Just for you', body: 'Private notes are never shown to your partner. Handy for planning surprises.' },
    archived: { emoji: '🗂️', title: 'Nothing archived', body: 'Archive a note to tuck it away without deleting it.' },
  };

  const canEdit = open && ((open.mine && !(open.audience === 'partner' && open.readAt)) || open.audience === 'shared');
  const canDelete = open && (open.mine || open.audience === 'shared');
  const list = groups[tab];

  return (
    <Page
      title="Love notes"
      back={<BackButton />}
      wide
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditor({ open: true, editing: null, kind: tab === 'shared' ? 'shared' : tab === 'private' ? 'private' : 'note' })}>
          Write
        </Button>
      }
    >
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {tabs.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <SkeletonList rows={3} className="h-32" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState {...empty[tab]} action={tab !== 'inbox' && tab !== 'archived' ? <Button onClick={() => setEditor({ open: true, editing: null, kind: tab === 'sent' ? 'note' : tab })}>Write a note</Button> : undefined} />
      ) : (
        <div className="gap-3 space-y-3 sm:columns-2 lg:columns-3">
          {list.map((note) => (
            <NoteCard key={note.id} note={note} partnerName={partnerName} onOpen={() => openNote(note)} />
          ))}
        </div>
      )}

      <Sheet open={Boolean(open)} onClose={() => setOpenId(null)} wide>
        {open && (
          <div>
            <div className="rounded-[24px] border p-5" style={paper(open.color)}>
              <p className="text-4xl" aria-hidden>
                {open.emoji}
              </p>
              {open.title && <h2 className="mt-2 text-2xl leading-snug">{open.title}</h2>}
              {open.body && <p className="mt-3 whitespace-pre-wrap text-[17px] leading-relaxed">{open.body}</p>}
              {open.media.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {open.media.map((m) => (
                    <button key={m.id} onClick={() => setViewer(m)} className="overflow-hidden rounded-2xl" aria-label="Open photo">
                      <img src={m.thumbUrl ?? m.url} alt="" className="aspect-square w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-muted">
                {open.audience === 'private' ? 'Private' : open.audience === 'shared' ? 'Shared' : open.mine ? `To ${partnerName}` : `From ${partnerName}`} · {formatDateTime(open.createdAt)}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-end gap-1">
              <IconButton label={open.pinned ? 'Unpin' : 'Pin'} onClick={() => flag(open, { pinned: !open.pinned })}>
                {open.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
              </IconButton>
              <IconButton label={open.archived ? 'Move out of archive' : 'Archive'} onClick={() => flag(open, { archived: !open.archived })}>
                {open.archived ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
              </IconButton>
              {canEdit && (
                <IconButton
                  label="Edit"
                  onClick={() => {
                    setEditor({ open: true, editing: open, kind: 'note' });
                    setOpenId(null);
                  }}
                >
                  <Pencil className="size-5" />
                </IconButton>
              )}
              {canDelete && (
                <IconButton label="Delete" className="hover:text-danger" onClick={() => remove(open)}>
                  <Trash2 className="size-5" />
                </IconButton>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Editor open={editor.open} editing={editor.editing} initialKind={editor.kind} onClose={() => setEditor((e) => ({ ...e, open: false }))} />
      <Lightbox media={viewer} onClose={() => setViewer(null)} />
    </Page>
  );
}
