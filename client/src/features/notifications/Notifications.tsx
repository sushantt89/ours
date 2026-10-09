import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Settings } from 'lucide-react';
import { del, errorMessage, post } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { AppNotification } from '@/lib/types';
import { confirm, toast } from '@/store/ui';
import { Button, Card, EmptyState, ErrorState, IconButton, SkeletonList } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { useNotifications } from './useNotifications';

export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotifications();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  async function open(n: AppNotification) {
    if (!n.readAt && n.id) void post('/notifications/read', { ids: [n.id] }).then(refresh).catch(() => undefined);
    navigate(n.url || '/');
  }

  async function clearAll() {
    if (!(await confirm({ title: 'Clear all notifications?', confirmLabel: 'Clear', danger: true }))) return;
    try {
      await del('/notifications');
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Page
      title="Notifications"
      back={<BackButton to="/" />}
      actions={
        <>
          {Boolean(data?.unread) && (
            <IconButton label="Mark all as read" onClick={() => post('/notifications/read').then(refresh)}>
              <CheckCheck className="size-5" />
            </IconButton>
          )}
          <IconButton label="Notification settings" onClick={() => navigate('/settings?section=notifications')}>
            <Settings className="size-5" />
          </IconButton>
        </>
      }
    >
      {isLoading ? (
        <SkeletonList rows={5} className="h-16" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.notifications.length ? (
        <EmptyState emoji="🔔" title="All quiet" body="Notes, nudges, reminders and milestones will show up here." />
      ) : (
        <>
          <Card className="divide-y divide-line/70 overflow-hidden">
            {data.notifications.map((n) => (
              <button key={n.id} onClick={() => open(n)} className={cn('flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition hover:bg-surface-2', !n.readAt && 'bg-accent-soft/50')}>
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden>
                  {n.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block leading-snug', !n.readAt ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-faint">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
              </button>
            ))}
          </Card>
          <div className="mt-4 text-center">
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
