import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { del, errorMessage, get, post } from '@/lib/api';
import { useAuth, useMe } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, Segmented, Skeleton } from '@/components/ui';

export interface DriveStatus {
  available: boolean;
  connected: boolean;
  accountEmail: string | null;
  ownerId: string | null;
  ownerName: string | null;
  storage: 'app' | 'drive';
  connectedAt: string | null;
}

export const useDrive = () => useQuery({ queryKey: ['integrations'], queryFn: () => get<{ googleDrive: DriveStatus }>('/integrations').then((r) => r.googleDrive) });

/** Connect, configure or disconnect Google Drive. Used on the Files page and in Settings. */
export function DriveCard() {
  const me = useMe();
  const queryClient = useQueryClient();
  const { data: drive, isLoading } = useDrive();
  const [busy, setBusy] = useState(false);

  if (isLoading || !drive) return <Skeleton className="h-36 rounded-card" />;

  async function connect() {
    setBusy(true);
    try {
      const { url } = await post<{ url: string }>('/integrations/google-drive/connect');
      window.location.assign(url); // Google's consent screen; we come back to /files
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect Google Drive?',
      body: 'Files already in Drive stay in your Drive, but photos stored there will stop showing in the app until you reconnect the same account. New uploads will go to app storage.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    try {
      await del('/integrations/google-drive');
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['integrations'] }), queryClient.invalidateQueries({ queryKey: ['files'] }), useAuth.getState().reload()]);
      toast.success('Google Drive disconnected');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function setStorage(storage: 'app' | 'drive') {
    try {
      await post('/integrations/google-drive/storage', { storage });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['integrations'] }), useAuth.getState().reload()]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const mine = drive.ownerId === me.id;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden>
          ☁️
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Google Drive</p>
          {drive.connected ? (
            <p className="text-sm text-muted">
              Connected {mine ? `as ${drive.accountEmail ?? 'your account'}` : `through ${drive.ownerName}'s account`}
            </p>
          ) : drive.available ? (
            <p className="text-sm text-muted">Keep your photos, videos and files in a folder in your own Drive.</p>
          ) : (
            <p className="text-sm text-muted">Not set up on this server yet. Add Google credentials to the server's environment to switch it on.</p>
          )}
        </div>
      </div>

      {drive.connected ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium">Save new photos and videos to</p>
            <Segmented
              label="Where new uploads are stored"
              className="w-full"
              value={drive.storage}
              onChange={setStorage}
              options={[
                { value: 'drive', label: '☁️ Google Drive' },
                { value: 'app', label: '☁️ App storage' },
              ]}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted">
            The app can only see the "Couple App" folder it created. It has no access to anything else in {mine ? 'your' : `${drive.ownerName}'s`} Drive.
          </p>
          {mine ? (
            <Button variant="outline" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          ) : (
            <p className="text-xs text-muted">Only {drive.ownerName} can disconnect it.</p>
          )}
        </div>
      ) : (
        drive.available && (
          <div className="mt-4">
            <Button loading={busy} onClick={connect}>
              Connect Google Drive
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              You'll be asked for permission to manage only the files this app creates. Your other Drive files stay private, and you can disconnect at any time.
            </p>
          </div>
        )
      )}
    </Card>
  );
}
