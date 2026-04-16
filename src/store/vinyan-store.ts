import { create } from 'zustand';
import {
  api,
  type HealthResponse,
  type SystemMetrics,
  type Task,
  type Worker,
  type Session,
  type Rule,
  type Fact,
  type SSEEvent,
  type EconomyResponse,
} from '../lib/api-client';

const MAX_EVENTS = 500;

interface VinyanState {
  // Health
  health: HealthResponse | null;
  healthError: string | null;
  fetchHealth: () => Promise<void>;

  // Metrics
  metrics: SystemMetrics | null;
  fetchMetrics: () => Promise<void>;

  // Tasks
  tasks: Task[];
  fetchTasks: () => Promise<void>;
  submitTask: (body: Record<string, unknown>) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;

  // Workers
  workers: Worker[];
  fetchWorkers: () => Promise<void>;

  // Sessions
  sessions: Session[];
  fetchSessions: () => Promise<void>;
  createSession: () => Promise<Session | null>;

  // Rules
  rules: Rule[];
  fetchRules: () => Promise<void>;

  // Facts
  facts: Fact[];
  fetchFacts: () => Promise<void>;

  // Economy
  economy: EconomyResponse | null;
  fetchEconomy: () => Promise<void>;

  // Events (SSE)
  events: SSEEvent[];
  handleSSEEvent: (event: SSEEvent) => void;
  clearEvents: () => void;

  // Polling
  _pollTimer: ReturnType<typeof setInterval> | null;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

export const useVinyanStore = create<VinyanState>((set, get) => ({
  // Health
  health: null,
  healthError: null,
  fetchHealth: async () => {
    try {
      const data = await api.getHealth();
      set({ health: data, healthError: null });
    } catch (err) {
      set({ healthError: err instanceof Error ? err.message : 'Connection failed' });
    }
  },

  // Metrics
  metrics: null,
  fetchMetrics: async () => {
    try {
      const data = await api.getMetrics();
      set({ metrics: data });
    } catch {
      // silent — health error covers connectivity
    }
  },

  // Tasks
  tasks: [],
  fetchTasks: async () => {
    try {
      const { tasks } = await api.getTasks();
      set({ tasks });
    } catch {
      // silent
    }
  },
  submitTask: async (body) => {
    await api.submitAsyncTask(body);
    get().fetchTasks();
  },
  cancelTask: async (id) => {
    try {
      await api.cancelTask(id);
    } catch {
      // may fail if already completed
    }
    get().fetchTasks();
  },

  // Workers
  workers: [],
  fetchWorkers: async () => {
    try {
      const { workers } = await api.getWorkers();
      set({ workers });
    } catch {
      // silent
    }
  },

  // Sessions
  sessions: [],
  fetchSessions: async () => {
    try {
      const { sessions } = await api.getSessions();
      set({ sessions });
    } catch {
      // silent
    }
  },
  createSession: async () => {
    try {
      const { session } = await api.createSession();
      get().fetchSessions();
      return session;
    } catch {
      return null;
    }
  },

  // Rules
  rules: [],
  fetchRules: async () => {
    try {
      const { rules } = await api.getRules();
      set({ rules });
    } catch {
      // silent
    }
  },

  // Facts
  facts: [],
  fetchFacts: async () => {
    try {
      const { facts } = await api.getFacts();
      set({ facts });
    } catch {
      // silent
    }
  },

  // Economy
  economy: null,
  fetchEconomy: async () => {
    try {
      const data = await api.getEconomy();
      set({ economy: data });
    } catch {
      // silent
    }
  },

  // Events
  events: [],
  handleSSEEvent: (event) => {
    set((state) => {
      const next = [event, ...state.events];
      return { events: next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next };
    });
  },
  clearEvents: () => set({ events: [] }),

  // Polling
  _pollTimer: null,
  startPolling: (intervalMs = 30_000) => {
    const { fetchHealth, fetchMetrics } = get();
    fetchHealth();
    fetchMetrics();
    const timer = setInterval(() => {
      get().fetchHealth();
      get().fetchMetrics();
    }, intervalMs);
    set({ _pollTimer: timer });
  },
  stopPolling: () => {
    const timer = get()._pollTimer;
    if (timer) {
      clearInterval(timer);
      set({ _pollTimer: null });
    }
  },
}));
