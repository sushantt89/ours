import type { Request } from 'express';
import type { Model } from 'mongoose';
import { notFound } from './http';
import { objectId } from './validation';

/**
 * Loads a document by id **within the caller's couple**. A record that belongs to a
 * different couple is indistinguishable from one that doesn't exist.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function owned<M extends Model<any>>(model: M, req: Request, what = 'That', param = 'id'): Promise<ReturnType<M['hydrate']>> {
  const id = objectId.safeParse(req.params[param]);
  if (!id.success) throw notFound(what);
  const doc = await model.findOne({ _id: id.data, coupleId: req.couple._id } as never);
  if (!doc) throw notFound(what);
  return doc as ReturnType<M['hydrate']>;
}
