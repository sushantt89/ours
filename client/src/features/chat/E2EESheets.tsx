import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { errorMessage, post } from '@/lib/api';
import { supported } from '@/lib/e2ee';
import type { Session } from '@/lib/types';
import { useAuth, useCouple, usePartner } from '@/store/auth';
import { useE2EE } from '@/store/e2ee';
import { confirm, toast } from '@/store/ui';
import { Button, Input, Sheet } from '@/components/ui';

/** Enter the shared passphrase on this device. */
export function UnlockSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const couple = useCouple();
  const unlock = useE2EE((s) => s.unlock);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError('');
    try {
      const matched = await unlock(passphrase, couple);
      if (!matched) setError("That passphrase doesn't match. Check with your partner, it's case-sensitive.");
      else {
        toast.success('Unlocked on this device', '🔓');
        setPassphrase('');
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Unlock encrypted chat" variant="center">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">Enter the secret passphrase you and your partner agreed on. It stays on this device and is never sent anywhere.</p>
        <Input label="Passphrase" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} error={error} data-autofocus />
        <Button type="submit" block size="lg" loading={busy} disabled={!passphrase}>
          {busy ? 'Checking…' : 'Unlock'}
        </Button>
        {couple.e2ee.keys.length > 1 && <p className="text-xs text-muted">If you changed the passphrase before, enter an older one too to read older messages.</p>}
      </form>
    </Sheet>
  );
}

/** Turn encryption on, or change the passphrase (which creates a new key). */
export function SetupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const couple = useCouple();
  const partner = usePartner();
  const setSession = useAuth((s) => s.setSession);
  const setup = useE2EE((s) => s.setup);
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const changing = couple.e2ee.keys.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (passphrase.length < 10) return setError('Use at least 10 characters. A short sentence works well.');
    if (passphrase !== repeat) return setError("The two passphrases don't match");
    setBusy(true);
    setError('');
    try {
      setSession(await setup(passphrase));
      toast.success(changing ? 'Passphrase changed' : 'Encrypted chat is on', '🔒');
      setPassphrase('');
      setRepeat('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={changing ? 'Change passphrase' : 'Turn on encrypted chat'}>
      {!supported() ? (
        <p className="text-muted">
          {window.isSecureContext
            ? "This browser can't do end-to-end encryption. Try a current version of Safari, Chrome, Edge or Firefox."
            : 'Encryption only works over a secure connection. Open the app from its https:// address (or http://localhost while developing).'}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="space-y-1.5 text-muted">
              <p>New messages, photos and voice notes will be locked with a passphrase only the two of you know. Not even the server can read them.</p>
              <p>
                <strong className="text-ink">Agree on it in person{partner ? ` with ${partner.name}` : ''}</strong>, not in this chat. If you both forget it, encrypted messages can't be recovered.
              </p>
              <p>Search and notification previews work on your devices only, and reactions and times stay visible to the server.</p>
            </div>
          </div>
          <Input label="Secret passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} hint="At least 10 characters" />
          <Input label="Type it again" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} error={error} />
          <Button type="submit" block size="lg" loading={busy} icon={<Lock className="size-4" />}>
            {busy ? 'Creating your key…' : changing ? 'Change passphrase' : 'Turn on encryption'}
          </Button>
          {changing && <p className="text-xs text-muted">Older messages stay readable on devices that already have the old passphrase.</p>}
        </form>
      )}
    </Sheet>
  );
}

export async function turnOffEncryption() {
  const ok = await confirm({
    title: 'Turn off encrypted chat?',
    body: 'New messages will no longer be end-to-end encrypted. Messages already sent stay encrypted and readable on devices with the passphrase.',
    confirmLabel: 'Turn off',
    danger: true,
  });
  if (!ok) return;
  try {
    useAuth.getState().setSession(await post<Session>('/couple/e2ee/enabled', { enabled: false }));
  } catch (err) {
    toast.error(errorMessage(err));
  }
}
