import { Router } from 'express';
import { Message, Note, Memory, Nudge, User, Song, GameRound, JournalDay } from '../models';
import { eventsFor, upcoming } from '../services/calendar';
import { loveStreak } from '../services/streak';
import { unreadCount, previewOf } from './messages';
import { countdownsJSON } from './planning';
import { onThisDay } from './memories';
import { todaysQuestion, questionJSON, myMood } from './together';
import { todayIn } from '../utils/dates';

const router = Router();

/** One call that powers the home screen. */
router.get('/', async (req, res) => {
  const coupleId = req.couple._id;
  const me = req.user._id;
  const partnerId = req.partnerId;
  const today = todayIn(req.couple.timezone);

  const [unread, lastMessage, unreadNotes, newMemories, lastNudge, events, countdowns, memoriesToday, question, streak, mood, dailyLove, partner] =
    await Promise.all([
      unreadCount(coupleId, me),
      Message.findOne({ coupleId, deletedAt: null }).sort({ createdAt: -1 }),
      Note.countDocuments({ coupleId, audience: 'partner', authorId: { $ne: me }, deliveredAt: { $ne: null }, readAt: null, kind: { $ne: 'daily' }, archivedBy: { $ne: me } }),
      Memory.countDocuments({ coupleId, visibility: 'shared', authorId: { $ne: me }, createdAt: { $gt: req.user.seenMemoriesAt ?? new Date(0) } }),
      Nudge.findOne({ coupleId, toId: me, kind: 'nudge' }).sort({ createdAt: -1 }),
      eventsFor(req.couple, me),
      countdownsJSON(coupleId, req.couple.timezone),
      onThisDay(req),
      todaysQuestion(req.couple),
      loveStreak(req.couple),
      myMood(coupleId, me),
      partnerId ? Note.findOne({ coupleId, authorId: partnerId, kind: 'daily', dayKey: today }) : null,
      partnerId ? User.findById(partnerId).select('name') : null,
    ]);
  const [songsToday, openGames, journalToday] = await Promise.all([
    Song.find({ coupleId, date: today }),
    GameRound.find({ coupleId, status: 'open' }).select('game subjectId answers'),
    JournalDay.findOne({ coupleId, date: today }).select('parts.userId'),
  ]);
  const gamesWaiting = openGames.filter(
    (g) => !(g.game === 'know_me' && g.subjectId?.equals(me)) && !g.answers.some((a) => a.userId?.equals(me)),
  ).length;

  res.json({
    today,
    unreadMessages: unread,
    lastMessage: lastMessage
      ? {
          preview: previewOf(lastMessage),
          mine: lastMessage.senderId.equals(me),
          at: lastMessage.get('createdAt'),
          cipher: lastMessage.type === 'encrypted' ? lastMessage.cipher : null,
        }
      : null,
    songs: {
      mine: songsToday.find((s) => s.userId.equals(me)) ?? null,
      partner: songsToday.find((s) => !s.userId.equals(me)) ?? null,
    },
    gamesWaiting,
    journal: {
      wroteToday: Boolean(journalToday?.parts.some((p) => p.userId.equals(me))),
      partnerWroteToday: Boolean(journalToday?.parts.some((p) => !p.userId.equals(me))),
    },
    unreadNotes,
    newMemories,
    lastNudge:
      lastNudge && Date.now() - new Date(lastNudge.get('createdAt')).getTime() < 24 * 3600 * 1000
        ? { emoji: lastNudge.emoji, text: lastNudge.text, at: lastNudge.get('createdAt') }
        : null,
    upcoming: upcoming(events, req.couple.timezone, 4),
    countdowns: countdowns.filter((c) => c.date >= today).slice(0, 6),
    onThisDay: memoriesToday.slice(0, 6),
    question: questionJSON(question, me),
    streak,
    myMood: mood,
    dailyLove: dailyLove ? { text: dailyLove.body, emoji: dailyLove.emoji, from: partner?.name ?? '' } : null,
  });
});

export default router;
