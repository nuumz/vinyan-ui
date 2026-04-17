// ── Types matching backend ─────────────────────────────

export interface HealthResponse {
  status: string;
  uptime_ms: number;
}

export interface SystemMetrics {
  traces: {
    total: number;
    distinctTaskTypes: number;
    successRate: number;
    avgQualityComposite: number;
    routingDistribution: Record<string, number>;
  };
  rules: { total: number; active: number; probation: number; retired: number };
  skills: { total: number; active: number; probation: number; demoted: number };
  patterns: { total: number; sleepCyclesRun: number };
  shadow: { queueDepth: number };
  workers: {
    total: number;
    active: number;
    probation: number;
    demoted: number;
    retired: number;
    traceDiversity: number;
    fleetGini: number;
  };
  dataGates: {
    sleepCycle: boolean;
    skillFormation: boolean;
    evolutionEngine: boolean;
    fleetRouting: boolean;
  };
}

export interface Task {
  taskId: string;
  status: string;
  result?: TaskResult;
}

export interface TaskResult {
  id: string;
  status: 'completed' | 'failed' | 'escalated' | 'uncertain' | 'input-required';
  mutations: Array<{
    file: string;
    diff: string;
    oracleVerdicts: Record<string, OracleVerdict>;
  }>;
  trace: {
    id: string;
    taskId: string;
    routingLevel: number;
    approach: string;
    outcome: string;
    tokensConsumed: number;
    durationMs: number;
    modelUsed?: string;
    affectedFiles: string[];
    oracleVerdicts: Record<string, OracleVerdict>;
    qualityScore?: QualityScore;
  };
  qualityScore?: QualityScore;
  answer?: string;
  thinking?: string;
  escalationReason?: string;
  clarificationNeeded?: string[];
}

export interface OracleVerdict {
  verified: boolean;
  type: 'known' | 'unknown' | 'uncertain' | 'contradictory';
  confidence: number;
  evidence: Array<{ file: string; line: number; snippet: string }>;
  durationMs: number;
}

export interface QualityScore {
  composite: number;
  dimensionsAvailable: number;
  phase: string;
}

export interface Worker {
  id: string;
  config: { modelId: string; temperature?: number; engineType?: string };
  status: 'active' | 'probation' | 'demoted' | 'retired';
  createdAt: number;
  demotionCount: number;
}

export interface Session {
  id: string;
  source: string;
  status: 'active' | 'suspended';
  createdAt: number;
  taskCount: number;
}

export interface Rule {
  id: string;
  condition: string;
  action: string;
  status: string;
  accuracy?: number;
}

export interface Fact {
  id: string;
  target: string;
  pattern: string;
  oracleName: string;
  confidence: number;
  verifiedAt: number;
  sourceFile: string;
}

export interface EconomyResponse {
  enabled: boolean;
  budget: Array<{
    window: string;
    spent_usd: number;
    limit_usd: number;
    utilization_pct: number;
    enforcement: string;
    exceeded: boolean;
  }>;
  cost: {
    hour: { total_usd: number; count: number };
    day: { total_usd: number; count: number };
    month: { total_usd: number; count: number };
  };
  totalEntries: number;
}

export interface SSEEvent {
  event: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  taskId: string;
  timestamp: number;
  thinking?: string;
  toolsUsed?: string[];
  tokenEstimate: number;
}

export interface SessionDetail {
  id: string;
  pendingClarifications: string[];
}

// ── Auth token ────────────────────────────────────────

let _token: string | null = null;
let _bootstrapInFlight: Promise<boolean> | null = null;

export function setApiToken(token: string | null) {
  _token = token;
  if (token) localStorage.setItem('vinyan-token', token);
  else localStorage.removeItem('vinyan-token');
}

/**
 * Auto-fetch token from backend bootstrap endpoint (localhost only).
 * Called on app startup — retries forever in the background until a token
 * is obtained, so a cold backend at launch doesn't leave the app stuck.
 *
 * Idempotent: repeated calls return the same in-flight promise; once
 * resolved with a token, subsequent calls are a no-op.
 */
export function bootstrapAuth(): Promise<boolean> {
  if (hasApiToken()) return Promise.resolve(true);
  if (_bootstrapInFlight) return _bootstrapInFlight;

  _bootstrapInFlight = (async () => {
    let attempt = 0;
    // Retry forever with capped exponential backoff (1s → 30s)
    // until we either get a token or the tab closes.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await fetch(`${API}/auth/bootstrap`);
        if (res.ok) {
          const { token } = (await res.json()) as { token: string };
          if (token) {
            setApiToken(token);
            return true;
          }
        }
      } catch {
        // backend unreachable — retry below
      }
      const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 30_000);
      attempt += 1;
      await new Promise((r) => setTimeout(r, delay));
    }
  })();

  return _bootstrapInFlight;
}

export function getApiToken(): string | null {
  if (!_token) _token = localStorage.getItem('vinyan-token');
  return _token;
}

export function hasApiToken(): boolean {
  return !!getApiToken();
}

// ── Fetch wrapper ──────────────────────────────────────

export const API = '/api/v1';

function authHeaders(method?: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (method && method !== 'GET') h['Content-Type'] = 'application/json';
  const token = getApiToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function backoffMs(attempt: number): number {
  // 500, 1000, 2000 + up to 250ms jitter → avoid thundering herd
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // If caller passed a signal, don't override; else apply our own timeout.
    const externalSignal = init?.signal ?? null;
    const controller = externalSignal ? null : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;

    try {
      const res = await fetch(`${API}${path}`, {
        headers: authHeaders(init?.method),
        ...init,
        signal: externalSignal ?? controller?.signal,
      });
      if (timeout) clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new ApiError(
          `API ${res.status} ${res.statusText || ''} ${path}${body ? ` — ${body.slice(0, 200)}` : ''}`.trim(),
          res.status,
          path,
          body,
        );
        // Retry only on 5xx / 429 — client errors (4xx) are our fault, no retry
        const retriable = res.status >= 500 || res.status === 429;
        if (retriable && attempt < MAX_RETRIES) {
          lastError = err;
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }
        throw err;
      }

      // Guard: server must actually return JSON. Error pages (HTML) otherwise
      // throw a cryptic "Unexpected token <" that masks the real failure.
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        const body = await res.text().catch(() => '');
        throw new ApiError(
          `Expected JSON from ${path} but got "${contentType || 'no content-type'}"${body ? ` — ${body.slice(0, 200)}` : ''}`,
          res.status,
          path,
          body,
        );
      }

      return (await res.json()) as T;
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      // Caller-initiated cancel: do NOT retry, propagate quietly.
      if (externalSignal?.aborted) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(`Request timeout after ${TIMEOUT_MS / 1000}s: ${path}`);
      } else if (err instanceof ApiError) {
        // Non-retriable API errors already thrown above — bubble up
        throw err;
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
        continue;
      }
    }
  }

  throw lastError ?? new Error(`Failed after ${MAX_RETRIES + 1} attempts: ${path}`);
}

// ── Endpoints ──────────────────────────────────────────

export const api = {
  // Health & metrics (no auth)
  getHealth: () => fetchJSON<HealthResponse>('/health'),
  getMetrics: () => fetchJSON<SystemMetrics>('/metrics?format=json'),
  getPrometheusMetrics: async (): Promise<string> => {
    const res = await fetch(`${API}/metrics`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Prometheus ${res.status}`);
    return res.text();
  },

  // Read-only (no auth)
  getWorkers: () => fetchJSON<{ workers: Worker[] }>('/workers'),
  getRules: () => fetchJSON<{ rules: Rule[] }>('/rules'),
  getFacts: () => fetchJSON<{ facts: Fact[] }>('/facts'),
  getEconomy: () => fetchJSON<EconomyResponse>('/economy'),

  // Tasks (auth for mutations)
  getTasks: () => fetchJSON<{ tasks: Task[] }>('/tasks'),
  getTask: (id: string) => fetchJSON<Task>(`/tasks/${id}`),
  submitTask: (body: Record<string, unknown>) =>
    fetchJSON<{ result: TaskResult }>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  submitAsyncTask: (body: Record<string, unknown>) =>
    fetchJSON<{ taskId: string; status: string }>('/tasks/async', { method: 'POST', body: JSON.stringify(body) }),
  cancelTask: (id: string) =>
    fetchJSON<{ taskId: string; status: string }>(`/tasks/${id}`, { method: 'DELETE' }),

  // Approval (A6)
  getPendingApprovals: () => fetchJSON<{ pending: string[] }>('/approvals'),
  approveTask: (taskId: string, decision: 'approved' | 'rejected') =>
    fetchJSON<{ taskId: string; decision: string }>(`/tasks/${taskId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  // Sessions (auth required)
  getSessions: () => fetchJSON<{ sessions: Session[] }>('/sessions'),
  createSession: (source = 'ui') =>
    fetchJSON<{ session: Session }>('/sessions', { method: 'POST', body: JSON.stringify({ source }) }),
  getSession: (id: string) => fetchJSON<{ session: Session }>(`/sessions/${id}`),
  compactSession: (id: string) =>
    fetchJSON<{ compaction: unknown }>(`/sessions/${id}/compact`, { method: 'POST' }),

  // Session messages (auth required)
  getMessages: (sessionId: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return fetchJSON<{ session: SessionDetail; messages: ConversationEntry[] }>(
      `/sessions/${sessionId}/messages${qs}`,
    );
  },
  sendMessage: (sessionId: string, content: string, options?: { showThinking?: boolean }) =>
    fetchJSON<{ session: SessionDetail; task: TaskResult }>(`/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, showThinking: options?.showThinking }),
    }),

  /**
   * Send a message using SSE streaming. Returns an async generator that
   * yields SSE events as they arrive, and the final task result.
   *
   * This avoids the 30s fetch timeout that causes duplicate submissions
   * on long-running agentic-workflow tasks.
   */
  sendMessageStream: async (
    sessionId: string,
    content: string,
    options?: { showThinking?: boolean; onEvent?: (event: SSEEvent) => void },
  ): Promise<TaskResult> => {
    const token = getApiToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, showThinking: options?.showThinking, stream: true }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body || res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: TaskResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newlines.
      // Each message may have multiple fields: event:, data:, etc.
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? ''; // Keep incomplete block in buffer

      for (const block of blocks) {
        if (!block.trim()) continue;
        // Parse SSE fields from the block
        let eventData = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
          // 'event:' lines are informational — actual data is in the data field
          // Heartbeat comments (: ...) are ignored
        }
        if (!eventData) continue;

        try {
          const parsed = JSON.parse(eventData) as SSEEvent & { payload: Record<string, unknown> };
          options?.onEvent?.(parsed);

          if (parsed.event === 'task:complete') {
            finalResult = (parsed.payload.result as TaskResult) ?? null;
          }
        } catch {
          // Malformed data — skip
        }
      }
    }

    if (!finalResult) throw new Error('Stream ended without task:complete');
    return finalResult;
  },
};
