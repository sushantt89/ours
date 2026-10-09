export type Accent = 'rose' | 'peach' | 'plum' | 'sage' | 'ocean' | 'gold';
export type LoveLanguage = 'words' | 'time' | 'gifts' | 'service' | 'touch';

export interface E2EEKeyInfo {
  keyId: string;
  salt: string;
  iterations: number;
  verifier: string;
  createdAt: string;
}

export interface Cipher {
  keyId: string;
  iv: string;
  data: string;
}

export interface NotificationPrefs {
  push: boolean;
  messages: boolean;
  nudges: boolean;
  notes: boolean;
  memories: boolean;
  calendar: boolean;
  anniversaries: boolean;
  lists: boolean;
  reminders: boolean;
  questions: boolean;
  songs: boolean;
  games: boolean;
  journal: boolean;
  calls: boolean;
  location: boolean;
  quietHours: { enabled: boolean; start: number; end: number };
}

export interface Privacy {
  showOnline: boolean;
  showLastSeen: boolean;
  readReceipts: boolean;
  shareMood: boolean;
  memoryDefault: 'shared' | 'private';
}

export interface StatusLine {
  emoji: string;
  text: string;
  at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  birthday: string | null;
  timezone: string;
  loveLanguages: LoveLanguage[];
  emailVerified: boolean;
  hasGoogle: boolean;
  coupleId: string | null;
  status: StatusLine | null;
  privacy: Privacy;
  notificationPrefs: NotificationPrefs;
  dashboard: { order: string[]; hidden: string[] };
}

export interface Mood {
  emoji: string;
  label: string;
  note: string;
  at: string;
}

export interface Partner {
  id: string;
  name: string;
  avatarUrl: string | null;
  birthday: string | null;
  timezone: string;
  loveLanguages: LoveLanguage[];
  online: boolean | null;
  lastSeenAt: string | null;
  status: StatusLine | null;
  mood: Mood | null;
  sharesMood: boolean;
}

export interface Couple {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'ended';
  startDate: string | null;
  theme: Accent;
  timezone: string;
  storage: 'app' | 'drive';
  avatarUrl: string | null;
  coverUrl: string | null;
  inviteCode: string | null;
  inviteLink: string | null;
  customNudges: { id: string; emoji: string; text: string }[];
  longDistance: boolean;
  reunionDate: string | null;
  e2ee: { enabled: boolean; keys: E2EEKeyInfo[] };
  memberCount: number;
  createdAt: string;
}

export interface Session {
  user: User;
  couple: Couple | null;
  partner: Partner | null;
}

export interface AppConfig {
  googleClientId: string | null;
  pushPublicKey: string | null;
  driveEnabled: boolean;
  gifsEnabled: boolean;
  maxUploadMb: number;
  turnEnabled: boolean;
}

export interface Media {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file' | 'encrypted';
  mime: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  storage: 'app' | 'drive';
  url: string;
  thumbUrl: string | null;
  /** Set on attachments inside an end-to-end encrypted message: the key needed to read the file. */
  e2eeKeyId?: string;
}

export interface Reaction {
  userId: string;
  emoji: string;
}

export interface Message {
  id: string;
  senderId: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'gif' | 'sticker' | 'encrypted' | 'call';
  text: string;
  media: Media | null;
  gif: { url: string; preview?: string; width?: number; height?: number } | null;
  cipher?: Cipher | null;
  call?: { kind: 'audio' | 'video'; status: 'completed' | 'missed' | 'declined'; duration: number } | null;
  replyTo: { id: string; senderId: string; preview: string } | null;
  reactions: Reaction[];
  pinned: boolean;
  readAt: string | null;
  editedAt: string | null;
  deleted: boolean;
  clientId?: string;
  createdAt: string;
  /** Client-only delivery state for optimistic messages. */
  pending?: boolean;
  failed?: boolean;
}

export interface Note {
  id: string;
  authorId: string;
  audience: 'partner' | 'shared' | 'private';
  kind: 'note' | 'open_when' | 'surprise' | 'daily';
  title: string;
  body: string;
  emoji: string;
  color: Accent;
  media: Media[];
  hasMedia: boolean;
  deliverAt: string | null;
  unlockAt: string | null;
  delivered: boolean;
  locked: boolean;
  sealed: boolean;
  mine: boolean;
  readAt: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
}

export interface Nudge {
  id: string;
  fromId: string;
  toId: string;
  kind: 'nudge' | 'status';
  emoji: string;
  text: string;
  gif?: NudgeGif | null;
  createdAt: string;
}

export interface NudgeGif {
  url: string;
  preview?: string;
  width?: number;
  height?: number;
}

export interface Memory {
  id: string;
  authorId: string;
  kind: 'image' | 'video';
  media: Media | null;
  caption: string;
  event: string;
  location: string;
  geo: { lat: number; lng: number } | null;
  date: string;
  albumIds: string[];
  visibility: 'shared' | 'private';
  favorite: boolean;
  reactions: Reaction[];
  comments: { id: string; userId: string; text: string; createdAt: string }[];
  createdAt: string;
}

export interface Album {
  id: string;
  name: string;
  emoji: string;
  count: number;
  coverUrl: string | null;
}

export type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface CalendarEvent {
  id: string;
  title: string;
  emoji: string;
  type: string;
  date: string;
  time: string | null;
  recurrence: Recurrence;
  remindDaysBefore: number[];
  notes: string;
  visibility: 'shared' | 'personal';
  createdBy: string | null;
  virtual: boolean;
}

export interface Upcoming extends CalendarEvent {
  next: string;
  daysUntil: number;
}

export interface Countdown {
  id: string;
  title: string;
  emoji: string;
  date: string;
  background: string;
  imageUrl: string | null;
}

export interface ListItem {
  id: string;
  text: string;
  done: boolean;
  addedBy?: string;
  doneBy?: string;
}

export interface SharedList {
  id: string;
  name: string;
  emoji: string;
  kind: 'shopping' | 'todo';
  items: ListItem[];
}

export interface BucketItem {
  id: string;
  title: string;
  category: string;
  notes: string;
  done: boolean;
  completedAt: string | null;
  media: Media[];
}

export interface DateIdea {
  id: string;
  title: string;
  emoji: string;
  category: string;
  notes: string;
  status: 'idea' | 'done';
  completedAt?: string | null;
}

export interface Question {
  id: string;
  date: string;
  emoji: string;
  question: string;
  myAnswer: string | null;
  partnerAnswered: boolean;
  partnerAnswer: string | null;
}

export interface AppNotification {
  id: string | null;
  type: string;
  emoji: string;
  title: string;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
}

export interface Dashboard {
  today: string;
  unreadMessages: number;
  lastMessage: { preview: string; mine: boolean; at: string; cipher: Cipher | null } | null;
  songs: { mine: Song | null; partner: Song | null };
  gamesWaiting: number;
  journal: { wroteToday: boolean; partnerWroteToday: boolean };
  unreadNotes: number;
  newMemories: number;
  lastNudge: { emoji: string; text: string; at: string } | null;
  upcoming: Upcoming[];
  countdowns: Countdown[];
  onThisDay: Memory[];
  question: Question;
  streak: { days: number; todayDone: boolean };
  myMood: Mood | null;
  dailyLove: { text: string; emoji: string; from: string } | null;
}

export interface Stats {
  messages: number;
  memories: number;
  nudges: number;
  notes: number;
  dateNights: number;
  trips: number;
  bucketDone: number;
  questions: number;
  streak: number;
}

export interface Song {
  id: string;
  userId: string;
  date: string;
  url: string;
  provider: 'spotify' | 'youtube' | 'apple' | 'soundcloud' | 'link';
  embedId?: string;
  title: string;
  artist: string;
  thumbnail?: string;
  note: string;
  reactions: { userId: string; emoji: string }[];
  createdAt: string;
}

export interface LittleThing {
  id: string;
  text: string;
  category: string;
  pinned: boolean;
  createdAt: string;
}

export interface Gift {
  id: string;
  kind: 'wish' | 'idea';
  mine: boolean;
  title: string;
  url: string | null;
  price: string | null;
  notes: string;
  occasion: string;
  priority: number;
  status: 'open' | 'bought' | 'given';
  claimed: boolean;
  claimedByMe: boolean;
  image: Media | null;
  createdAt: string;
}

export interface WatchItem {
  id: string;
  title: string;
  kind: 'movie' | 'series' | 'documentary' | 'anime' | 'other';
  year?: number;
  whereToWatch: string;
  notes: string;
  status: 'want' | 'watching' | 'watched';
  watchedAt?: string;
  ratings: { userId: string; stars: number }[];
  addedBy: string;
}

export interface JournalPart {
  userId: string;
  text: string;
  mood: string | null;
  media: Media[];
  updatedAt: string;
}

export interface JournalDay {
  id: string;
  date: string;
  parts: JournalPart[];
}

export interface GameRound {
  id: string;
  game: 'this_or_that' | 'most_likely' | 'know_me';
  name: string;
  createdBy: string;
  subjectId: string | null;
  youPlay: boolean;
  prompts: { text: string; options: string[]; correct: number | null }[];
  myPicks: number[] | null;
  partnerAnswered: boolean;
  partnerPicks: number[] | null;
  status: 'open' | 'done';
  score: number | null;
  total: number;
  createdAt: string;
}

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  location: string;
  caption: string;
  date: string;
  kind: 'image' | 'video';
  thumbUrl: string;
}

export interface SharedPosition {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
}

export interface LocationView {
  sharing: boolean;
  /** When sharing stops by itself; null means until turned off. */
  until: string | null;
  position: SharedPosition | null;
}

export interface LocationState {
  me: LocationView;
  partner: LocationView;
  canRequestAt: string | null;
}
