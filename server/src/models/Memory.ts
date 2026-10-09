import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ObjectId, coupleRef, userRef, reactionSchema } from './base';

const memorySchema = new Schema(
  {
    coupleId: coupleRef,
    authorId: userRef,
    mediaId: { type: ObjectId, ref: 'Media', required: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    caption: { type: String, trim: true, maxlength: 1000, default: '' },
    event: { type: String, trim: true, maxlength: 80, default: '' },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    /** Map position: from the photo's own GPS data, or looked up from the place name. */
    geo: { lat: Number, lng: Number, source: { type: String, enum: ['photo', 'place', 'manual'] } },
    geoChecked: { type: Boolean, default: false },
    date: { type: String, required: true }, // YYYY-MM-DD the memory happened
    monthDay: { type: String, required: true }, // MM-DD, powers "On this day"
    albumIds: [{ type: ObjectId, ref: 'Album' }],
    visibility: { type: String, enum: ['shared', 'private'], default: 'shared' },
    favoriteBy: [{ type: ObjectId, ref: 'User' }],
    reactions: [reactionSchema],
    comments: [
      {
        userId: { type: ObjectId, required: true },
        text: { type: String, required: true, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
memorySchema.index({ coupleId: 1, date: -1 });
memorySchema.index({ coupleId: 1, monthDay: 1 });
memorySchema.index({ coupleId: 1, albumIds: 1 });

export type MemoryDoc = HydratedDocument<InferSchemaType<typeof memorySchema>>;
export const Memory = model('Memory', memorySchema);

const albumSchema = new Schema(
  {
    coupleId: coupleRef,
    createdBy: userRef,
    name: { type: String, required: true, trim: true, maxlength: 40 },
    emoji: { type: String, maxlength: 16, default: '❤️' },
  },
  { timestamps: true },
);
export const Album = model('Album', albumSchema);
