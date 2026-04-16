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
let _bootstrapped = false;

export function setApiToken(token: string | null) {
  _token = token;
  if (token) localStorage.setItem('vinyan-token', token);
  else localStorage.removeItem('vinyan-token');
}

/**
 * Auto-fetch token from backend bootstrap endpoint (localhost only).
 * Called once on app startup — no manual paste needed.
 */
export async function bootstrapAuth(): Promise<boolean> {
  if (_bootstrapped) return hasApiToken();
  _bootstrapped = true;

  // Already have a token? Keep it.
  if (hasApiToken()) return true;

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
    // Backend not reachable — no token
  }
  return false;
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

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: authHeaders(init?.method),
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Endpoints ──────────────────────────────────────────

export const api = {
  // Health & metrics (no auth)
  getHealth: () => fetchJSON<HealthResponse>('/health'),
  getMetrics: () => fetchJSON<SystemMetrics>('/metrics?format=json'),
  getPrometheusMetrics: async (): Promise<string> => {
    const res = await fetch(`${API}/metrics`);
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
};
