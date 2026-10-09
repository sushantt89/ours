import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Flame } from 'lucide-react';
import { get } from '@/lib/api';
import { daysBetween, formatDate, milestonesFor, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Stats } from '@/lib/types';
import { useCouple, useMe, usePartner } from '@/store/auth';
import { Button, Card, CoupleAvatars, EmptyState, SectionTitle, Skeleton } from '@/components/ui';
import { Page, coupleTitle } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { RelationshipCounter } from '@/features/home/RelationshipCounter';

/** `label` is the plural; a trailing "s" is dropped when the value is exactly one. */
function Stat({ emoji, value, label, to, big }: { emoji: string; value: number; label: string; to: string; big?: boolean }) {
  const text = value === 1 ? label.replace(/^(\w+?)s\b/, '$1') : label;
  return (
    <Link to={to} className={cn('group relative overflow-hidden rounded-[26px] border border-line/70 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-float', big && 'col-span-2')}>
      <span className="absolute -right-2 -top-3 text-6xl opacity-[0.12] transition group-hover:scale-110 group-hover:opacity-25" aria-hidden>
        {emoji}
      </span>
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <p className={cn('mt-2 font-display font-medium leading-none tracking-tight', big ? 'text-5xl' : 'text-[34px]')}>{value.toLocaleString()}</p>
      <p className="mt-1 text-sm font-medium text-muted">{text}</p>
    </Link>
  );
}

export default function Story() {
  const me = useMe();
  const couple = useCouple();
  const partner = usePartner();
  const today = todayIn(couple.timezone);
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => get<Stats>('/couple/stats') });

  const { reached, next } = useMemo(() => {
    if (!couple.startDate) return { reached: [], next: [] };
    const all = milestonesFor(couple.startDate);
    return { reached: all.filter((m) => m.date <= today).reverse(), next: all.filter((m) => m.date > today).slice(0, 4) };
  }, [couple.startDate, today]);

  const days = couple.startDate ? Math.max(0, daysBetween(couple.startDate, today)) : 0;
  const upcoming = next[0];
  const previousDays = reached[0]?.days ?? 0;
  const progress = upcoming ? Math.min(100, Math.round(((days - previousDays) / Math.max(1, upcoming.days - previousDays)) * 100)) : 100;

  return (
    <Page title="Our story" back={<BackButton />}>
      <Card className="relative overflow-hidden px-6 py-8">
        <div className="absolute inset-x-0 top-0 h-44 opacity-[0.16] accent-gradient [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative">
          <div className="mb-5 flex flex-col items-center text-center">
            <CoupleAvatars a={me} b={partner} />
            <p className="mt-3 font-display text-2xl">{coupleTitle(couple.name, me.name, partner?.name)}</p>
          </div>
          {couple.startDate ? (
            <RelationshipCounter startDate={couple.startDate} timezone={couple.timezone} />
          ) : (
            <EmptyState emoji="❤️" title="When did it all begin?" body="Add your start date to see your counter and milestones." action={<Link to="/settings?section=couple"><Button>Set our start date</Button></Link>} />
          )}
        </div>
      </Card>

      {upcoming && (
        <Card className="mt-4 p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Next milestone</p>
              <p className="mt-1 font-display text-2xl">{upcoming.label}</p>
              <p className="text-sm text-muted">{formatDate(upcoming.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <p className="shrink-0 text-right">
              <span className="block font-display text-3xl leading-none text-accent">{daysBetween(today, upcoming.date).toLocaleString()}</span>
              <span className="text-xs font-medium text-muted">days to go</span>
            </p>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${upcoming.label}`}>
            <div className="h-full rounded-full accent-gradient transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/recap" className="flex items-center gap-3 rounded-[26px] p-4 text-white shadow-card transition hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#6b1d4f,#e2557c)' }}>
          <span className="text-3xl">🎞️</span>
          <span>
            <span className="block font-display text-lg leading-tight">Year in review</span>
            <span className="block text-xs opacity-85">Your story, like a film</span>
          </span>
        </Link>
        <Link to="/map" className="flex items-center gap-3 rounded-[26px] border border-line/70 bg-surface p-4 shadow-card transition hover:-translate-y-0.5">
          <span className="text-3xl">🗺️</span>
          <span>
            <span className="block font-display text-lg leading-tight">Memory map</span>
            <span className="block text-xs text-muted">Everywhere you've been</span>
          </span>
        </Link>
      </div>

      <div className="mt-8">
        <SectionTitle>Us, in numbers</SectionTitle>
        {stats.isLoading || !stats.data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-[26px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {couple.startDate && <Stat big emoji="❤️" value={days} label="days together" to="/story" />}
            <Stat emoji="💬" value={stats.data.messages} label="messages" to="/chat" />
            <Stat emoji="📸" value={stats.data.memories} label="memories" to="/memories" />
            <Stat emoji="💕" value={stats.data.nudges} label="nudges" to="/nudges" />
            <Stat emoji="📝" value={stats.data.notes} label="love notes" to="/notes" />
            <Stat emoji="🍽️" value={stats.data.dateNights} label="date nights" to="/date-night" />
            <Stat emoji="✈️" value={stats.data.trips} label="trips" to="/calendar" />
            <Stat emoji="✨" value={stats.data.bucketDone} label="dreams ticked off" to="/bucket-list" />
            <Stat emoji="💭" value={stats.data.questions} label="questions answered" to="/question" />
            <Link to="/" className="col-span-2 flex items-center gap-4 rounded-[26px] p-5 text-on-accent shadow-card accent-gradient sm:col-span-1 sm:flex-col sm:items-start sm:gap-2">
              <Flame className="size-8" />
              <span>
                <span className="block font-display text-3xl leading-none">{stats.data.streak}</span>
                <span className="text-sm font-medium opacity-90">day love streak</span>
              </span>
            </Link>
          </div>
        )}
      </div>

      {couple.startDate && (
        <div className="mt-8">
          <SectionTitle>Milestones</SectionTitle>
          <Card className="p-5">
            <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-0.5 before:bg-line">
              {next
                .slice()
                .reverse()
                .map((m) => (
                  <li key={m.key} className="relative flex items-center gap-4">
                    <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2 border-line bg-surface text-xs text-faint">○</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-muted">{m.label}</p>
                      <p className="text-sm text-faint">
                        {formatDate(m.date)} · in {daysBetween(today, m.date).toLocaleString()} days
                      </p>
                    </div>
                  </li>
                ))}
              {reached.map((m, i) => (
                <li key={m.key} className="relative flex items-center gap-4">
                  <span className={cn('z-[1] grid size-7 shrink-0 place-items-center rounded-full text-on-accent', i === 0 ? 'accent-gradient shadow-[0_0_0_5px_var(--color-accent-soft)]' : 'bg-accent')}>
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.label}</p>
                    <p className="text-sm text-muted">{formatDate(m.date)}</p>
                  </div>
                  {m.date === today && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-on-accent">Today 🎉</span>}
                </li>
              ))}
              <li className="relative flex items-center gap-4">
                <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm">❤️</span>
                <div>
                  <p className="font-semibold">Where it began</p>
                  <p className="text-sm text-muted">{formatDate(couple.startDate)}</p>
                </div>
              </li>
            </ol>
          </Card>
        </div>
      )}
    </Page>
  );
}
