import { Router } from 'express';
import { ZipArchive } from 'archiver';
import {
  Message,
  Note,
  Memory,
  Album,
  Media,
  CalendarEvent,
  Countdown,
  SharedList,
  BucketListItem,
  DateIdea,
  DailyQuestion,
  Nudge,
  Mood,
  User,
  Song,
  JournalDay,
  WatchItem,
  GameRound,
  LittleThing,
  GiftItem,
} from '../models';
import { requireMediaAuth, requireCouple } from '../middleware/auth';
import { coupleJSON, selfJSON } from '../services/serialize';
import * as gridfs from '../services/storage/gridfs';
import * as drive from '../services/storage/drive';

/**
 * Data portability. These are plain browser downloads, so they authenticate with the
 * same read-only cookie as media. Private items belonging to the other partner are excluded.
 */
const router = Router();
router.use(requireMediaAuth, requireCouple);

router.get('/export.json', async (req, res) => {
  const coupleId = req.couple._id;
  const me = req.user._id;
  const members = await User.find({ _id: { $in: req.couple.members } }).select('name');
  const [messages, notes, memories, albums, events, countdowns, lists, bucket, dates, questions, nudges, moods] =
    await Promise.all([
      Message.find({ coupleId, deletedAt: null }).sort({ createdAt: 1 }).lean(),
      Note.find({
        coupleId,
        $or: [{ authorId: me }, { audience: 'shared' }, { audience: 'partner', deliveredAt: { $ne: null }, $or: [{ unlockAt: null }, { unlockAt: { $lte: new Date() } }] }],
      }).lean(),
      Memory.find({ coupleId, $or: [{ visibility: 'shared' }, { authorId: me }] }).lean(),
      Album.find({ coupleId }).lean(),
      CalendarEvent.find({ coupleId, $or: [{ visibility: 'shared' }, { createdBy: me }] }).lean(),
      Countdown.find({ coupleId }).lean(),
      SharedList.find({ coupleId }).lean(),
      BucketListItem.find({ coupleId }).lean(),
      DateIdea.find({ coupleId }).lean(),
      DailyQuestion.find({ coupleId, 'answers.1': { $exists: true } }).lean(),
      Nudge.find({ coupleId }).lean(),
      Mood.find({ coupleId, userId: me }).lean(),
    ]);
  const [songs, journal, watchlist, games, littleThings, gifts] = await Promise.all([
    Song.find({ coupleId }).lean(),
    JournalDay.find({ coupleId }).sort({ date: 1 }).lean(),
    WatchItem.find({ coupleId }).lean(),
    GameRound.find({ coupleId, status: 'done' }).lean(),
    LittleThing.find({ coupleId, userId: me }).lean(),
    GiftItem.find({ coupleId, $or: [{ kind: 'wish' }, { ownerId: me }] }).lean(),
  ]);
  // Your own wishlist never reveals what your partner has claimed.
  const safeGifts = gifts.map((g) => (String(g.ownerId) === String(me) && g.kind === 'wish' ? { ...g, claimedBy: undefined, status: g.status === 'given' ? 'given' : 'open' } : g));

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ours-export-${stamp}.json"`);
  res.send(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        you: selfJSON(req.user),
        couple: coupleJSON(req.couple),
        members: members.map((m) => ({ id: String(m._id), name: m.name })),
        messages,
        notes,
        memories,
        albums,
        events,
        countdowns,
        lists,
        bucketList: bucket,
        dateIdeas: dates,
        dailyQuestions: questions,
        nudges,
        myMoods: moods,
        songs,
        journal,
        watchlist,
        games,
        myLittleThings: littleThings,
        gifts: safeGifts,
        note: 'End-to-end encrypted messages are exported as ciphertext. They can only be read in the app with your passphrase.',
      },
      null,
      2,
    ),
  );
});

router.get('/memories.zip', async (req, res) => {
  const memories = await Memory.find({
    coupleId: req.couple._id,
    $or: [{ visibility: 'shared' }, { authorId: req.user._id }],
  }).sort({ date: 1 });
  const media = await Media.find({ _id: { $in: memories.map((m) => m.mediaId) }, coupleId: req.couple._id });
  const byId = new Map(media.map((m) => [String(m._id), m]));
  const driveToken = media.some((m) => m.storage === 'drive')
    ? await drive.accessTokenFor(req.couple._id).then((t) => t.token).catch(() => null)
    : null;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="ours-memories-${new Date().toISOString().slice(0, 10)}.zip"`);
  const zip = new ZipArchive({ store: true }); // photos and video are already compressed
  zip.on('error', () => res.destroy());
  zip.pipe(res);

  const used = new Set<string>();
  for (const memory of memories) {
    const item = byId.get(String(memory.mediaId));
    if (!item) continue;
    let name = `${memory.date}/${item.name}`;
    for (let n = 2; used.has(name); n++) name = `${memory.date}/${n}-${item.name}`;
    used.add(name);
    try {
      if (item.storage === 'drive') {
        if (!driveToken) continue;
        zip.append((await drive.downloadFile(driveToken, item.key)).stream, { name });
      } else {
        zip.append(gridfs.openFile(item.key), { name });
      }
    } catch {
      /* skip a file that has gone missing rather than fail the whole download */
    }
  }
  await zip.finalize();
});

export default router;
