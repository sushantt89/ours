import { Copy, RefreshCw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { copyText } from '@/lib/media';
import type { Session } from '@/lib/types';
import { useAuth, useCouple, useMe } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card } from '@/components/ui';

/** Shows the invite code and link while waiting for the second person to join. */
export function InviteCard() {
  const couple = useCouple();
  const me = useMe();
  const setSession = useAuth((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  if (couple.status !== 'pending' || !couple.inviteCode) return null;

  // Built from the address this page is open on, so the link is right on any domain.
  const link = `${window.location.origin}/join/${couple.inviteCode}`;
  const shareText = `${me.name} invited you to your private space on Ours. Join with code ${couple.inviteCode}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: 'Join me on Ours', text: shareText, url: link }).catch(() => undefined);
    } else if (await copyText(link)) toast.success('Invite link copied');
  }

  async function regenerate() {
    const ok = await confirm({
      title: 'Create a new invite code?',
      body: 'The current code and link will stop working straight away.',
      confirmLabel: 'New code',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setSession(await post<Session>('/couple/invite/regenerate'));
      toast.success('New invite code ready');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="accent-gradient px-6 py-7 text-center text-on-accent">
        <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-85">Invite your person</p>
        <p className="mt-3 select-all font-display text-[40px] leading-none tracking-[0.18em]" aria-label={`Invite code ${couple.inviteCode.split('').join(' ')}`}>
          {couple.inviteCode}
        </p>
        <p className="mt-3 text-sm opacity-90">Only one person can use this code. Once they join, it stops working.</p>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center gap-2 rounded-2xl bg-surface-2 py-2 pl-4 pr-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted">{link}</p>
          <Button
            size="sm"
            variant="outline"
            icon={<Copy className="size-4" />}
            onClick={async () => ((await copyText(link)) ? toast.success('Invite link copied') : toast.error('Copy failed. Select the link and copy it manually.'))}
          >
            Copy
          </Button>
        </div>
        <Button block icon={<Share2 className="size-4" />} onClick={share}>
          Share invite
        </Button>
        <Button variant="ghost" size="sm" block loading={busy} icon={<RefreshCw className="size-4" />} onClick={regenerate}>
          Create a new code
        </Button>
      </div>
    </Card>
  );
}
