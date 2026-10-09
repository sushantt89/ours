import {
  Home,
  MessageCircleHeart,
  Images,
  CalendarHeart,
  Menu,
  Mail,
  HandHeart,
  MessageCircleQuestion,
  ListChecks,
  Sparkles,
  UtensilsCrossed,
  Hourglass,
  BookHeart,
  FolderHeart,
  Bell,
  Settings,
  LayoutGrid,
  Music,
  NotebookPen,
  Gift,
  Clapperboard,
  Dices,
  MapPinned,
  Globe2,
  Heart,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  emoji: string;
  hint?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const PRIMARY: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, emoji: '🏠' },
  { to: '/chat', label: 'Chat', icon: MessageCircleHeart, emoji: '💬' },
  { to: '/nudges', label: 'Nudges', icon: HandHeart, emoji: '💕' },
  { to: '/calendar', label: 'Calendar', icon: CalendarHeart, emoji: '📅' },
];

export const MORE_TAB: NavItem = { to: '/more', label: 'More', icon: Menu, emoji: '☰' };

export const GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    items: [
      { to: '/notes', label: 'Love notes', icon: Mail, emoji: '💌', hint: 'Letters, surprises and "open when…"' },
      { to: '/question', label: 'Daily question', icon: MessageCircleQuestion, emoji: '💭', hint: 'Answer, then reveal together' },
      { to: '/music', label: 'Song of the day', icon: Music, emoji: '🎵', hint: 'One song each, every day' },
      { to: '/journal', label: 'Our journal', icon: NotebookPen, emoji: '📔', hint: 'A page a day, written by both' },
    ],
  },
  {
    label: 'Plans',
    items: [
      { to: '/lists', label: 'Shared lists', icon: ListChecks, emoji: '🛒', hint: 'Shopping and to-dos, always in sync' },
      { to: '/date-night', label: 'Date night', icon: UtensilsCrossed, emoji: '🍽️', hint: 'Ideas, and a dice to choose' },
      { to: '/watchlist', label: 'Watchlist', icon: Clapperboard, emoji: '🍿', hint: 'What to watch next, rated by both' },
      { to: '/bucket-list', label: 'Bucket list', icon: Sparkles, emoji: '✨', hint: 'Everything you want to do together' },
      { to: '/countdowns', label: 'Countdowns', icon: Hourglass, emoji: '⏳', hint: 'Days until the things you love' },
      { to: '/gifts', label: 'Gifts', icon: Gift, emoji: '🎁', hint: 'Wishlists and secret ideas' },
    ],
  },
  {
    label: 'Us',
    items: [
      { to: '/memories', label: 'Memories', icon: Images, emoji: '📸', hint: 'Photos, videos and albums' },
      { to: '/story', label: 'Our story', icon: BookHeart, emoji: '❤️', hint: 'Counter, milestones and year in review' },
      { to: '/map', label: 'Memory map', icon: MapPinned, emoji: '🗺️', hint: 'Everywhere you have been together' },
      { to: '/games', label: 'Games', icon: Dices, emoji: '🎲', hint: 'This or that, who is more likely, quizzes' },
      { to: '/little-things', label: 'Little things', icon: Heart, emoji: '🫶', hint: 'Love languages and what they love' },
      { to: '/distance', label: 'Long distance', icon: Globe2, emoji: '🌏', hint: 'Time zones and the next reunion' },
      { to: '/files', label: 'Files', icon: FolderHeart, emoji: '☁️', hint: 'Shared documents and Google Drive' },
    ],
  },
];

export const SECONDARY: NavItem[] = GROUPS.flatMap((g) => g.items);

export const UTILITY: NavItem[] = [
  { to: '/notifications', label: 'Notifications', icon: Bell, emoji: '🔔' },
  { to: '/widgets', label: 'Widgets & shortcuts', icon: LayoutGrid, emoji: '🧩' },
  { to: '/settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
];
