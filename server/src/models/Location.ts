import { Schema, model } from 'mongoose';
import { coupleRef, userRef } from './base';

/**
 * "Locate my partner": one row per person who is sharing (or has asked to see their partner).
 * Only the latest position is kept, never a history. Turning sharing off deletes the
 * coordinates, and sharing with an end time switches itself off when it passes.
 */
const locationSchema = new Schema(
  {
    coupleId: coupleRef,
    userId: { ...userRef, unique: true },
    sharing: { type: Boolean, default: false },
    /** When sharing stops on its own. Null means "until I turn it off". */
    until: { type: Date, default: null },
    lat: Number,
    lng: Number,
    accuracy: Number, // metres
    at: Date, // when this position was taken
    /** Last time this person asked their partner to share, for the cooldown. */
    requestedAt: Date,
  },
  { timestamps: true },
);
locationSchema.index({ coupleId: 1 });

export const Location = model('Location', locationSchema);
