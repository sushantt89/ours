import type { AnyId } from '../models';
import type { Request } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env';
import { Media, Integration, type MediaDoc, type CoupleDoc } from '../models';
import { badRequest } from '../utils/http';
import * as gridfs from './storage/gridfs';
import * as drive from './storage/drive';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 12 },
});

type Kind = 'image' | 'video' | 'audio' | 'file' | 'encrypted';
type Purpose = NonNullable<MediaDoc['purpose']>;

/** Types we accept, decided from the file's real bytes rather than its name or declared type. */
const ALLOWED: Record<string, Kind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'image/avif': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'audio/webm': 'audio',
  'audio/ogg': 'audio',
  'audio/opus': 'audio',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  'audio/aac': 'audio',
  'audio/wav': 'audio',
  'application/pdf': 'file',
  'application/zip': 'file',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'file',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'file',
  'text/plain': 'file',
};

const TEXT_EXT = /\.(txt|md|csv)$/i;

async function detect(file: Express.Multer.File, wanted: Kind[]): Promise<{ mime: string; kind: Kind }> {
  const sniffed = await fileTypeFromBuffer(file.buffer);
  let mime = sniffed?.mime as string | undefined;
  // WebM/MP4/Ogg containers hold either audio or video; trust the declared family for those.
  if (mime === 'video/webm' && file.mimetype.startsWith('audio/')) mime = 'audio/webm';
  if (mime === 'video/mp4' && file.mimetype.startsWith('audio/')) mime = 'audio/mp4';
  if (mime === 'video/ogg' && file.mimetype.startsWith('audio/')) mime = 'audio/ogg';
  if (!mime && TEXT_EXT.test(file.originalname) && !file.buffer.subarray(0, 4096).includes(0)) mime = 'text/plain';
  const kind = mime ? ALLOWED[mime] : undefined;
  if (!mime || !kind || !wanted.includes(kind)) {
    throw badRequest("That file type isn't supported here", 'unsupported_type');
  }
  return { mime, kind };
}

const safeName = (name: string) =>
  name
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, 120) || 'file';

/** Type-checks an upload from its real bytes and returns a safe name for it. */
export async function inspectUpload(file: Express.Multer.File, kinds: Kind[]) {
  return { ...(await detect(file, kinds)), name: safeName(file.originalname) };
}

const DRIVE_FOLDER_FOR: Partial<Record<Purpose, drive.DriveFolder>> = {
  memory: 'Memories',
  file: 'Shared Files',
};

interface SaveOptions {
  purpose: Purpose;
  kinds: Kind[];
  couple?: CoupleDoc | null;
  /** Optional client-captured poster frame for a video. */
  poster?: Express.Multer.File;
  duration?: number;
  /**
   * End-to-end encrypted bytes. The server can't inspect them, so they're stored as an
   * opaque blob, never shown inline and never thumbnailed.
   */
  opaque?: boolean;
}

/** Validates an upload, generates a thumbnail, and stores it in Drive or app storage. */
export async function saveUpload(req: Request, file: Express.Multer.File, opts: SaveOptions): Promise<MediaDoc> {
  const { mime, kind } = opts.opaque ? { mime: 'application/octet-stream', kind: 'encrypted' as const } : await detect(file, opts.kinds);
  const name = safeName(file.originalname);

  let width: number | undefined;
  let height: number | undefined;
  let thumb: Buffer | undefined;
  const thumbSource = kind === 'image' ? file.buffer : opts.poster?.buffer;
  if (thumbSource) {
    try {
      const image = sharp(thumbSource, { failOn: 'none', animated: false }).rotate();
      const meta = await image.metadata();
      const swap = (meta.orientation ?? 1) >= 5;
      width = swap ? meta.height : meta.width;
      height = swap ? meta.width : meta.height;
      thumb = await image.resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    } catch {
      if (kind === 'image') throw badRequest('That image could not be read. It may be damaged.', 'bad_image');
    }
  }

  // Profile photos and covers always live in app storage so they survive a Drive disconnect.
  const wantsDrive = opts.couple?.storage === 'drive' && !['avatar', 'cover', 'countdown'].includes(opts.purpose);
  let storage: 'app' | 'drive' = 'app';
  let key: string | undefined;

  if (wantsDrive && opts.couple) {
    try {
      const { token } = await drive.accessTokenFor(opts.couple._id);
      const integration = await Integration.findOne({ coupleId: opts.couple._id, provider: 'google_drive' });
      const folderName =
        DRIVE_FOLDER_FOR[opts.purpose] ?? (kind === 'image' ? 'Photos' : kind === 'video' ? 'Videos' : 'Documents');
      const parent = integration?.folders?.get(folderName) ?? integration?.rootFolderId;
      if (parent) {
        key = (await drive.uploadFile(token, parent, name, mime, file.buffer)).id;
        storage = 'drive';
      }
    } catch (err) {
      // Drive unavailable: keep the upload rather than lose it. The UI shows where each file lives.
      if (!env.isTest) console.warn('[media] Drive upload failed, using app storage', (err as Error).message);
    }
  }
  if (!key) key = await gridfs.putFile(file.buffer, name, mime);
  const thumbKey = thumb ? await gridfs.putFile(thumb, `${name}.thumb.webp`, 'image/webp') : undefined;

  return Media.create({
    coupleId: opts.couple?._id,
    ownerId: req.user._id,
    storage,
    key,
    thumbKey,
    name,
    mime,
    size: file.size,
    kind,
    purpose: opts.purpose,
    width,
    height,
    duration: opts.duration && Number.isFinite(opts.duration) ? opts.duration : undefined,
  });
}

export async function deleteMedia(media: MediaDoc | null) {
  if (!media) return;
  if (media.thumbKey) await gridfs.deleteFile(media.thumbKey);
  if (media.storage === 'drive' && media.coupleId) {
    try {
      const { token } = await drive.accessTokenFor(media.coupleId);
      await drive.deleteDriveFile(token, media.key);
    } catch {
      /* Drive disconnected: the file stays in the person's own Drive */
    }
  } else {
    await gridfs.deleteFile(media.key);
  }
  await media.deleteOne();
}

export async function deleteMediaByIds(coupleId: AnyId, ids: AnyId[]) {
  if (!ids.length) return;
  const docs = await Media.find({ _id: { $in: ids }, coupleId });
  for (const doc of docs) await deleteMedia(doc);
}

/** Public shape of a media record. The URL is only usable by the couple's two members. */
export function mediaJSON(media: MediaDoc | null | undefined) {
  if (!media) return null;
  const id = String(media._id);
  return {
    id,
    kind: media.kind,
    mime: media.mime,
    name: media.name,
    size: media.size,
    width: media.width,
    height: media.height,
    duration: media.duration,
    storage: media.storage,
    url: `/api/media/${id}`,
    thumbUrl: media.thumbKey ? `/api/media/${id}?thumb=1` : null,
  };
}

/** Confirms the given media ids were uploaded into this couple's space. */
export async function assertOwnMedia(coupleId: AnyId, ids: (string | undefined | null)[]) {
  const wanted = ids.filter(Boolean) as string[];
  if (!wanted.length) return;
  const count = await Media.countDocuments({ _id: { $in: wanted }, coupleId });
  if (count !== new Set(wanted).size) throw badRequest('One of the attachments could not be found');
}
