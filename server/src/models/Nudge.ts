import { Schema, model } from 'mongoose';
import { coupleRef, userRef } from './base';

const nudgeSchema = new Schema(
  {
    coupleId: coupleRef,
    fromId: userRef,
    toId: userRef,
    kind: { type: String, enum: ['nudge', 'status'], default: 'nudge' },
    emoji: { type: String, required: true, maxlength: 16 },
    text: { type: String, required: true, maxlength: 60 },
    seenAt: Date,
    deliverAt: Date, // scheduled "good morning" style nudges, timed to the partner's clock
    deliveredAt: Date,
  },
  { timestamps: true },
);
nudgeSchema.index({ coupleId: 1, createdAt: -1 });

export const Nudge = model('Nudge', nudgeSchema);
