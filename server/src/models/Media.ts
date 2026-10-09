import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId, userRef } from './base';

const mediaSchema = new Schema(
  {
    // Null only for a profile photo uploaded before the user has joined a couple.
    coupleId: { type: ObjectId, ref: 'Couple', index: true },
    ownerId: { ...userRef, index: true },
    storage: { type: String, enum: ['app', 'drive'], required: true },
    key: { type: String, required: true },
    thumbKey: String,
    name: { type: String, default: 'file' },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['image', 'video', 'audio', 'file', 'encrypted'], required: true },
    purpose: {
      type: String,
      enum: ['chat', 'memory', 'note', 'avatar', 'cover', 'file', 'bucket', 'date', 'countdown', 'journal', 'gift'],
      required: true,
    },
    width: Number,
    height: Number,
    duration: Number,
  },
  { timestamps: true },
);

export type MediaDoc = HydratedDocument<InferSchemaType<typeof mediaSchema>>;
export const Media = model('Media', mediaSchema);
