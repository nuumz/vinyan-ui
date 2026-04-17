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
  type ConversationEntry,
  type TaskResult,
} from '../lib/api-client';
import { toast } from './toast-store';

const MAX_EVENTS = 500;
const POLL_FAST = 5_000;
const POLL_SLOW = 30_000;

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
  tasksLoading: boolean;
  fetchTasks: () => Promise<void>;
  submitTask: (body: Record<string, unknown>) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;

  // Approvals
  pendingApprovals: string[];
  fetchApprovals: () => Promise<void>;
  resolveApproval: (taskId: string, decision: 'approved' | 'rejected') => Promise<void>;

  // Workers
  workers: Worker[];
  fetchWorkers: () => Promise<void>;

  // Sessions
  sessions: Session[];
  fetchSessions: () => Promise<void>;
  createSession: () => Promise<Session | null>;
  compactSession: (id: string) => Promise<void>;

  // Rules
  rules: Rule[];
  fetchRules: () => Promise<void>;

  // Facts
  facts: Fact[];
  fetchFacts: () => Promise<void>;

  // Economy
  economy: EconomyResponse | null;
  fetchEconomy: () => Promise<void>;

  // Chat (session messages)
  chatMessages: ConversationEntry[];
  chatSessionId: string | null;
  chatSending: boolean;
  chatPendingClarifications: string[];
  openChat: (sessionId: string) => Promise<void>;
  sendChatMessage: (content: string) => Promise<TaskResult | null>;
  closeChat: () => void;

  // Events (SSE)
  events: SSEEvent[];
  handleSSEEvent: (event: SSEEvent) => void;
  clearEvents: () => void;

  // Polling
  _pollTimers: ReturnType<typeof setInterval>[];
  startPolling: () => void;
  stopPolling: () => void;

  // Refresh all
  refreshAll: () => Promise<void>;
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
      set({ metrics: await api.getMetrics() });
    } catch {
      /* health covers connectivity */
    }
  },

  // Tasks
  tasks: [],
  tasksLoading: false,
  fetchTasks: async () => {
    try {
      set({ tasksLoading: true });
      const { tasks } = await api.getTasks();
      set({ tasks, tasksLoading: false });
    } catch {
      set({ tasksLoading: false });
    }
  },
  submitTask: async (body) => {
    await api.submitAsyncTask(body);
    // Refresh after short delay so backend has time to register
    setTimeout(() => get().fetchTasks(), 500);
  },
  cancelTask: async (id) => {
    try {
      await api.cancelTask(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel task');
    }
    get().fetchTasks();
  },

  // Approvals
  pendingApprovals: [],
  fetchApprovals: async () => {
    try {
      const { pending } = await api.getPendingApprovals();
      set({ pendingApprovals: pending });
    } catch {
      /* silent */
    }
  },
  resolveApproval: async (taskId, decision) => {
    try {
      await api.approveTask(taskId, decision);
      get().fetchApprovals();
      get().fetchTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve approval');
    }
  },

  // Workers
  workers: [],
  fetchWorkers: async () => {
    try {
      set({ workers: (await api.getWorkers()).workers });
    } catch {
      /* silent */
    }
  },

  // Sessions
  sessions: [],
  fetchSessions: async () => {
    try {
      set({ sessions: (await api.getSessions()).sessions });
    } catch {
      /* silent */
    }
  },
  createSession: async () => {
    try {
      const { session } = await api.createSession();
      get().fetchSessions();
      return session;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  },
  compactSession: async (id) => {
    try {
      await api.compactSession(id);
      get().fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to compact session');
    }
  },

  // Rules
  rules: [],
  fetchRules: async () => {
    try {
      set({ rules: (await api.getRules()).rules });
    } catch {
      /* silent */
    }
  },

  // Facts
  facts: [],
  fetchFacts: async () => {
    try {
      set({ facts: (await api.getFacts()).facts });
    } catch {
      /* silent */
    }
  },

  // Economy
  economy: null,
  fetchEconomy: async () => {
    try {
      set({ economy: await api.getEconomy() });
    } catch {
      /* silent */
    }
  },

  // Chat
  chatMessages: [],
  chatSessionId: null,
  chatSending: false,
  chatPendingClarifications: [],
  openChat: async (sessionId) => {
    set({ chatSessionId: sessionId, chatMessages: [], chatSending: false, chatPendingClarifications: [] });
    try {
      const { messages, session } = await api.getMessages(sessionId);
      set({ chatMessages: messages, chatPendingClarifications: session?.pendingClarifications ?? [] });
    } catch {
      /* session may be empty — no messages yet is normal */
    }
  },
  sendChatMessage: async (content) => {
    const sessionId = get().chatSessionId;
    if (!sessionId) return null;
    set({ chatSending: true });

    // Optimistically add user message to the UI immediately
    const optimisticUserMsg: ConversationEntry = {
      role: 'user',
      content,
      taskId: '',
      timestamp: Date.now(),
      tokenEstimate: 0,
    };
    set((s) => ({ chatMessages: [...s.chatMessages, optimisticUserMsg] }));

    try {
      // Use streaming to avoid 30s fetch timeout on long tasks.
      // The SSE stream stays open until task:complete, so tasks that
      // take 60-300s won't trigger client-side retries.
      const result = await api.sendMessageStream(sessionId, content, {
        onEvent: (event) => {
          // Forward SSE events to the global event store for observability
          get().handleSSEEvent(event);
        },
      });

      // Reload full history after completion (includes formatted assistant response)
      const { messages } = await api.getMessages(sessionId);
      set({
        chatMessages: messages,
        chatSending: false,
        chatPendingClarifications: result.clarificationNeeded ?? [],
      });
      get().fetchSessions();
      return result;
    } catch (err) {
      // On failure, reload messages to get server-side state (which may
      // include a partial response or error message from the agent)
      try {
        const { messages } = await api.getMessages(sessionId);
        set({ chatMessages: messages });
      } catch { /* ignore reload failure */ }
      set({ chatSending: false });
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
      return null;
    }
  },
  closeChat: () => {
    set({ chatSessionId: null, chatMessages: [], chatPendingClarifications: [] });
  },

  // Events — SSE pushes here; also triggers store updates on task/worker events
  events: [],
  handleSSEEvent: (event) => {
    set((state) => {
      const next = [event, ...state.events];
      return { events: next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next };
    });

    // Auto-refresh relevant data when we get lifecycle events from SSE
    const e = event.event;
    if (e === 'task:complete' || e === 'task:start' || e === 'task:escalate' || e === 'task:timeout') {
      get().fetchTasks();
    }
    if (e === 'worker:dispatch' || e === 'worker:complete' || e === 'worker:error') {
      get().fetchWorkers();
    }
    if (e === 'task:approval_required') {
      get().fetchApprovals();
      const p = event.payload as { taskId?: string; riskScore?: number; reason?: string };
      toast.info(`Approval needed: ${p.reason ?? p.taskId ?? 'high-risk task'}`);
    }
  },
  clearEvents: () => set({ events: [] }),

  // Polling — health/metrics fast, data slow
  _pollTimers: [],
  startPolling: () => {
    const s = get();
    s.stopPolling();

    // Initial fetch
    s.refreshAll();

    const timers = [
      setInterval(() => {
        get().fetchHealth();
        get().fetchMetrics();
      }, POLL_FAST),
      setInterval(() => {
        get().fetchTasks();
        get().fetchWorkers();
        get().fetchEconomy();
      }, POLL_SLOW),
    ];
    set({ _pollTimers: timers });
  },
  stopPolling: () => {
    for (const t of get()._pollTimers) clearInterval(t);
    set({ _pollTimers: [] });
  },

  // Refresh all at once
  refreshAll: async () => {
    const s = get();
    await Promise.allSettled([
      s.fetchHealth(),
      s.fetchMetrics(),
      s.fetchTasks(),
      s.fetchWorkers(),
      s.fetchSessions(),
      s.fetchRules(),
      s.fetchFacts(),
      s.fetchEconomy(),
    ]);
  },
}));
