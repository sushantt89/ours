import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Download, File as FileIcon, FileImage, FileText, FileVideo, Folder, FolderPlus, Music, Trash2, Upload } from 'lucide-react';
import { del, errorMessage, get, post, upload } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { formatBytes } from '@/lib/media';
import { useAuth } from '@/store/auth';
import { confirm, toast } from '@/store/ui';
import { Button, Card, EmptyState, ErrorState, IconButton, Input, Sheet, SkeletonList, StorageBadge } from '@/components/ui';
import { Page } from '@/components/layout/AppShell';
import { BackButton } from '@/components/layout/BackButton';
import { DriveCard, useDrive } from './DriveCard';

interface FileRow {
  id: string;
  name: string;
  mime: string;
  size: number | null;
  isFolder: boolean;
  modifiedAt: string | null;
  storage: 'app' | 'drive';
  downloadUrl: string | null;
}
interface Listing {
  source: 'app' | 'drive';
  folderId?: string;
  isRoot?: boolean;
  files: FileRow[];
}

function iconFor(file: FileRow) {
  if (file.isFolder) return <Folder className="size-5 fill-current" />;
  if (file.mime.startsWith('image/')) return <FileImage className="size-5" />;
  if (file.mime.startsWith('video/')) return <FileVideo className="size-5" />;
  if (file.mime.startsWith('audio/')) return <Music className="size-5" />;
  if (file.mime.includes('pdf') || file.mime.includes('text') || file.mime.includes('document')) return <FileText className="size-5" />;
  return <FileIcon className="size-5" />;
}

export default function Files() {
  const queryClient = useQueryClient();
  const maxMb = useAuth((s) => s.config?.maxUploadMb ?? 25);
  const [params, setParams] = useSearchParams();
  const drive = useDrive();
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const folder = path[path.length - 1]?.id;
  const listing = useQuery({ queryKey: ['files', folder ?? 'root'], queryFn: () => get<Listing>(`/files${folder ? `?folder=${folder}` : ''}`) });
  const [uploading, setUploading] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Coming back from Google's consent screen
  useEffect(() => {
    const result = params.get('drive');
    if (!result) return;
    if (result === 'connected') {
      toast.success('Google Drive connected', '☁️');
      void useAuth.getState().reload();
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    } else if (result === 'cancelled') toast.info('Google Drive was not connected');
    else toast.error("Google Drive couldn't be connected. Please try again.");
    setParams({}, { replace: true });
  }, [params, setParams, queryClient]);

  // If Drive is disconnected while browsing a subfolder, go back to the top.
  useEffect(() => {
    if (listing.data?.source === 'app' && path.length) setPath([]);
  }, [listing.data?.source, path.length]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['files'] });
  const isDrive = listing.data?.source === 'drive';

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(`${file.name} is larger than ${maxMb} MB`);
          continue;
        }
        const form = new FormData();
        form.append('file', file);
        if (folder) form.append('folder', folder);
        await upload('/files', form);
        done++;
      }
      if (done) toast.success(done === 1 ? 'File uploaded' : `${done} files uploaded`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
      void refresh();
    }
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault();
    if (!newFolder?.trim()) return;
    setBusy(true);
    try {
      await post('/files/folders', { name: newFolder.trim(), parent: folder });
      setNewFolder(null);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: FileRow) {
    const ok = await confirm({
      title: `Delete "${file.name}"?`,
      body: file.isFolder ? 'The folder and everything inside it will be deleted from Google Drive.' : 'This file will be deleted for both of you.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(file.storage === 'drive' ? `/files/drive/${file.id}` : `/files/app/${file.id}`);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Page
      title="Files"
      subtitle="Documents and anything else you both need"
      back={<BackButton />}
      actions={
        <>
          {isDrive && (
            <IconButton label="New folder" onClick={() => setNewFolder('')}>
              <FolderPlus className="size-5" />
            </IconButton>
          )}
          <Button size="sm" loading={uploading} icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
            Upload
          </Button>
        </>
      }
    >
      <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} />

      {!drive.data?.connected && (
        <div className="mb-5">
          <DriveCard />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button onClick={() => setPath([])} className="rounded-lg px-1.5 py-1 font-semibold hover:bg-surface-2">
          {isDrive ? 'Couple App' : 'All files'}
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRight className="size-4 text-faint" />
            <button onClick={() => setPath(path.slice(0, i + 1))} className="rounded-lg px-1.5 py-1 font-semibold hover:bg-surface-2">
              {p.name}
            </button>
          </span>
        ))}
        <StorageBadge storage={isDrive ? 'drive' : 'app'} className="ml-auto" />
      </div>

      {listing.isLoading ? (
        <SkeletonList rows={4} className="h-16" />
      ) : listing.isError ? (
        <ErrorState message={errorMessage(listing.error)} onRetry={() => listing.refetch()} />
      ) : !listing.data?.files.length ? (
        <EmptyState emoji="📂" title={path.length ? 'This folder is empty' : 'No files yet'} body="Upload tickets, bookings, a lease, a recipe. PDFs, documents, images and video are supported." action={<Button onClick={() => input.current?.click()}>Upload a file</Button>} />
      ) : (
        <Card className="divide-y divide-line/70 overflow-hidden">
          {listing.data.files.map((file) => (
            <div key={file.id} className="flex items-center gap-3 px-4 py-3">
              {file.isFolder ? (
                <button onClick={() => setPath([...path, { id: file.id, name: file.name }])} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{iconFor(file)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{file.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </button>
              ) : (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">{iconFor(file)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="truncate text-xs text-muted">{[formatBytes(file.size), file.modifiedAt && formatDateTime(file.modifiedAt)].filter(Boolean).join(' · ')}</p>
                  </div>
                  {file.downloadUrl && (
                    <a href={file.downloadUrl} download={file.name} aria-label={`Download ${file.name}`} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
                      <Download className="size-[18px]" />
                    </a>
                  )}
                </>
              )}
              <IconButton size="sm" label={`Delete ${file.name}`} className="hover:text-danger" onClick={() => remove(file)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </Card>
      )}

      {drive.data?.connected && (
        <div className="mt-6">
          <DriveCard />
        </div>
      )}

      <Sheet open={newFolder !== null} onClose={() => setNewFolder(null)} title="New folder">
        <form onSubmit={createFolder} className="space-y-4">
          <Input label="Folder name" placeholder="Japan trip" value={newFolder ?? ''} onChange={(e) => setNewFolder(e.target.value)} maxLength={80} data-autofocus />
          <Button type="submit" block size="lg" loading={busy} disabled={!newFolder?.trim()}>
            Create folder
          </Button>
        </form>
      </Sheet>
    </Page>
  );
}
