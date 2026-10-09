import { Schema, model } from 'mongoose';
import { ObjectId, coupleRef, userRef } from './base';

export const EVENT_TYPES = [
  'anniversary',
  'birthday',
  'first_date',
  'first_kiss',
  'holiday',
  'date_night',
  'trip',
  'appointment',
  'event',
  'reminder',
] as const;

const calendarEventSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    title: { type: String, required: true, trim: true, maxlength: 80 },
    emoji: { type: String, maxlength: 16, default: '📅' },
    type: { type: String, enum: EVENT_TYPES, default: 'event' },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: String, // HH:mm, optional
    recurrence: { type: String, enum: ['none', 'weekly', 'monthly', 'yearly'], default: 'none' },
    remindDaysBefore: { type: [Number], default: [0] },
    notes: { type: String, maxlength: 1000, default: '' },
    visibility: { type: String, enum: ['shared', 'personal'], default: 'shared' },
  },
  { timestamps: true },
);
calendarEventSchema.index({ coupleId: 1, date: 1 });
export const CalendarEvent = model('CalendarEvent', calendarEventSchema);

const countdownSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    title: { type: String, required: true, trim: true, maxlength: 60 },
    emoji: { type: String, maxlength: 16, default: '✈️' },
    date: { type: String, required: true },
    background: { type: String, default: 'sunset' },
    mediaId: { type: ObjectId, ref: 'Media' },
  },
  { timestamps: true },
);
export const Countdown = model('Countdown', countdownSchema);

const sharedListSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    name: { type: String, required: true, trim: true, maxlength: 40 },
    emoji: { type: String, maxlength: 16, default: '📝' },
    kind: { type: String, enum: ['shopping', 'todo'], default: 'todo' },
    items: [
      {
        text: { type: String, required: true, trim: true, maxlength: 200 },
        done: { type: Boolean, default: false },
        addedBy: ObjectId,
        doneBy: ObjectId,
        doneAt: Date,
      },
    ],
  },
  { timestamps: true },
);
export const SharedList = model('SharedList', sharedListSchema);

export const BUCKET_CATEGORIES = ['travel', 'adventure', 'food', 'home', 'milestone', 'fun', 'other'] as const;

const bucketListItemSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: BUCKET_CATEGORIES, default: 'other' },
    notes: { type: String, maxlength: 1000, default: '' },
    done: { type: Boolean, default: false },
    completedAt: String, // YYYY-MM-DD
    mediaIds: [{ type: ObjectId, ref: 'Media' }],
  },
  { timestamps: true },
);
export const BucketListItem = model('BucketListItem', bucketListItemSchema);

export const DATE_CATEGORIES = ['home', 'food', 'outdoors', 'adventure', 'culture', 'cosy', 'fancy'] as const;

const dateIdeaSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    title: { type: String, required: true, trim: true, maxlength: 140 },
    emoji: { type: String, maxlength: 16, default: '🍽️' },
    category: { type: String, enum: DATE_CATEGORIES, default: 'home' },
    notes: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['idea', 'done'], default: 'idea' },
    completedAt: String,
    mediaIds: [{ type: ObjectId, ref: 'Media' }],
  },
  { timestamps: true },
);
dateIdeaSchema.index({ coupleId: 1, status: 1 });
export const DateIdea = model('DateIdea', dateIdeaSchema);
