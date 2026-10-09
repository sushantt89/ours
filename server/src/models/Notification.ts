import { Schema, model } from 'mongoose';
import { ObjectId, userRef } from './base';

const notificationSchema = new Schema(
  {
    coupleId: { type: ObjectId, ref: 'Couple', index: true },
    userId: { ...userRef, index: true },
    type: {
      type: String,
      enum: ['message', 'nudge', 'note', 'memory', 'calendar', 'milestone', 'list', 'countdown', 'reminder', 'question', 'partner', 'song', 'game', 'journal', 'call', 'recap'],
      required: true,
    },
    emoji: { type: String, default: '❤️' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    url: { type: String, default: '/' },
    readAt: Date,
    dedupeKey: String,
    createdAt: { type: Date, default: Date.now, index: { expires: '120d' } },
  },
  { timestamps: false },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
// Guarantees a scheduled reminder is only ever delivered once per person.
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
export const Notification = model('Notification', notificationSchema);

const pushSubscriptionSchema = new Schema(
  {
    userId: { ...userRef, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: String,
  },
  { timestamps: true },
);
export const PushSubscription = model('PushSubscription', pushSubscriptionSchema);

const integrationSchema = new Schema(
  {
    coupleId: { type: ObjectId, ref: 'Couple', required: true },
    userId: userRef,
    provider: { type: String, enum: ['google_drive'], required: true },
    accountEmail: String,
    refreshTokenEnc: { type: String, required: true, select: false },
    rootFolderId: String,
    folders: { type: Map, of: String, default: {} },
  },
  { timestamps: true },
);
integrationSchema.index({ coupleId: 1, provider: 1 }, { unique: true });
export const Integration = model('Integration', integrationSchema);
