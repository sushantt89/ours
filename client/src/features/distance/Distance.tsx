import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { daysBetween, formatDate, formatDateTime, todayIn } from '@/lib/dates';
import { differenceLabel, hourIn, nextLocalTime, partOfDay, timeIn } from '@/lib/timezones';
import type { Nudge, Session } from '@/lib/types';
import { useAuth, useCouple, useMe, usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Button, Card, IconButton, Input, SectionTitle, Switch } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

/** Ticks once a minute so the clocks stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function Clock({ name, label, avatar, zone, now }: { name: string; label?: string; avatar?: string | null; zone: string; now: Date }) {
  const part = partOfDay(hourIn(zone, now));
  return (
    <Card className="flex-1 p-5 text-center">
      <Avatar name={name} src={avatar} size="md" className="mx-auto" />
      <p className="mt-2 font-semibold">{label ?? name}</p>
      <p className="mt-2 whitespace-nowrap font-display text-[28px] leading-none sm:text-4xl">{timeIn(zone, now)}</p>
      <p className="mt-1.5 text-sm text-muted">
        {part.emoji} {timeIn(zone, now, { weekday: 'long' })} {part.label}
      </p>
      <p className="mt-1 truncate text-xs text-faint">{zone.replace(/_/g, ' ').split('/').pop()}</p>
    </Card>
  );
}

const SCHEDULE = [
  { emoji: '☀️', text: 'Good morning', hh: 7, mm: 30, label: 'when they wake up' },
  { emoji: '🌙', text: 'Good night', hh: 22, mm: 0, label: 'at their bedtime' },
  { emoji: '🫶', text: 'Thinking of you', hh: 12, mm: 30, label: 'at their lunchtime' },
];

export default function Distance() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const setSession = useAuth((s) => s.setSession);
  const queryClient = useQueryClient();
  const now = useNow();
  const [reunion, setReunion] = useState(couple.reunionDate ?? '');
  const scheduled = useQuery({ queryKey: ['nudges'], queryFn: () => get<{ recent: Nudge[]; scheduled: (Nudge & { deliverAt: string })[] }>('/nudges') });
  const today = todayIn(me.timezone);
  const theirZone = partner?.timezone ?? me.timezone;
  const apart = theirZone !== me.timezone;

  async function update(body: Record<string, unknown>) {
    try {
      setSession(await patch<Session>('/couple', body));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function schedule(item: (typeof SCHEDULE)[number]) {
    const at = nextLocalTime(theirZone, item.hh, item.mm);
    try {
      await post('/nudges', { emoji: item.emoji, text: item.text, deliverAt: at.toISOString() });
      await queryClient.invalidateQueries({ queryKey: ['nudges'] });
      toast.success(`"${item.text}" arrives ${timeIn(theirZone, at)} their time`, item.emoji);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const daysToGo = couple.reunionDate ? daysBetween(today, couple.reunionDate) : null;

  return (
    <Page title="Long distance" subtitle={apart ? 'Two clocks, one heart' : 'Close by, for now'} back={<BackButton />}>
      <Card className="mb-4 px-5 py-1">
        <Switch
          label="Long-distance mode"
          hint="Shows both your clocks on the home screen and their local time in chat."
          checked={couple.longDistance}
          onChange={(longDistance) => update({ longDistance })}
        />
      </Card>

      <div className="flex gap-3">
        <Clock name={me.name} label="You" avatar={me.avatarUrl} zone={me.timezone} now={now} />
        {partner && <Clock name={partner.name} avatar={partner.avatarUrl} zone={theirZone} now={now} />}
      </div>
      {partner && apart && (
        <p className="mt-3 px-1 text-center text-sm text-muted">
          {partner.name} is {differenceLabel(me.timezone, theirZone, now)}.
          {partOfDay(hourIn(theirZone, now)).asleep && ` It's ${timeIn(theirZone, now)} there, so they may be asleep.`}
        </p>
      )}

      <div className="mt-8">
        <SectionTitle>Until we're together again</SectionTitle>
        <Card className="p-5">
          {daysToGo !== null && daysToGo >= 0 ? (
            <div className="mb-4 text-center">
              <p className="font-display text-6xl leading-none text-gradient">{daysToGo === 0 ? 'Today!' : daysToGo}</p>
              {daysToGo > 0 && <p className="mt-1 text-muted">{daysToGo === 1 ? 'day to go' : 'days to go'}</p>}
              <p className="mt-2 text-sm text-muted">{formatDate(couple.reunionDate!, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted">When will you next see each other? Set it and you'll both get a countdown.</p>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="Next time we see each other" type="date" min={today} value={reunion} onChange={(e) => setReunion(e.target.value)} />
            </div>
            <Button className="h-12" disabled={reunion === (couple.reunionDate ?? '')} onClick={() => update({ reunionDate: reunion || null })}>
              Save
            </Button>
          </div>
        </Card>
      </div>

      {partner && (
        <div className="mt-8">
          <SectionTitle>Timed to their clock</SectionTitle>
          <p className="mb-3 px-1 text-sm text-muted">Schedule a nudge to land at the right moment in {partner.name}'s day, wherever they are.</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {SCHEDULE.map((item) => (
              <button key={item.text} onClick={() => schedule(item)} className="flex items-center gap-3 rounded-[22px] border border-line/70 bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 active:scale-[0.98]">
                <span className="text-3xl">{item.emoji}</span>
                <span>
                  <span className="block font-semibold">{item.text}</span>
                  <span className="block text-sm text-muted">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
          {Boolean(scheduled.data?.scheduled.length) && (
            <Card className="mt-3 divide-y divide-line/70">
              {scheduled.data!.scheduled.map((n) => (
                <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl">{n.emoji}</span>
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{n.text}</span>
                    <span className="block text-muted">
                      Arrives {timeIn(theirZone, new Date(n.deliverAt), { weekday: 'short', hour: 'numeric', minute: '2-digit' })} their time · {formatDateTime(n.deliverAt)} yours
                    </span>
                  </p>
                  <IconButton
                    size="sm"
                    label="Cancel"
                    onClick={() =>
                      del(`/nudges/scheduled/${n.id}`)
                        .then(() => queryClient.invalidateQueries({ queryKey: ['nudges'] }))
                        .catch((err) => toast.error(errorMessage(err)))
                    }
                  >
                    <X className="size-4" />
                  </IconButton>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}
