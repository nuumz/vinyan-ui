import { create } from 'zustand';

// Connection state owned by useSSESync and consumed by query hooks to decide
// whether to poll. When SSE is connected, invalidation handles freshness;
// when SSE is down, queries fall back to interval polling.
interface ConnectionState {
  sseConnected: boolean;
  setSSEConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  sseConnected: false,
  setSSEConnected: (connected) => set({ sseConnected: connected }),
}));
