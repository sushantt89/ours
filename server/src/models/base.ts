import mongoose, { Schema } from 'mongoose';

export const ObjectId = Schema.Types.ObjectId;
export type Id = mongoose.Types.ObjectId;

/** Shared JSON shape: `id` instead of `_id`, no version key. */
mongoose.plugin((schema: Schema) => {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      delete ret._id;
      return ret;
    },
  });
});

/** Every couple-owned collection carries an indexed coupleId. */
export const coupleRef = { type: ObjectId, ref: 'Couple', required: true, index: true } as const;
export const userRef = { type: ObjectId, ref: 'User', required: true } as const;

export const reactionSchema = new Schema(
  { userId: { type: ObjectId, required: true }, emoji: { type: String, required: true, maxlength: 16 } },
  { _id: false },
);

/** An id as it arrives from a document or a validated request. */
export type AnyId = mongoose.Types.ObjectId | string;
