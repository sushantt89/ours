import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { errorMessage, patch } from '@/lib/api';
import { enablePush, getPushState, isIOS, type PushState } from '@/lib/push';
import type { User } from '@/lib/types';
import { useAuth, usePartner } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Card } from '@/components/ui';

const DISMISS_KEY = 'ours:push-prompt-dismissed';

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Asks once per device to turn on notifications, so texts and nudges reach you when the app is closed. */
export function PushPrompt() {
  const publicKey = useAuth((s) => s.config?.pushPublicKey);
  const partner = usePartner();
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(dismissed);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  if (!publicKey || hidden || !partner || (state !== 'off' && state !== 'needs-install')) return null;
  const name = partner.name.split(' ')[0];

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable: just hide for now */
    }
    setHidden(true);
  }

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush(publicKey!);
      setState(next);
      if (next === 'on') {
        await patch<{ user: User }>('/me', { notificationPrefs: { push: true } })
          .then(({ user }) => useAuth.setState({ user }))
          .catch(() => undefined);
        toast.success(`You'll be notified when ${name} texts or nudges you`, '🔔');
      } else if (next === 'blocked') {
        toast.error('Notifications are blocked for this site. Allow them in your browser settings.');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="relative flex items-start gap-3 p-4">
      <span className="text-2xl" aria-hidden>
        🔔
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Never miss {name}</p>
        {state === 'needs-install' ? (
          <p className="mt-0.5 text-sm text-muted">
            {isIOS
              ? 'On iPhone, tap Share → Add to Home Screen, open Ours from there, then turn on notifications.'
              : 'Install the app to get notifications.'}
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-sm text-muted">Get a notification on this device when {name} texts, nudges or calls you, even with the app closed.</p>
            <Button size="sm" className="mt-3" onClick={turnOn} disabled={busy}>
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </Button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} className="-mr-1 -mt-1 grid size-8 place-items-center rounded-full text-faint hover:bg-surface-2 hover:text-ink" aria-label="Not now">
        <X className="size-4" />
      </button>
    </Card>
  );
}
