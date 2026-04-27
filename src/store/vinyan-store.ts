import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SSEEvent } from '../lib/api-client';

// Client-only state. Server state (tasks, metrics, workers, sessions, rules,
// facts, economy, approvals, chat messages) lives in TanStack Query — see
// src/hooks/*. The only Zustand surface left is the client-side event log that
// powers the Events page and the Overview "recent events" widget.

const MAX_EVENTS = 500;

interface EventsState {
  events: SSEEvent[];
  addEvent: (event: SSEEvent) => void;
  clearEvents: () => void;
}

export const useEventsStore = create<EventsState>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (event) =>
        set((state) => {
          const next = [event, ...state.events];
          return { events: next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next };
        }),
      clearEvents: () => set({ events: [] }),
    }),
    {
      name: 'vinyan-events-v1',
      partialize: (state) => ({ events: state.events }),
    },
  ),
);
