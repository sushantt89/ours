import { Schema, model } from 'mongoose';
import { userRef } from './base';

/** A refresh-token session. Only a hash of the token is stored. */
const sessionSchema = new Schema(
  {
    userId: { ...userRef, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: String,
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const Session = model('Session', sessionSchema);
