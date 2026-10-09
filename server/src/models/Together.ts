import { Schema, model } from 'mongoose';
import { ObjectId, coupleRef, userRef } from './base';

const dailyQuestionSchema = new Schema(
  {
    coupleId: coupleRef,
    date: { type: String, required: true },
    emoji: { type: String, default: '💭' },
    question: { type: String, required: true },
    answers: [
      {
        userId: { type: ObjectId, required: true },
        text: { type: String, required: true, maxlength: 1000 },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
dailyQuestionSchema.index({ coupleId: 1, date: -1 }, { unique: true });
export const DailyQuestion = model('DailyQuestion', dailyQuestionSchema);

const moodSchema = new Schema(
  {
    coupleId: coupleRef,
    userId: userRef,
    emoji: { type: String, required: true, maxlength: 16 },
    label: { type: String, required: true, maxlength: 30 },
    note: { type: String, maxlength: 140, default: '' },
  },
  { timestamps: true },
);
moodSchema.index({ coupleId: 1, userId: 1, createdAt: -1 });
export const Mood = model('Mood', moodSchema);

/** One row per couple per day listing who interacted — powers the love streak. */
const activityDaySchema = new Schema({
  coupleId: coupleRef,
  date: { type: String, required: true },
  users: [ObjectId],
});
activityDaySchema.index({ coupleId: 1, date: -1 }, { unique: true });
export const ActivityDay = model('ActivityDay', activityDaySchema);
