import type { Accent } from './types';

export const APP_NAME = 'Ours';

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg,#d6456b,#f08a6e)' },
  { id: 'peach', label: 'Peach', swatch: 'linear-gradient(135deg,#e0683f,#f2a65a)' },
  { id: 'plum', label: 'Plum', swatch: 'linear-gradient(135deg,#8b4fc4,#d667a6)' },
  { id: 'sage', label: 'Sage', swatch: 'linear-gradient(135deg,#4a8767,#8fb573)' },
  { id: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg,#2f7db5,#5fb7c2)' },
  { id: 'gold', label: 'Gold', swatch: 'linear-gradient(135deg,#b17f22,#dd9b57)' },
];

export const REACTIONS = ['❤️', '😘', '😂', '🥺', '🔥', '💋', '🫶', '🤗'];

/** Built-in nudges. `gif` is the GIPHY search used when a nudge is sent with a GIF. */
export const NUDGES = [
  { emoji: '❤️', text: 'Thinking of you', gif: 'thinking of you love' },
  { emoji: '😘', text: 'Kiss', gif: 'kiss cute' },
  { emoji: '🫂', text: 'Hug', gif: 'hug cute' },
  { emoji: '☕', text: 'Coffee?', gif: 'coffee cute' },
  { emoji: '🥺', text: 'Miss you', gif: 'miss you' },
  { emoji: '😂', text: "You're annoying", gif: 'annoying funny' },
  { emoji: '💋', text: 'Kiss me', gif: 'kiss me' },
  { emoji: '🫶', text: 'Love you', gif: 'i love you' },
  { emoji: '🔥', text: 'Come here', gif: 'come here cuddle' },
  { emoji: '🌙', text: 'Good night', gif: 'good night cute' },
  { emoji: '☀️', text: 'Good morning', gif: 'good morning cute' },
];

export const STATUSES = [
  { emoji: '❤️', text: 'Thinking of you' },
  { emoji: '🥺', text: 'Missing you' },
  { emoji: '😘', text: 'Wish you were here' },
  { emoji: '🫶', text: 'Love you' },
];

export const MOODS = [
  { emoji: '😊', label: 'Happy' },
  { emoji: '🥰', label: 'Loved' },
  { emoji: '🤗', label: 'Excited' },
  { emoji: '😌', label: 'Relaxed' },
  { emoji: '😴', label: 'Tired' },
  { emoji: '😔', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
  { emoji: '😰', label: 'Stressed' },
];

export const OPEN_WHEN = [
  'Open when you miss me',
  "Open when you're sad",
  "Open when you're angry at me",
  'Open when you need a laugh',
  "Open when you can't sleep",
  'Open on our anniversary',
  'Open on your birthday',
];

export const STICKERS = ['🥰', '😘', '🫶', '❤️‍🔥', '🥺', '😂', '🤗', '😴', '🙈', '💃', '🕺', '🎉', '🌹', '💐', '🍕', '☕', '🧸', '🐻', '🐱', '🐶', '🦋', '🌙', '☀️', '🌈', '💍', '👑', '🍓', '🍫', '🥂', '✨'];

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Love', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '❤️‍🔥', '💌', '💋', '🫶', '🌹', '💐', '💍'] },
  { label: 'Faces', emojis: ['😀', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😘', '😚', '😋', '😜', '🤪', '🤗', '🤭', '🫣', '🤔', '😏', '😌', '😴', '🥱', '😔', '🥺', '😢', '😭', '😤', '😡', '🤯', '😳', '🥵', '🥶', '😇', '🤩', '🥳', '😎', '🙈', '🙄', '😬', '🤤', '😂', '🤣'] },
  { label: 'Hands', emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '👋', '🤞', '✌️', '🤟', '🤙', '💪', '👀', '🫂', '🤷', '🤦'] },
  { label: 'Life', emojis: ['🎉', '🎂', '🎁', '🎈', '✨', '🔥', '⭐', '🌙', '☀️', '🌈', '☔', '❄️', '🌊', '🏖️', '🏡', '✈️', '🚗', '🗺️', '🎬', '🎵', '🎮', '📸', '📚', '💤', '🛒', '🧺', '🧳', '🎄'] },
  { label: 'Food', emojis: ['☕', '🍵', '🍷', '🥂', '🍺', '🍕', '🍔', '🍟', '🌮', '🍜', '🍣', '🍝', '🥗', '🥞', '🍳', '🧁', '🍰', '🍫', '🍦', '🍓', '🍿', '🍽️'] },
  { label: 'Animals', emojis: ['🐶', '🐱', '🐻', '🐼', '🐨', '🦊', '🐰', '🐧', '🦋', '🐝', '🧸', '🌸', '🌻', '🪴', '🌳'] },
];

export const EVENT_TYPES: { id: string; label: string; emoji: string }[] = [
  { id: 'date_night', label: 'Date night', emoji: '🍽️' },
  { id: 'anniversary', label: 'Anniversary', emoji: '❤️' },
  { id: 'birthday', label: 'Birthday', emoji: '🎂' },
  { id: 'first_date', label: 'First date', emoji: '🌹' },
  { id: 'first_kiss', label: 'First kiss', emoji: '💋' },
  { id: 'trip', label: 'Trip', emoji: '✈️' },
  { id: 'holiday', label: 'Holiday', emoji: '🏖️' },
  { id: 'appointment', label: 'Appointment', emoji: '📍' },
  { id: 'event', label: 'Event', emoji: '📅' },
  { id: 'reminder', label: 'Reminder', emoji: '⏰' },
];

export const BUCKET_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'adventure', label: 'Adventure', emoji: '🪂' },
  { id: 'food', label: 'Food', emoji: '🍝' },
  { id: 'home', label: 'Home', emoji: '🏡' },
  { id: 'milestone', label: 'Milestones', emoji: '💍' },
  { id: 'fun', label: 'Fun', emoji: '🎡' },
  { id: 'other', label: 'Other', emoji: '✨' },
];

export const DATE_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'home', label: 'At home', emoji: '🏡' },
  { id: 'cosy', label: 'Cosy', emoji: '🕯️' },
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'outdoors', label: 'Outdoors', emoji: '🌿' },
  { id: 'adventure', label: 'Adventure', emoji: '🧭' },
  { id: 'culture', label: 'Culture', emoji: '🎭' },
  { id: 'fancy', label: 'Fancy', emoji: '🥂' },
];

export const COUNTDOWN_BACKGROUNDS: Record<string, string> = {
  sunset: 'linear-gradient(135deg,#f6a06b,#e2557c 60%,#8a4fbf)',
  blush: 'linear-gradient(135deg,#f7b6c4,#e86f93)',
  ocean: 'linear-gradient(135deg,#4aa3d8,#2c5fa8 70%,#2b3f86)',
  forest: 'linear-gradient(135deg,#7fbf8e,#2f7a5c)',
  night: 'linear-gradient(135deg,#3a2f5c,#171329)',
  gold: 'linear-gradient(135deg,#f1c56d,#c9792d)',
};

export const NOTIFICATION_SETTINGS: { key: string; label: string; hint: string }[] = [
  { key: 'messages', label: 'Messages', hint: 'New chat messages' },
  { key: 'nudges', label: 'Nudges', hint: 'Nudges and "thinking of you"' },
  { key: 'notes', label: 'Love notes', hint: 'Notes, letters and surprises' },
  { key: 'memories', label: 'Memories', hint: 'New photos, comments and "on this day"' },
  { key: 'calendar', label: 'Calendar', hint: 'New events, reminders and countdowns' },
  { key: 'anniversaries', label: 'Anniversaries', hint: 'Anniversaries, birthdays and milestones' },
  { key: 'lists', label: 'Shared lists', hint: 'Changes to lists and the bucket list' },
  { key: 'questions', label: 'Daily question', hint: 'When your partner answers' },
  { key: 'songs', label: 'Song of the day', hint: 'When your partner shares a song' },
  { key: 'games', label: 'Games', hint: 'New rounds and results' },
  { key: 'journal', label: 'Journal', hint: 'When your partner writes in your journal' },
  { key: 'calls', label: 'Calls', hint: 'Incoming and missed calls' },
  { key: 'reminders', label: 'Gentle reminders', hint: 'Occasional ideas, like planning a date night' },
];

export const LOVE_LANGUAGES: { id: 'words' | 'time' | 'gifts' | 'service' | 'touch'; label: string; emoji: string; hint: string }[] = [
  { id: 'words', label: 'Words of affirmation', emoji: '💬', hint: 'Compliments, encouragement, "I love you"' },
  { id: 'time', label: 'Quality time', emoji: '⏳', hint: 'Undivided attention, doing things together' },
  { id: 'gifts', label: 'Receiving gifts', emoji: '🎁', hint: 'Thoughtful tokens that say "I thought of you"' },
  { id: 'service', label: 'Acts of service', emoji: '🧺', hint: 'Doing the dishes, making the coffee' },
  { id: 'touch', label: 'Physical touch', emoji: '🫂', hint: 'Hugs, holding hands, closeness' },
];

export const LITTLE_THING_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'drinks', label: 'Drinks', emoji: '☕' },
  { id: 'gifts', label: 'Gift ideas', emoji: '🎁' },
  { id: 'places', label: 'Places', emoji: '📍' },
  { id: 'music', label: 'Music & films', emoji: '🎵' },
  { id: 'words', label: 'Things they said', emoji: '💬' },
  { id: 'dislikes', label: 'Not a fan of', emoji: '🙅' },
  { id: 'dreams', label: 'Dreams', emoji: '✨' },
  { id: 'other', label: 'Other', emoji: '📝' },
];

export const WATCH_KINDS: { id: string; label: string; emoji: string }[] = [
  { id: 'movie', label: 'Film', emoji: '🎬' },
  { id: 'series', label: 'Series', emoji: '📺' },
  { id: 'documentary', label: 'Documentary', emoji: '🎥' },
  { id: 'anime', label: 'Anime', emoji: '🌸' },
  { id: 'other', label: 'Other', emoji: '🍿' },
];
