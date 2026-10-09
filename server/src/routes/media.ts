import { Router, type Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { Media, User, Couple, type MediaDoc, type UserDoc } from '../models';
import { requireMediaAuth } from '../middleware/auth';
import * as gridfs from '../services/storage/gridfs';
import * as drive from '../services/storage/drive';
import { notFound } from '../utils/http';
import * as v from '../utils/validation';

const router = Router();

/**
 * A person may load a file only when it belongs to their couple, they uploaded it
 * themselves, or it is their partner's profile photo. Anything else looks like a 404.
 */
async function canView(user: UserDoc, media: MediaDoc) {
  if (media.ownerId.equals(user._id) && !media.coupleId) return true;
  if (media.coupleId) return Boolean(user.coupleId && media.coupleId.equals(user.coupleId));
  if (media.purpose === 'avatar' && user.coupleId) {
    const couple = await Couple.findById(user.coupleId).select('members');
    const isPartner = couple?.members.some((m) => m.equals(media.ownerId));
    const stillTheirs = isPartner && (await User.exists({ _id: media.ownerId, avatarId: media._id }));
    return Boolean(stillTheirs);
  }
  return false;
}

function parseRange(header: string | undefined, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : size - Number(match[2]);
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  return start <= end ? { start, end } : null;
}

function secureHeaders(res: Response, mime: string, name: string, download: boolean, inlineSafe: boolean) {
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  const disposition = download || !inlineSafe ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
}

router.get('/:id', requireMediaAuth, async (req, res) => {
  const media = await Media.findById(v.objectId.parse(req.params.id));
  if (!media || !(await canView(req.user, media))) throw notFound('That file');

  const wantsThumb = req.query.thumb === '1' && media.thumbKey;
  const download = req.query.download === '1';
  const inlineSafe = media.kind !== 'file';

  const done = (err: unknown) => {
    // The viewer closing a video mid-stream is normal, not an error.
    if (err && !res.headersSent) throw err;
  };

  if (wantsThumb) {
    secureHeaders(res, 'image/webp', `${media.name}.webp`, false, true);
    return pipeline(gridfs.openFile(media.thumbKey!), res).catch(done);
  }

  secureHeaders(res, media.mime, media.name, download, inlineSafe);
  res.setHeader('Accept-Ranges', 'bytes');

  if (media.storage === 'drive') {
    const { token } = await drive.accessTokenFor(media.coupleId!);
    const file = await drive.downloadFile(token, media.key, req.headers.range);
    res.status(file.status === 206 ? 206 : 200);
    if (file.contentRange) res.setHeader('Content-Range', file.contentRange);
    if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
    return pipeline(file.stream, res).catch(done);
  }

  const range = parseRange(req.headers.range, media.size);
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${media.size}`);
    res.setHeader('Content-Length', range.end - range.start + 1);
    return pipeline(gridfs.openFile(media.key, range), res).catch(done);
  }
  res.setHeader('Content-Length', media.size);
  return pipeline(gridfs.openFile(media.key), res).catch(done);
});

export default router;
