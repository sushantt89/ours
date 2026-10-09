import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId } from './base';

export const ACCENTS = ['rose', 'peach', 'plum', 'sage', 'ocean', 'gold'] as const;

const coupleSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 60, default: '' },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    members: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: [(v: unknown[]) => v.length <= 2, 'A couple is exactly two people'],
      index: true,
    },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    inviteCode: { type: String, index: { unique: true, sparse: true } },
    status: { type: String, enum: ['pending', 'active', 'ended'], default: 'pending' },
    startDate: String, // YYYY-MM-DD
    avatarId: { type: ObjectId, ref: 'Media' },
    coverId: { type: ObjectId, ref: 'Media' },
    theme: { type: String, enum: ACCENTS, default: 'rose' },
    timezone: { type: String, default: 'UTC' },
    storage: { type: String, enum: ['app', 'drive'], default: 'app' },
    customNudges: [{ emoji: { type: String, maxlength: 16 }, text: { type: String, maxlength: 60 } }],
    lastDateNudgeAt: Date,
    longDistance: { type: Boolean, default: false },
    reunionDate: String, // YYYY-MM-DD: the next time you'll see each other
    /**
     * End-to-end encryption for chat. Only a salt and an encrypted check value are stored;
     * the key is derived on each device from a passphrase the server never sees.
     * Several keys can exist if the passphrase was changed; messages record which one they use.
     */
    e2ee: {
      enabled: { type: Boolean, default: false },
      keys: [
        {
          keyId: { type: String, required: true },
          salt: { type: String, required: true },
          iterations: { type: Number, required: true },
          verifier: { type: String, required: true },
          createdBy: ObjectId,
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
  },
  { timestamps: true },
);

export type CoupleDoc = HydratedDocument<InferSchemaType<typeof coupleSchema>>;
export const Couple = model('Couple', coupleSchema);
