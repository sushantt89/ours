import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { errorMessage, get, post } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import type { Question } from '@/lib/types';
import { useMe, usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Button, Card, EmptyState, ErrorState, SectionTitle, Skeleton, Textarea } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';

function Answer({ name, avatarUrl, text, delay = 0 }: { name: string; avatarUrl?: string | null; text: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, rotateX: -70, y: 12 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ delay, type: 'spring', damping: 16 }} className="rounded-3xl bg-surface-2 p-4">
      <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-muted">
        <Avatar name={name} src={avatarUrl} size="xs" /> {name}
      </p>
      <p className="whitespace-pre-wrap text-[17px] leading-relaxed">{text}</p>
    </motion.div>
  );
}

export default function DailyQuestion() {
  const me = useMe();
  const partner = usePartner();
  const queryClient = useQueryClient();
  const today = useQuery({ queryKey: ['question', 'today'], queryFn: () => get<{ question: Question }>('/questions/today').then((r) => r.question) });
  const history = useQuery({ queryKey: ['question', 'history'], queryFn: () => get<{ questions: Question[] }>('/questions/history').then((r) => r.questions) });
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const partnerName = partner?.name ?? 'Your partner';
  const q = today.data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { question } = await post<{ question: Question }>('/questions/today/answer', { text: text.trim() });
      queryClient.setQueryData(['question', 'today'], question);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditing(false);
      setText('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const both = Boolean(q?.myAnswer && q.partnerAnswer !== null);

  return (
    <Page title="Daily question" subtitle="Answer on your own, then reveal together" back={<BackButton />}>
      {today.isLoading ? (
        <Skeleton className="h-72 rounded-card" />
      ) : today.isError || !q ? (
        <ErrorState onRetry={() => today.refetch()} />
      ) : (
        <Card className="relative overflow-hidden p-6">
          <div className="absolute inset-x-0 top-0 h-32 opacity-[0.14] accent-gradient [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{formatDate(q.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="mt-4 text-5xl" aria-hidden>
              {q.emoji}
            </p>
            <h2 className="mt-3 text-[28px] leading-tight">{q.question}</h2>

            {!q.myAnswer || editing ? (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <Textarea aria-label="Your answer" placeholder="Take your time…" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoFocus={editing} />
                <p className="text-sm text-muted">
                  {q.partnerAnswered ? `${partnerName} has answered. Yours unlocks theirs.` : `${partnerName} can't see your answer until they've written their own.`}
                </p>
                <div className="flex gap-2">
                  {editing && (
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" block size="lg" loading={busy} disabled={!text.trim()}>
                    {editing ? 'Update my answer' : 'Lock in my answer'}
                  </Button>
                </div>
              </form>
            ) : both && !revealed ? (
              <div className="mt-8 text-center">
                <p className="text-muted">You've both answered.</p>
                <Button size="lg" className="mt-3" onClick={() => setRevealed(true)}>
                  Reveal answers ✨
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-3 [perspective:800px]">
                <Answer name="You" avatarUrl={me.avatarUrl} text={q.myAnswer} />
                {both ? (
                  <Answer name={partnerName} avatarUrl={partner?.avatarUrl} text={q.partnerAnswer!} delay={0.25} />
                ) : (
                  <div className="rounded-3xl border-2 border-dashed border-line p-5 text-center text-muted">
                    <p className="text-2xl" aria-hidden>
                      ⏳
                    </p>
                    <p className="mt-1">Waiting for {partnerName}. We'll let you know when they answer.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setText(q.myAnswer ?? '');
                        setEditing(true);
                      }}
                    >
                      Edit my answer
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mt-8">
        <SectionTitle>Past questions</SectionTitle>
        {history.isLoading ? (
          <Skeleton className="h-24" />
        ) : !history.data?.length ? (
          <EmptyState emoji="📖" title="Your answers will collect here" body="Every question you answer becomes a little memory to look back on." />
        ) : (
          <ul className="space-y-3">
            {history.data.map((item) => (
              <li key={item.id}>
                <Card className="p-5">
                  <p className="text-xs font-medium text-muted">{formatDate(item.date)}</p>
                  <p className="mt-1 font-display text-lg leading-snug">
                    {item.emoji} {item.question}
                  </p>
                  <dl className="mt-3 space-y-2 text-[15px]">
                    {item.myAnswer && (
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wider text-faint">You</dt>
                        <dd className="whitespace-pre-wrap">{item.myAnswer}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-faint">{partnerName}</dt>
                      <dd className="whitespace-pre-wrap">{item.partnerAnswer ?? (item.partnerAnswered ? <span className="text-muted">Answered, but you skipped this one, so theirs stays sealed.</span> : <span className="text-muted">Didn't answer</span>)}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
