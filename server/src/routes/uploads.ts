import { Router } from 'express';
import { z } from 'zod';
import { uploadLimiter } from '../middleware/rateLimit';
import { upload, saveUpload, mediaJSON } from '../services/media';
import { badRequest } from '../utils/http';

/** Photo upload for notes, bucket list items, countdowns, journal pages and gifts. */
const router = Router();

router.post('/', uploadLimiter, upload.single('file'), async (req, res) => {
  const { purpose } = z.object({ purpose: z.enum(['note', 'bucket', 'countdown', 'journal', 'gift']) }).parse(req.query);
  if (!req.file) throw badRequest('Choose a photo to upload');
  const media = await saveUpload(req, req.file, { purpose, kinds: ['image'], couple: req.couple });
  res.status(201).json({ media: mediaJSON(media) });
});

export default router;
