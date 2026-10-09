import mongoose from 'mongoose';
import { Readable } from 'node:stream';

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database is not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'media' });
}

export async function putFile(buffer: Buffer, name: string, mime: string): Promise<string> {
  const upload = bucket().openUploadStream(name, { metadata: { mime } });
  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer).pipe(upload).on('finish', resolve).on('error', reject);
  });
  return String(upload.id);
}

export function openFile(key: string, range?: { start: number; end: number }): Readable {
  const id = new mongoose.Types.ObjectId(key);
  // GridFS `end` is exclusive.
  return bucket().openDownloadStream(id, range ? { start: range.start, end: range.end + 1 } : undefined);
}

export async function deleteFile(key: string) {
  try {
    await bucket().delete(new mongoose.Types.ObjectId(key));
  } catch {
    /* already gone */
  }
}
