import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId, coupleRef, userRef, reactionSchema } from './base';

const messageSchema = new Schema(
  {
    coupleId: coupleRef,
    senderId: userRef,
    type: { type: String, enum: ['text', 'image', 'video', 'audio', 'gif', 'sticker', 'encrypted', 'call'], default: 'text' },
    /** Ciphertext for end-to-end encrypted messages: everything the reader sees is inside it. */
    cipher: { keyId: String, iv: String, data: { type: String, maxlength: 200_000 } },
    call: { kind: { type: String, enum: ['audio', 'video'] }, status: { type: String, enum: ['completed', 'missed', 'declined'] }, duration: Number },
    text: { type: String, default: '', maxlength: 4000 },
    mediaId: { type: ObjectId, ref: 'Media' },
    gif: { url: String, preview: String, width: Number, height: Number },
    replyTo: { type: ObjectId, ref: 'Message' },
    reactions: [reactionSchema],
    pinned: { type: Boolean, default: false },
    readAt: Date,
    editedAt: Date,
    deletedAt: Date,
    clientId: String,
  },
  { timestamps: true },
);

messageSchema.index({ coupleId: 1, createdAt: -1 });
messageSchema.index({ coupleId: 1, senderId: 1, readAt: 1 });
messageSchema.index({ coupleId: 1, pinned: 1 });

export type MessageDoc = HydratedDocument<InferSchemaType<typeof messageSchema>>;
export const Message = model('Message', messageSchema);
