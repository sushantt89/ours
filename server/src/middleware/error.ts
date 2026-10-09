import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http';
import { env } from '../config/env';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Not found', code: 'not_found' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  const send = (status: number, message: string, code?: string, fields?: Record<string, string>) =>
    res.status(status).json({ error: { message, code, fields } });

  if (err instanceof HttpError) return send(err.status, err.message, err.code);

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    return send(400, `${where}${first?.message ?? 'Invalid input'}`, 'validation', fields);
  }

  if (err instanceof mongoose.Error.CastError) return send(404, 'That could not be found', 'not_found');
  if (err instanceof mongoose.Error.ValidationError) return send(400, err.message, 'validation');

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? `That file is too large (max ${env.MAX_UPLOAD_MB} MB)` : 'Upload failed';
    return send(413, message, 'upload');
  }

  if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.too.large') {
    return send(413, 'Request is too large', 'too_large');
  }

  if (!env.isTest) console.error('[error]', err);
  send(500, 'Something went wrong on our side. Please try again.', 'server_error');
}
