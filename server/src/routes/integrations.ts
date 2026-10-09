import { Router, type Request } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { env } from '../config/env';
import { Integration, Couple, User, Media } from '../models';
import { requireAuth, requireCouple, requireMediaAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimit';
import { upload, saveUpload, inspectUpload, mediaJSON, deleteMedia } from '../services/media';
import { disconnectDrive } from '../services/couple';
import { sync } from '../services/realtime';
import { sign, verify } from '../services/tokens';
import * as drive from '../services/storage/drive';
import { encrypt } from '../utils/crypto';
import { owned } from '../utils/owned';
import { badRequest, forbidden, notFound } from '../utils/http';

/* ── Connection management ──────────────────────────────────────────── */

export const integrations = Router();

/**
 * OAuth callback. Google redirects the browser here, so there is no bearer token; the
 * signed `state` value (issued to a signed-in user ten minutes earlier) identifies them.
 */
integrations.get('/google-drive/callback', async (req, res) => {
  const back = (status: string) => res.redirect(`${env.CLIENT_URL}/files?drive=${status}`);
  const userId = typeof req.query.state === 'string' ? verify(req.query.state, 'drive_state') : null;
  if (!userId || typeof req.query.code !== 'string') return back(req.query.error ? 'cancelled' : 'failed');

  try {
    const user = await User.findById(userId);
    const couple = user?.coupleId ? await Couple.findById(user.coupleId) : null;
    if (!user || !couple || !couple.members.some((m) => m.equals(user._id))) return back('failed');

    const { refreshToken, accessToken, email } = await drive.exchangeCode(req.query.code);
    const existing = await Integration.findOne({ coupleId: couple._id, provider: 'google_drive' });
    // Reconnecting the same Google account keeps using the existing folders.
    const tree =
      existing?.rootFolderId && existing.accountEmail === email
        ? { rootFolderId: existing.rootFolderId, folders: Object.fromEntries(existing.folders ?? []) }
        : await drive.createFolderTree(accessToken, couple.name);
    if (existing) drive.forgetClient(String(existing._id));

    await Integration.findOneAndUpdate(
      { coupleId: couple._id, provider: 'google_drive' },
      { userId: user._id, accountEmail: email, refreshTokenEnc: encrypt(refreshToken), ...tree },
      { upsert: true },
    );
    couple.storage = 'drive';
    await couple.save();
    sync(couple._id, 'session', 'integrations', 'files');
    back('connected');
  } catch (err) {
    if (!env.isTest) console.warn('[drive] connect failed', (err as Error).message);
    back('failed');
  }
});

integrations.use(requireAuth, requireCouple);

integrations.get('/', async (req, res) => {
  const integration = await Integration.findOne({ coupleId: req.couple._id, provider: 'google_drive' });
  const owner = integration ? await User.findById(integration.userId).select('name') : null;
  res.json({
    googleDrive: {
      available: env.driveEnabled,
      connected: Boolean(integration),
      accountEmail: integration?.userId.equals(req.user._id) ? integration.accountEmail : null,
      ownerId: integration ? String(integration.userId) : null,
      ownerName: owner?.name ?? null,
      storage: req.couple.storage,
      connectedAt: integration?.get('createdAt') ?? null,
    },
  });
});

integrations.post('/google-drive/connect', async (req, res) => {
  if (!env.driveEnabled) throw badRequest('Google Drive is not configured on this server', 'drive_disabled');
  res.json({ url: drive.authUrl(sign(String(req.user._id), 'drive_state', '10m')) });
});

/** Choose where new uploads go while Drive stays connected. */
integrations.post('/google-drive/storage', async (req, res) => {
  const { storage } = z.object({ storage: z.enum(['app', 'drive']) }).parse(req.body);
  if (storage === 'drive' && !(await Integration.exists({ coupleId: req.couple._id, provider: 'google_drive' }))) {
    throw badRequest('Connect Google Drive first');
  }
  req.couple.storage = storage;
  await req.couple.save();
  sync(req.couple._id, 'session', 'integrations');
  res.json({ ok: true });
});

integrations.delete('/google-drive', async (req, res) => {
  const integration = await Integration.findOne({ coupleId: req.couple._id, provider: 'google_drive' });
  if (!integration) throw notFound('That connection');
  if (!integration.userId.equals(req.user._id)) throw forbidden('Only the person who connected Google Drive can disconnect it');
  await disconnectDrive(req.couple._id);
  sync(req.couple._id, 'session', 'integrations', 'files');
  res.json({ ok: true });
});

/* ── Shared files ───────────────────────────────────────────────────── */

export const files = Router();

async function driveContext(req: Request) {
  const integration = await Integration.findOne({ coupleId: req.couple._id, provider: 'google_drive' });
  if (!integration?.rootFolderId) return null;
  const { token } = await drive.accessTokenFor(req.couple._id);
  return { token, root: integration.rootFolderId };
}

/** Confirms a Drive item sits inside this couple's own folder tree before touching it. */
async function assertInTree(token: string, root: string, id: string) {
  let current = id;
  for (let depth = 0; depth < 8; depth++) {
    if (current === root) return;
    const file = await drive.getFile(token, current).catch(() => null);
    const parent = file?.parents?.[0];
    if (!parent) break;
    current = parent;
  }
  throw notFound('That file');
}

const driveId = z.string().regex(/^[A-Za-z0-9_-]{10,100}$/);

files.get('/', requireAuth, requireCouple, async (req, res) => {
  const { folder } = z.object({ folder: driveId.optional() }).parse(req.query);
  const ctx = await driveContext(req);
  if (!ctx) {
    const media = await Media.find({ coupleId: req.couple._id, purpose: 'file' }).sort({ createdAt: -1 });
    return res.json({
      source: 'app',
      files: media.map((m) => ({ ...mediaJSON(m), isFolder: false, modifiedAt: m.get('createdAt'), downloadUrl: `/api/media/${m._id}?download=1` })),
    });
  }
  const folderId = folder ?? ctx.root;
  if (folderId !== ctx.root) await assertInTree(ctx.token, ctx.root, folderId);
  const items = await drive.listFolder(ctx.token, folderId);
  res.json({
    source: 'drive',
    folderId,
    isRoot: folderId === ctx.root,
    files: items.map((f) => ({
      id: f.id,
      name: f.name,
      mime: f.mimeType,
      size: f.size ? Number(f.size) : null,
      isFolder: f.mimeType === drive.FOLDER_MIME,
      modifiedAt: f.modifiedTime ?? null,
      storage: 'drive',
      downloadUrl: f.mimeType === drive.FOLDER_MIME ? null : `/api/files/drive/${f.id}/download`,
    })),
  });
});

files.post('/', requireAuth, requireCouple, uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to upload');
  const { folder } = z.object({ folder: driveId.optional() }).parse(req.body);
  const ctx = await driveContext(req);
  if (ctx) {
    const parent = folder ?? ctx.root;
    if (parent !== ctx.root) await assertInTree(ctx.token, ctx.root, parent);
    // Same type checks as app storage, then the bytes go straight to Drive.
    const info = await inspectUpload(req.file, ['image', 'video', 'audio', 'file']);
    await drive.uploadFile(ctx.token, parent, info.name, info.mime, req.file.buffer);
  } else {
    await saveUpload(req, req.file, { purpose: 'file', kinds: ['image', 'video', 'audio', 'file'], couple: req.couple });
  }
  sync(req.couple._id, 'files');
  res.status(201).json({ ok: true });
});

files.post('/folders', requireAuth, requireCouple, async (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(80).regex(/^[^\\/]+$/, 'Folder names cannot contain slashes'), parent: driveId.optional() })
    .parse(req.body);
  const ctx = await driveContext(req);
  if (!ctx) throw badRequest('Connect Google Drive to create folders', 'drive_not_connected');
  const parent = body.parent ?? ctx.root;
  if (parent !== ctx.root) await assertInTree(ctx.token, ctx.root, parent);
  await drive.createFolder(ctx.token, body.name, parent);
  sync(req.couple._id, 'files');
  res.status(201).json({ ok: true });
});

files.get('/drive/:fileId/download', requireMediaAuth, requireCouple, async (req, res) => {
  const fileId = driveId.parse(req.params.fileId);
  const ctx = await driveContext(req);
  if (!ctx) throw notFound('That file');
  await assertInTree(ctx.token, ctx.root, fileId);
  const meta = await drive.getFile(ctx.token, fileId);
  const file = await drive.downloadFile(ctx.token, fileId);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
  if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
  await pipeline(file.stream, res).catch(() => undefined);
});

files.delete('/drive/:fileId', requireAuth, requireCouple, async (req, res) => {
  const fileId = driveId.parse(req.params.fileId);
  const ctx = await driveContext(req);
  if (!ctx) throw notFound('That file');
  if (fileId === ctx.root) throw badRequest("The couple folder itself can't be deleted here");
  await assertInTree(ctx.token, ctx.root, fileId);
  await drive.deleteDriveFile(ctx.token, fileId);
  sync(req.couple._id, 'files');
  res.json({ ok: true });
});

files.delete('/app/:id', requireAuth, requireCouple, async (req, res) => {
  const media = await owned(Media, req, 'That file');
  if (media.purpose !== 'file') throw notFound('That file');
  await deleteMedia(media);
  sync(req.couple._id, 'files');
  res.json({ ok: true });
});
