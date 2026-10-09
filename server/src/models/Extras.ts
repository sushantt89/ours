import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId, coupleRef, userRef } from './base';

/* ── Song of the day ─────────────────────────────────────────────────── */

const songSchema = new Schema(
  {
    coupleId: coupleRef,
    userId: userRef,
    date: { type: String, required: true }, // the sharer's day, in the couple's time zone
    url: { type: String, required: true, maxlength: 600 },
    provider: { type: String, enum: ['spotify', 'youtube', 'apple', 'soundcloud', 'link'], required: true },
    embedId: String,
    title: { type: String, maxlength: 200, default: '' },
    artist: { type: String, maxlength: 200, default: '' },
    thumbnail: { type: String, maxlength: 600 },
    note: { type: String, maxlength: 280, default: '' },
    reactions: [{ userId: ObjectId, emoji: String, _id: false }],
  },
  { timestamps: true },
);
songSchema.index({ coupleId: 1, date: -1 });
songSchema.index({ coupleId: 1, userId: 1, date: 1 }, { unique: true });
export const Song = model('Song', songSchema);

/* ── Little things: a private notebook about your partner ───────────── */

export const LITTLE_THING_CATEGORIES = ['food', 'drinks', 'gifts', 'places', 'music', 'words', 'dislikes', 'dreams', 'other'] as const;

const littleThingSchema = new Schema(
  {
    coupleId: coupleRef,
    userId: { ...userRef, index: true }, // the author; only they can ever see it
    text: { type: String, required: true, trim: true, maxlength: 500 },
    category: { type: String, enum: LITTLE_THING_CATEGORIES, default: 'other' },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const LittleThing = model('LittleThing', littleThingSchema);

/* ── Wishlists and secret gift ideas ─────────────────────────────────── */

const giftSchema = new Schema(
  {
    coupleId: coupleRef,
    ownerId: { ...userRef, index: true },
    /**
     * wish: on the owner's wishlist, visible to both. The partner can secretly claim it.
     * idea: a gift idea for the partner, visible only to the owner.
     */
    kind: { type: String, enum: ['wish', 'idea'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    url: { type: String, maxlength: 600 },
    price: { type: String, maxlength: 40 },
    notes: { type: String, maxlength: 1000, default: '' },
    occasion: { type: String, maxlength: 60, default: '' },
    priority: { type: Number, min: 1, max: 3, default: 2 },
    claimedBy: ObjectId, // secret from the wish's owner
    status: { type: String, enum: ['open', 'bought', 'given'], default: 'open' },
    mediaId: { type: ObjectId, ref: 'Media' },
  },
  { timestamps: true },
);
export const GiftItem = model('GiftItem', giftSchema);

/* ── Watchlist ──────────────────────────────────────────────────────── */

const watchSchema = new Schema(
  {
    coupleId: coupleRef,
    addedBy: userRef,
    title: { type: String, required: true, trim: true, maxlength: 140 },
    kind: { type: String, enum: ['movie', 'series', 'documentary', 'anime', 'other'], default: 'movie' },
    year: { type: Number, min: 1880, max: 2100 },
    whereToWatch: { type: String, maxlength: 60, default: '' },
    notes: { type: String, maxlength: 500, default: '' },
    status: { type: String, enum: ['want', 'watching', 'watched'], default: 'want' },
    watchedAt: String,
    ratings: [{ userId: ObjectId, stars: { type: Number, min: 1, max: 5 }, _id: false }],
  },
  { timestamps: true },
);
watchSchema.index({ coupleId: 1, status: 1 });
export const WatchItem = model('WatchItem', watchSchema);

/* ── Couple games ────────────────────────────────────────────────────── */

const gameSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    game: { type: String, enum: ['this_or_that', 'most_likely', 'know_me'], required: true },
    /** For "know me", the person being guessed about. */
    subjectId: ObjectId,
    prompts: [
      {
        text: { type: String, required: true },
        options: [String],
        /** "know me": index of the subject's real answer. Never sent to the guesser before they finish. */
        correct: Number,
        _id: false,
      },
    ],
    answers: [{ userId: ObjectId, picks: [Number], at: Date, _id: false }],
    status: { type: String, enum: ['open', 'done'], default: 'open' },
  },
  { timestamps: true },
);
gameSchema.index({ coupleId: 1, createdAt: -1 });
export type GameDoc = HydratedDocument<InferSchemaType<typeof gameSchema>>;
export const GameRound = model('GameRound', gameSchema);

/* ── Shared journal: one page per day that both can write on ─────────── */

const journalSchema = new Schema(
  {
    coupleId: coupleRef,
    date: { type: String, required: true },
    parts: [
      {
        userId: { type: ObjectId, required: true },
        text: { type: String, maxlength: 5000, default: '' },
        mood: { type: String, maxlength: 16 },
        mediaIds: [{ type: ObjectId, ref: 'Media' }],
        updatedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true },
);
journalSchema.index({ coupleId: 1, date: -1 }, { unique: true });
export const JournalDay = model('JournalDay', journalSchema);
