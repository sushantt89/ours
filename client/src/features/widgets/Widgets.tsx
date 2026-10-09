import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, Download, Share } from 'lucide-react';
import { daysBetween, todayIn } from '@/lib/dates';
import { enablePush, getPushState, isIOS, type PushState } from '@/lib/push';
import { useInstall } from '@/lib/pwa';
import { errorMessage } from '@/lib/api';
import { useAuth, useCouple, usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Card, SectionTitle } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { useDashboard } from '@/features/home/useDashboard';

function Preview({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid aspect-square w-full place-items-center rounded-[28px] border border-line/70 bg-surface p-3 text-center shadow-card">{children}</div>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

function Support({ ok, children }: { ok: boolean | 'partial'; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 text-base" aria-hidden>
        {ok === true ? '✅' : ok === 'partial' ? '🟡' : '🚫'}
      </span>
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}

/** What this app can and can't put on a home or lock screen, said plainly. */
export default function Widgets() {
  const couple = useCouple();
  const partner = usePartner();
  const config = useAuth((s) => s.config);
  const { promptEvent, installed, install } = useInstall();
  const { data } = useDashboard();
  const [push, setPush] = useState<PushState>('off');
  const today = todayIn(couple.timezone);
  const days = couple.startDate ? daysBetween(couple.startDate, today) : null;
  const next = data?.upcoming[0];

  useEffect(() => {
    void getPushState().then(setPush);
  }, []);

  async function turnOnPush() {
    if (!config?.pushPublicKey) return toast.error('Push notifications are not set up on this server yet');
    try {
      setPush(await enablePush(config.pushPublicKey));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Page title="Widgets & shortcuts" back={<BackButton />}>
      <div className="grid grid-cols-3 gap-3">
        <Preview label="Days together">
          <div>
            <p className="text-xl">❤️</p>
            <p className="font-display text-2xl leading-tight">{days !== null ? days.toLocaleString() : '—'}</p>
            <p className="text-[11px] text-muted">days together</p>
          </div>
        </Preview>
        <Preview label="Next special date">
          <div>
            <p className="text-xl">{next?.emoji ?? '📅'}</p>
            <p className="font-display text-2xl leading-tight">{next ? next.daysUntil : '—'}</p>
            <p className="line-clamp-1 text-[11px] text-muted">{next ? `days · ${next.title}` : 'nothing planned'}</p>
          </div>
        </Preview>
        <Preview label="Quick nudge">
          <div className="space-y-0.5 text-[11px] font-medium">
            <p>❤️ Send love</p>
            <p>😘 Send kiss</p>
            <p>🫂 Send hug</p>
          </div>
        </Preview>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-xl">Step 1: install the app</h2>
        <p className="mt-1 text-sm text-muted">Shortcuts, the unread badge and (on iPhone) notifications all need the app on your home screen.</p>
        <div className="mt-4">
          {installed ? (
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-5" /> Installed on this device
            </p>
          ) : promptEvent ? (
            <Button icon={<Download className="size-4" />} onClick={async () => (await install()) && toast.success('Installed', '🎉')}>
              Install Ours
            </Button>
          ) : isIOS ? (
            <p className="text-sm leading-relaxed">
              In Safari, tap <Share className="inline size-4 -translate-y-0.5" aria-label="Share" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="text-sm leading-relaxed">
              Open your browser's menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. In Chrome and Edge on a computer, look for the install icon in the address bar.
            </p>
          )}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-xl">Step 2: turn on notifications</h2>
        <p className="mt-1 text-sm text-muted">Nudges, notes and "thinking of you" arrive on your lock screen as notifications.</p>
        <div className="mt-4">
          {push === 'on' ? (
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-5" /> Notifications are on for this device
            </p>
          ) : push === 'blocked' ? (
            <p className="text-sm">Notifications are blocked for this site. Allow them in your browser's site settings, then come back.</p>
          ) : push === 'needs-install' ? (
            <p className="text-sm">On iPhone and iPad, install the app first (step 1), then open it from your home screen to turn notifications on.</p>
          ) : push === 'unsupported' ? (
            <p className="text-sm">This browser doesn't support push notifications.</p>
          ) : (
            <Button icon={<Bell className="size-4" />} onClick={turnOnPush}>
              Turn on notifications
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-8">
        <SectionTitle>What works where</SectionTitle>
        <Card className="px-5 py-3">
          <ul className="divide-y divide-line/70">
            <Support ok>
              <strong>App shortcuts.</strong> Long-press the app icon (Android) or right-click it (Windows, macOS, ChromeOS) for <em>Send love</em>, <em>Nudge</em>, <em>Chat</em> and <em>Add a memory</em>.
            </Support>
            <Support ok>
              <strong>Lock-screen notifications.</strong> Nudges, notes, messages and reminders, on Android, Windows, macOS, and iPhone/iPad (iOS 16.4+, installed app only).
            </Support>
            <Support ok>
              <strong>Unread badge on the app icon.</strong> On installed apps where the system supports it.
            </Support>
            <Support ok="partial">
              <strong>Windows 11 widgets.</strong> "Days together" and "Next special date" are offered to the Windows Widgets board when the app is installed through Microsoft Edge. This is an experimental Edge feature and may not appear on every PC.
            </Support>
            <Support ok={false}>
              <strong>iPhone and Android home-screen or lock-screen widgets.</strong> Apple and Google only allow these from native apps, so a web app cannot provide them. They would need a native wrapper app, which this project doesn't include yet.
            </Support>
          </ul>
        </Card>
        <p className="mt-3 px-1 text-sm text-muted">
          Want the quick-nudge screen one tap away? Open{' '}
          <Link to="/quick" className="font-semibold text-accent">
            Quick nudge
          </Link>{' '}
          and add that page to your home screen.{partner ? ` ${partner.name} will feel it straight away.` : ''}
        </p>
      </div>
    </Page>
  );
}
