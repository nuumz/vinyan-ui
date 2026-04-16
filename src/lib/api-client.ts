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

// ── Fetch wrapper ──────────────────────────────────────

const API = '/api/v1';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  getHealth: () => fetchJSON<HealthResponse>('/health'),
  getMetrics: () => fetchJSON<SystemMetrics>('/metrics?format=json'),
  getTasks: () => fetchJSON<{ tasks: Task[] }>('/tasks'),
  getTask: (id: string) => fetchJSON<Task>(`/tasks/${id}`),
  submitTask: (body: Record<string, unknown>) =>
    fetchJSON<{ result: TaskResult }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitAsyncTask: (body: Record<string, unknown>) =>
    fetchJSON<{ taskId: string; status: string }>('/tasks/async', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelTask: (id: string) =>
    fetchJSON<{ taskId: string; status: string }>(`/tasks/${id}`, { method: 'DELETE' }),
  getSessions: () => fetchJSON<{ sessions: Session[] }>('/sessions'),
  createSession: (source = 'ui') =>
    fetchJSON<{ session: Session }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ source }),
    }),
  getSession: (id: string) => fetchJSON<{ session: Session }>(`/sessions/${id}`),
  compactSession: (id: string) =>
    fetchJSON<{ compaction: unknown }>(`/sessions/${id}/compact`, { method: 'POST' }),
  getWorkers: () => fetchJSON<{ workers: Worker[] }>('/workers'),
  getRules: () => fetchJSON<{ rules: Rule[] }>('/rules'),
  getFacts: () => fetchJSON<{ facts: Fact[] }>('/facts'),
  getEconomy: () => fetchJSON<EconomyResponse>('/economy'),
};
