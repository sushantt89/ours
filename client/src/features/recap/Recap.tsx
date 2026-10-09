import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Play, X } from 'lucide-react';
import { get } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import type { Media } from '@/lib/types';
import { usePartner } from '@/store/auth';
import { Card, EmptyState, ErrorState, SkeletonList, Spinner } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

interface Period {
  key: string;
  label: string;
  from: string;
  to: string;
  complete: boolean;
}

interface RecapData {
  period: Period;
  names: string[];
  days: number;
  messages: { total: number; byPerson: { name: string; count: number }[]; perDay: number; busiestDay: { date: string; count: number } | null; topEmojis: { value: string; count: number }[]; iLoveYous: number; encrypted: number };
  calls: { count: number; minutes: number };
  memories: { total: number; top: { id: string; caption: string; location: string; date: string; media: Media }[]; places: { value: string; count: number }[] };
  nudges: { total: number; favourite: { value: string; count: number } | null };
  notes: number;
  dateNights: string[];
  bucketDone: string[];
  questions: number;
  songs: { total: number; last: { title: string; artist: string } | null };
  journalDays: number;
  watched: { total: number; favourite: { title: string; stars: number } | null };
  longestStreak: number;
}

const BACKGROUNDS = [
  'linear-gradient(160deg,#2a0f2e,#6b1d4f 55%,#e2557c)',
  'linear-gradient(160deg,#1d1238,#4a2a8a 60%,#d667a6)',
  'linear-gradient(160deg,#0f2433,#1f5c7a 60%,#5fb7c2)',
  'linear-gradient(160deg,#2b1408,#8a3f1d 60%,#f2a65a)',
  'linear-gradient(160deg,#0f2a1f,#2f6d55 60%,#9bcf88)',
  'linear-gradient(160deg,#2a0f1a,#a12d55 60%,#f08a6e)',
];

function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 1100;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className={className}>{shown.toLocaleString()}</span>;
}

const Big = ({ children }: { children: ReactNode }) => <p className="font-display text-[84px] font-medium leading-none tracking-tight">{children}</p>;
const Kicker = ({ children }: { children: ReactNode }) => <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-80">{children}</p>;
const Line = ({ children }: { children: ReactNode }) => <p className="font-display text-[28px] leading-snug">{children}</p>;

function buildSlides(r: RecapData, partnerName: string) {
  const slides: ReactNode[] = [];
  const [a, b] = r.names;
  slides.push(
    <>
      <Kicker>{r.period.complete ? 'Year in review' : 'So far this year'}</Kicker>
      <p className="mt-6 font-display text-6xl leading-[1.05]">{r.period.label}</p>
      <p className="mt-4 text-xl opacity-90">{[a, b].filter(Boolean).join(' & ')}</p>
      <p className="mt-2 opacity-75">
        {formatDate(r.period.from)} – {r.period.complete ? formatDate(r.period.to) : 'today'}
      </p>
    </>,
  );
  slides.push(
    <>
      <Kicker>Together for another</Kicker>
      <Big>
        <CountUp value={r.days} />
      </Big>
      <Line>{r.days === 1 ? 'day' : 'days'}</Line>
      {r.longestStreak > 1 && <p className="mt-8 text-lg opacity-90">Your longest love streak: {r.longestStreak} days in a row of both showing up. 🔥</p>}
    </>,
  );
  if (r.messages.total) {
    const top = [...r.messages.byPerson].sort((x, y) => y.count - x.count);
    slides.push(
      <>
        <Kicker>You sent each other</Kicker>
        <Big>
          <CountUp value={r.messages.total} />
        </Big>
        <Line>{r.messages.total === 1 ? 'message' : 'messages'}</Line>
        {r.messages.perDay >= 1 && <p className="mt-6 text-lg opacity-90">That's about {r.messages.perDay.toLocaleString()} a day.</p>}
        {top[0] && top[1] && top[0].count !== top[1].count && r.messages.total >= 10 && (
          <p className="mt-2 text-lg opacity-90">
            {top[0].name} sent {Math.round((top[0].count / Math.max(1, r.messages.total)) * 100)}% of them. 😄
          </p>
        )}
        {r.messages.busiestDay && r.messages.busiestDay.count > 1 && (
          <p className="mt-2 text-lg opacity-90">
            Your chattiest day: {formatDate(r.messages.busiestDay.date, { day: 'numeric', month: 'long' })}, with {r.messages.busiestDay.count} messages.
          </p>
        )}
      </>,
    );
  }
  if (r.messages.iLoveYous || r.messages.topEmojis.length) {
    slides.push(
      <>
        {r.messages.iLoveYous > 0 && (
          <>
            <Kicker>"I love you"</Kicker>
            <Big>
              <CountUp value={r.messages.iLoveYous} />
            </Big>
            <Line>{r.messages.iLoveYous === 1 ? 'time' : 'times'}, in writing</Line>
          </>
        )}
        {r.messages.topEmojis.length > 0 && (
          <div className="mt-10">
            <Kicker>Your emojis</Kicker>
            <div className="mt-4 flex gap-4">
              {r.messages.topEmojis.map((e, i) => (
                <motion.span key={e.value} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2 + i * 0.12, type: 'spring' }} className="text-center">
                  <span className="block text-5xl">{e.value}</span>
                  <span className="mt-1 block text-sm opacity-80">×{e.count}</span>
                </motion.span>
              ))}
            </div>
          </div>
        )}
      </>,
    );
  }
  if (r.memories.total) {
    slides.push(
      <>
        <Kicker>Memories saved</Kicker>
        <Big>
          <CountUp value={r.memories.total} />
        </Big>
        <div className="mt-6 grid grid-cols-3 gap-1.5">
          {r.memories.top.slice(0, 9).map((m, i) => (
            <motion.img
              key={m.id}
              src={m.media.thumbUrl ?? m.media.url}
              alt={m.caption}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              className="aspect-square w-full rounded-xl object-cover"
            />
          ))}
        </div>
        <p className="mt-3 text-sm opacity-80">Your most loved ones</p>
      </>,
    );
  }
  if (r.memories.places.length) {
    slides.push(
      <>
        <Kicker>Where you went</Kicker>
        <Line>{r.memories.places.length === 1 ? 'One place you made yours' : `${r.memories.places.length} places you made yours`}</Line>
        <ul className="mt-6 space-y-2">
          {r.memories.places.slice(0, 8).map((p, i) => (
            <motion.li key={p.value} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="text-xl">
              📍 {p.value}
            </motion.li>
          ))}
        </ul>
      </>,
    );
  }
  if (r.nudges.total) {
    slides.push(
      <>
        <Kicker>Nudges</Kicker>
        <Big>
          <CountUp value={r.nudges.total} />
        </Big>
        <Line>{r.nudges.total === 1 ? 'little tap of love' : 'little taps of love'}</Line>
        {r.nudges.favourite && (
          <p className="mt-8 text-xl">
            Your favourite: <span className="font-semibold">{r.nudges.favourite.value}</span>, sent {r.nudges.favourite.count} times.
          </p>
        )}
      </>,
    );
  }
  const extras = [
    r.notes && { emoji: '💌', value: r.notes, label: 'love notes' },
    r.dateNights.length && { emoji: '🍽️', value: r.dateNights.length, label: 'date nights' },
    r.bucketDone.length && { emoji: '✨', value: r.bucketDone.length, label: 'dreams ticked off' },
    r.questions && { emoji: '💭', value: r.questions, label: 'questions answered' },
    r.songs.total && { emoji: '🎵', value: r.songs.total, label: 'songs shared' },
    r.journalDays && { emoji: '📔', value: r.journalDays, label: 'journal pages' },
    r.watched.total && { emoji: '🍿', value: r.watched.total, label: 'films & shows' },
    r.calls.minutes && { emoji: '📞', value: r.calls.minutes, label: 'minutes on calls' },
  ].filter(Boolean) as { emoji: string; value: number; label: string }[];
  if (extras.length) {
    slides.push(
      <>
        <Kicker>And also</Kicker>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {extras.map((x, i) => (
            <motion.div key={x.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="rounded-2xl bg-white/12 p-4 backdrop-blur">
              <p className="text-2xl">{x.emoji}</p>
              <p className="mt-1 font-display text-3xl">{x.value.toLocaleString()}</p>
              <p className="text-sm opacity-85">{x.label}</p>
            </motion.div>
          ))}
        </div>
        {r.watched.favourite && <p className="mt-6 opacity-90">Top-rated watch: {r.watched.favourite.title} ({r.watched.favourite.stars.toFixed(1)}★)</p>}
      </>,
    );
  }
  slides.push(
    <>
      <p className="text-7xl">❤️</p>
      <p className="mt-6 font-display text-5xl leading-tight">{r.period.complete ? "Here's to the next one." : 'And the year isn’t over yet.'}</p>
      <p className="mt-4 text-lg opacity-85">With love, from your little home for two{partnerName ? `, and from ${partnerName}` : ''}.</p>
    </>,
  );
  return slides;
}

const SLIDE_MS = 6500;

function StoryPlayer({ periodKey, onClose }: { periodKey: string; onClose: () => void }) {
  const partner = usePartner();
  const { data, isLoading, isError } = useQuery({ queryKey: ['recap', periodKey], queryFn: () => get<RecapData>(`/recap/${periodKey}`) });
  const slides = useMemo(() => (data ? buildSlides(data, partner?.name ?? '') : []), [data, partner?.name]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const started = useRef(Date.now());
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, slides.length]);

  useEffect(() => {
    started.current = Date.now();
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (!slides.length || paused) return;
    const offset = progress * SLIDE_MS;
    started.current = Date.now() - offset;
    const timer = setInterval(() => {
      const p = (Date.now() - started.current) / SLIDE_MS;
      if (p >= 1) {
        if (index < slides.length - 1) setIndex(index + 1);
        else setPaused(true);
      } else setProgress(p);
    }, 50);
    return () => clearInterval(timer);
  }, [index, paused, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Year in review" className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-md overflow-hidden text-white sm:h-[92dvh] sm:rounded-[32px]" style={{ background: BACKGROUNDS[index % BACKGROUNDS.length], transition: 'background 0.6s' }}>
        <div className="absolute inset-x-0 top-0 z-10 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="flex gap-1">
            {slides.map((_, i) => (
              <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
              </span>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <button aria-label="Close" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-black/20 backdrop-blur">
              <X className="size-5" />
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="grid h-full place-items-center">
            <Spinner className="size-8" />
          </div>
        ) : isError ? (
          <div className="grid h-full place-items-center p-8 text-center">Couldn't load your year. Please try again.</div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.35 }}
                className="flex h-full flex-col justify-center px-8 pb-16 pt-24"
                aria-live="polite"
              >
                {slides[index]}
              </motion.div>
            </AnimatePresence>
            <button aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" onClick={() => setIndex((i) => Math.max(0, i - 1))} />
            <button
              aria-label="Next"
              className="absolute inset-y-0 right-0 w-2/3"
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onClick={() => (index < slides.length - 1 ? setIndex(index + 1) : onClose())}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function Recap() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['recap'], queryFn: () => get<{ periods: Period[] }>('/recap').then((r) => r.periods) });
  const [playing, setPlaying] = useState<string | null>(params.get('year'));

  useEffect(() => {
    if (params.get('year')) setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page title="Year in review" subtitle="Your story, one year at a time" back={<BackButton to="/story" />}>
      {isLoading ? (
        <SkeletonList rows={3} className="h-24" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState emoji="🎞️" title="Your first year is still being written" body="Come back on your anniversary." />
      ) : (
        <div className="space-y-3">
          {data.map((p, i) => (
            <button key={p.key} onClick={() => setPlaying(p.key)} className="block w-full text-left">
              <Card className="flex items-center gap-4 overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-float">
                <span className="grid h-24 w-24 shrink-0 place-items-center text-white" style={{ background: BACKGROUNDS[i % BACKGROUNDS.length] }}>
                  <Play className="size-8 fill-current" />
                </span>
                <span className="min-w-0 flex-1 py-3">
                  <span className="block font-display text-xl">{p.label}</span>
                  <span className="block text-sm text-muted">
                    {formatDate(p.from, { month: 'short', year: 'numeric' })} – {p.complete ? formatDate(p.to, { month: 'short', year: 'numeric' }) : 'now'}
                  </span>
                  {!p.complete && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">In progress</span>}
                </span>
                <ChevronRight className="mr-4 size-5 text-faint" />
              </Card>
            </button>
          ))}
        </div>
      )}
      {playing && <StoryPlayer periodKey={playing} onClose={() => setPlaying(null)} />}
    </Page>
  );
}
