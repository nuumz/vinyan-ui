import { create } from 'zustand';
import type { SSEEvent } from '../lib/api-client';

// Client-only state. Server state (tasks, metrics, workers, sessions, rules,
// facts, economy, approvals, chat messages) lives in TanStack Query — see
// src/hooks/*. The only Zustand surface left is the in-memory event log that
// powers the Events page and the Overview "recent events" widget.

const MAX_EVENTS = 500;

interface EventsState {
  events: SSEEvent[];
  addEvent: (event: SSEEvent) => void;
  clearEvents: () => void;
}

export const useEventsStore = create<EventsState>((set) => ({
  events: [],
  addEvent: (event) =>
    set((state) => {
      const next = [event, ...state.events];
      return { events: next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next };
    }),
  clearEvents: () => set({ events: [] }),
}));
