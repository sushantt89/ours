import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Lock, Plus, Repeat, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { EVENT_TYPES } from '@/lib/constants';
import { addDays, addMonths, daysBetween, formatDate, formatMonth, inDays, nextOccurrence, occurrencesIn, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { CalendarEvent, Recurrence } from '@/lib/types';
import { useCouple } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, Chip, EmojiButton, EmptyState, ErrorState, IconButton, Input, SectionTitle, Select, Sheet, SkeletonList, Switch, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';

export const useEvents = () => useQuery({ queryKey: ['events'], queryFn: () => get<{ events: CalendarEvent[] }>('/events').then((r) => r.events) });

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REMINDERS = [
  { days: 0, label: 'On the day' },
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
];

/** Builds a .ics file so the shared calendar can be imported into Google, Apple or Outlook calendars. */
function downloadICS(events: CalendarEvent[]) {
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ours//Couple Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    const start = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@ours`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(`${e.emoji} ${e.title}`)}`);
    if (e.time) {
      lines.push(`DTSTART:${start}T${e.time.replace(':', '')}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
    }
    if (e.recurrence !== 'none') lines.push(`RRULE:FREQ=${e.recurrence.toUpperCase()}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'ours-calendar.ics' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EventSheet({ open, onClose, event, date }: { open: boolean; onClose: () => void; event: CalendarEvent | null; date: string }) {
  const queryClient = useQueryClient();
  const blank = { title: '', emoji: '🍽️', type: 'date_night', date, time: '', recurrence: 'none' as Recurrence, remindDaysBefore: [0, 1], notes: '', personal: false };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      event
        ? { title: event.title, emoji: event.emoji, type: event.type, date: event.date, time: event.time ?? '', recurrence: event.recurrence, remindDaysBefore: event.remindDaysBefore, notes: event.notes, personal: event.visibility === 'personal' }
        : blank,
    );
  }, [open, event, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['events'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);

  async function save() {
    if (!form.title.trim()) return setError('Give it a title');
    if (!form.date) return setError('Choose a date');
    setBusy(true);
    const { personal, ...rest } = form;
    const body = { ...rest, title: form.title.trim(), time: form.time || null, visibility: personal ? 'personal' : 'shared' };
    try {
      if (event) await patch(`/events/${event.id}`, body);
      else await post('/events', body);
      await refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (!(await confirm({ title: `Delete "${event.title}"?`, body: event.recurrence !== 'none' ? 'This removes every repeat of it too.' : undefined, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await del(`/events/${event.id}`);
      await refresh();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const pickType = (id: string) => {
    const type = EVENT_TYPES.find((t) => t.id === id)!;
    setForm((f) => ({ ...f, type: id, emoji: type.emoji, recurrence: ['anniversary', 'birthday', 'first_date', 'first_kiss'].includes(id) ? 'yearly' : f.recurrence, personal: id === 'reminder' ? true : f.personal }));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      wide
      footer={
        <div className="flex gap-2">
          {event && (
            <Button variant="outline" aria-label="Delete event" onClick={remove} className="text-danger">
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button block size="lg" loading={busy} onClick={save}>
            {event ? 'Save changes' : 'Add to calendar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {EVENT_TYPES.map((t) => (
            <Chip key={t.id} active={form.type === t.id} onClick={() => pickType(t.id)}>
              {t.emoji} {t.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <EmojiButton value={form.emoji} onChange={(emoji) => setForm({ ...form, emoji })} />
          <div className="flex-1">
            <Input label="Title" placeholder="Date night" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} error={error} data-autofocus />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Time" hint="Optional" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </div>
        <Select label="Repeats" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as Recurrence })}>
          <option value="none">Doesn't repeat</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
          <option value="yearly">Every year</option>
        </Select>
        <div>
          <p className="mb-1.5 px-1 text-sm font-medium">Remind us</p>
          <div className="flex flex-wrap gap-2">
            {REMINDERS.map((r) => (
              <Chip
                key={r.days}
                active={form.remindDaysBefore.includes(r.days)}
                onClick={() => setForm((f) => ({ ...f, remindDaysBefore: f.remindDaysBefore.includes(r.days) ? f.remindDaysBefore.filter((d) => d !== r.days) : [...f.remindDaysBefore, r.days] }))}
              >
                {r.label}
              </Chip>
            ))}
          </div>
        </div>
        <Textarea label="Notes" rows={2} placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
        <Switch label="Just for me" hint="A personal reminder your partner won't see. Useful for planning surprises." checked={form.personal} onChange={(personal) => setForm({ ...form, personal })} />
      </div>
    </Sheet>
  );
}

export default function Calendar() {
  const couple = useCouple();
  const today = todayIn(couple.timezone);
  const { data: events, isLoading, isError, refetch } = useEvents();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [sheet, setSheet] = useState<{ open: boolean; event: CalendarEvent | null }>({ open: false, event: null });

  const grid = useMemo(() => {
    const first = `${month}-01`;
    const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday first
    const start = addDays(first, -weekday);
    const end = addDays(addMonths(first, 1), -1);
    const cells = Math.ceil((weekday + daysBetween(first, end) + 1) / 7) * 7;
    const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of events ?? []) {
      for (const day of occurrencesIn(event, days[0], days[days.length - 1])) {
        byDay.set(day, [...(byDay.get(day) ?? []), event]);
      }
    }
    return { days, byDay };
  }, [month, events]);

  const upcoming = useMemo(
    () =>
      (events ?? [])
        .map((e) => ({ event: e, next: nextOccurrence(e.date, e.recurrence, today) }))
        .filter((x): x is { event: CalendarEvent; next: string } => x.next !== null)
        .sort((a, b) => a.next.localeCompare(b.next))
        .slice(0, 8),
    [events, today],
  );

  const dayEvents = grid.byDay.get(selected) ?? [];
  const open = (event: CalendarEvent) => {
    if (event.virtual) {
      toast.info(event.type === 'anniversary' ? 'Your anniversary comes from your start date. Change it in Settings.' : 'Birthdays come from your profiles. Change them in Settings.', event.emoji);
      return;
    }
    setSheet({ open: true, event });
  };

  const EventRow = ({ event, date, showCountdown }: { event: CalendarEvent; date: string; showCountdown?: boolean }) => (
    <button onClick={() => open(event)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-surface-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl" aria-hidden>
        {event.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate font-semibold">
          <span className="truncate">{event.title}</span>
          {event.recurrence !== 'none' && <Repeat className="size-3.5 shrink-0 text-faint" aria-label="Repeats" />}
          {event.visibility === 'personal' && <Lock className="size-3.5 shrink-0 text-faint" aria-label="Only you can see this" />}
        </span>
        <span className="block truncate text-sm text-muted">
          {formatDate(date, { weekday: 'short', day: 'numeric', month: 'long' })}
          {event.time && ` · ${event.time}`}
        </span>
      </span>
      {showCountdown && <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{inDays(daysBetween(today, date))}</span>}
    </button>
  );

  return (
    <Page
      title="Calendar"
      wide
      actions={
        <>
          <IconButton label="Export to another calendar app" onClick={() => events?.length ? downloadICS(events) : toast.info('Add an event first')}>
            <Download className="size-5" />
          </IconButton>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, event: null })}>
            Add
          </Button>
        </>
      }
    >
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <IconButton label="Previous month" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
                  <ChevronLeft className="size-5" />
                </IconButton>
                <button className="font-display text-xl" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }} title="Jump to today">
                  {formatMonth(month)}
                </button>
                <IconButton label="Next month" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
                  <ChevronRight className="size-5" />
                </IconButton>
              </div>
              <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-faint" aria-hidden>
                {WEEKDAYS.map((d) => (
                  <span key={d} className="py-1.5">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1" role="grid" aria-label={formatMonth(month)}>
                {grid.days.map((day) => {
                  const inMonth = day.startsWith(month);
                  const items = grid.byDay.get(day) ?? [];
                  const isToday = day === today;
                  const isSelected = day === selected;
                  return (
                    <button
                      key={day}
                      role="gridcell"
                      aria-selected={isSelected}
                      aria-label={`${formatDate(day)}${items.length ? `, ${items.length} event${items.length > 1 ? 's' : ''}` : ''}`}
                      onClick={() => setSelected(day)}
                      onDoubleClick={() => setSheet({ open: true, event: null })}
                      className={cn(
                        'relative mx-auto flex size-11 flex-col items-center justify-center rounded-2xl text-[15px] transition sm:size-12',
                        !inMonth && 'text-faint/60',
                        isSelected ? 'accent-gradient font-semibold text-on-accent shadow-card' : isToday ? 'bg-accent-soft font-semibold text-accent' : 'hover:bg-surface-2',
                      )}
                    >
                      {items.length === 1 && !isSelected ? <span className="text-base leading-none">{items[0].emoji}</span> : Number(day.slice(8))}
                      {items.length === 1 && !isSelected && <span className="text-[9px] leading-none text-muted">{Number(day.slice(8))}</span>}
                      {items.length > 1 && <span className={cn('absolute bottom-1 flex gap-0.5')}>{items.slice(0, 3).map((e, i) => <span key={e.id + i} className={cn('size-1 rounded-full', isSelected ? 'bg-on-accent' : 'bg-accent')} />)}</span>}
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="mt-5">
              <SectionTitle>{selected === today ? 'Today' : formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</SectionTitle>
              {isLoading ? (
                <SkeletonList rows={1} className="h-16" />
              ) : dayEvents.length ? (
                <Card className="divide-y divide-line/70 overflow-hidden">
                  {dayEvents.map((e) => (
                    <EventRow key={e.id} event={e} date={selected} />
                  ))}
                </Card>
              ) : (
                <button
                  onClick={() => setSheet({ open: true, event: null })}
                  className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line py-5 text-muted transition hover:border-accent hover:text-accent"
                >
                  <Plus className="size-4" /> Plan something for this day
                </button>
              )}
            </div>
          </div>

          <div>
            <SectionTitle>Coming up</SectionTitle>
            {isLoading ? (
              <SkeletonList rows={4} className="h-16" />
            ) : upcoming.length ? (
              <Card className="divide-y divide-line/70 overflow-hidden">
                {upcoming.map(({ event, next }) => (
                  <EventRow key={event.id} event={event} date={next} showCountdown />
                ))}
              </Card>
            ) : (
              <EmptyState emoji="📅" title="Nothing planned yet" body="Add your anniversary, birthdays, date nights and trips. You'll both get reminders." />
            )}
            <Link to="/countdowns" className="mt-4 flex items-center justify-between rounded-card border border-line/70 bg-surface p-4 shadow-card transition hover:-translate-y-0.5">
              <span className="flex items-center gap-3 font-medium">
                <span className="text-2xl">⏳</span> Countdowns
              </span>
              <ChevronRight className="size-5 text-faint" />
            </Link>
          </div>
        </div>
      )}

      <EventSheet open={sheet.open} event={sheet.event} date={selected} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Page>
  );
}
