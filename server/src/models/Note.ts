import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId, coupleRef, userRef } from './base';

/**
 * Love notes, "open when…" letters, surprises and shared/private notes.
 *  - audience 'partner': written by one partner for the other
 *  - audience 'shared':  a note both partners can read and edit
 *  - audience 'private': visible only to its author
 */
const noteSchema = new Schema(
  {
    coupleId: coupleRef,
    authorId: userRef,
    audience: { type: String, enum: ['partner', 'shared', 'private'], default: 'partner' },
    kind: { type: String, enum: ['note', 'open_when', 'surprise', 'daily'], default: 'note' },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    body: { type: String, maxlength: 10000, default: '' },
    emoji: { type: String, maxlength: 16, default: '💌' },
    color: { type: String, default: 'rose' },
    mediaIds: [{ type: ObjectId, ref: 'Media' }],
    deliverAt: Date, // scheduled: hidden from the partner until then
    unlockAt: Date, // visible as a sealed envelope until then
    deliveredAt: Date,
    dayKey: String, // for kind 'daily'
    readAt: Date,
    pinnedBy: [{ type: ObjectId, ref: 'User' }],
    archivedBy: [{ type: ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

noteSchema.index({ coupleId: 1, createdAt: -1 });
noteSchema.index({ deliveredAt: 1, deliverAt: 1 });

export type NoteDoc = HydratedDocument<InferSchemaType<typeof noteSchema>>;
export const Note = model('Note', noteSchema);
