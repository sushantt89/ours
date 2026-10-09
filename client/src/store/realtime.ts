import { create } from 'zustand';

export interface IncomingNudge {
  key: number;
  emoji: string;
  text: string;
  fromName: string;
  kind?: 'nudge' | 'status';
}

interface RealtimeState {
  connected: boolean;
  partnerTyping: boolean;
  nudge: IncomingNudge | null;
  showNudge: (nudge: Omit<IncomingNudge, 'key'>) => void;
  clearNudge: () => void;
}

let key = 1;

export const useRealtime = create<RealtimeState>((set) => ({
  connected: false,
  partnerTyping: false,
  nudge: null,
  showNudge: (nudge) => set({ nudge: { ...nudge, key: key++ } }),
  clearNudge: () => set({ nudge: null }),
}));
