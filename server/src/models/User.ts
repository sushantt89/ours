import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId } from './base';

export const NOTIFICATION_TYPES = [
  'messages',
  'nudges',
  'notes',
  'memories',
  'calendar',
  'anniversaries',
  'lists',
  'reminders',
  'questions',
  'songs',
  'games',
  'journal',
  'calls',
] as const;

export const LOVE_LANGUAGES = ['words', 'time', 'gifts', 'service', 'touch'] as const;
export type NotificationCategory = (typeof NOTIFICATION_TYPES)[number];

const prefs = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { type: Boolean, default: true }]));

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, index: { unique: true, sparse: true } },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    avatarId: { type: ObjectId, ref: 'Media' },
    birthday: String,
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, select: false },
    verifyTokenExpires: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    coupleId: { type: ObjectId, ref: 'Couple', index: true },
    lastSeenAt: Date,
    timezone: { type: String, default: 'UTC' },
    loveLanguages: { type: [{ type: String, enum: LOVE_LANGUAGES }], default: [] },
    status: { emoji: String, text: String, at: Date },
    seenMemoriesAt: { type: Date, default: () => new Date() },
    privacy: {
      showOnline: { type: Boolean, default: true },
      showLastSeen: { type: Boolean, default: true },
      readReceipts: { type: Boolean, default: true },
      shareMood: { type: Boolean, default: true },
      memoryDefault: { type: String, enum: ['shared', 'private'], default: 'shared' },
    },
    notificationPrefs: {
      push: { type: Boolean, default: true },
      ...prefs,
      quietHours: {
        enabled: { type: Boolean, default: false },
        start: { type: Number, default: 22, min: 0, max: 23 },
        end: { type: Number, default: 7, min: 0, max: 23 },
      },
    },
    dashboard: {
      order: { type: [String], default: [] },
      hidden: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
