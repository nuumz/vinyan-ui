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
  sessionId?: string;
  goal?: string;
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

export interface AgentRoutingHints {
  minLevel?: number;
  preferDomains?: string[];
  preferExtensions?: string[];
  preferFrameworks?: string[];
}

export interface AgentCapabilityOverrides {
  readAny?: boolean;
  writeAny?: boolean;
  network?: boolean;
  shell?: boolean;
}

export interface AgentListEntry {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  isDefault: boolean;
  allowedTools: string[] | null;
  routingHints: AgentRoutingHints | null;
  capabilityOverrides: AgentCapabilityOverrides | null;
  role: string | null;
  specialization: string | null;
  persona: string | null;
  episodeCount: number;
  proficiencyCount: number;
}

export interface AgentEpisode {
  taskId: string;
  taskSignature: string;
  outcome: 'success' | 'partial' | 'failed';
  lesson: string;
  filesInvolved: string[];
  approachUsed: string;
  timestamp: number;
}

export interface AgentContextDetail {
  identity: {
    agentId: string;
    persona: string;
    strengths: string[];
    weaknesses: string[];
    approachStyle: string;
  };
  memory: {
    episodes: AgentEpisode[];
    lessonsSummary: string;
  };
  skills: {
    proficiencies: Record<
      string,
      {
        taskSignature: string;
        level: string;
        successRate: number;
        totalAttempts: number;
        lastAttempt: number;
      }
    >;
    preferredApproaches: Record<string, string>;
    antiPatterns: string[];
  };
  lastUpdated: number;
}

export interface AgentDetail {
  spec: {
    id: string;
    name: string;
    description: string;
    builtin: boolean;
    isDefault: boolean;
    soul: string | null;
    soulPath: string | null;
    allowedTools: string[] | null;
    routingHints: AgentRoutingHints | null;
    capabilityOverrides: AgentCapabilityOverrides | null;
  };
  profile: Record<string, unknown> | null;
  context: AgentContextDetail | null;
}

export interface CachedSkill {
  taskSignature: string;
  approach: string;
  successRate: number;
  status: 'active' | 'probation' | 'demoted';
  probationRemaining: number;
  usageCount: number;
  riskAtCreation: number;
  lastVerifiedAt: number;
  verificationProfile: string;
  origin?: string;
  agentId?: string | null;
}

export interface ExtractedPattern {
  id: string;
  type: 'anti-pattern' | 'success-pattern' | 'worker-performance' | 'decomposition-pattern';
  description: string;
  frequency: number;
  confidence: number;
  taskTypeSignature: string;
  approach?: string;
  qualityDelta?: number;
  decayWeight: number;
  createdAt: number;
  routingLevel?: number;
  workerId?: string;
}

export interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface DoctorReport {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: number;
  deep: boolean;
  checks: DoctorCheck[];
  summary: { passed: number; total: number };
}

export interface ConfigResponse {
  config: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
}

export interface MCPServerEntry {
  name: string;
  trustLevel: string;
  connected: boolean;
  toolCount: number;
}

export interface MCPToolEntry {
  serverName: string;
  name: string;
  description?: string;
}

export interface MCPReport {
  enabled: boolean;
  configured: Array<{ name: string; trustLevel: string }>;
  servers: MCPServerEntry[];
  tools?: MCPToolEntry[];
}

export interface Session {
  id: string;
  source: string;
  status: 'active' | 'suspended' | 'compacted' | 'closed';
  createdAt: number;
  updatedAt: number;
  taskCount: number;
  title: string | null;
  description: string | null;
  archivedAt: number | null;
  deletedAt: number | null;
}

export type SessionListState = 'active' | 'archived' | 'deleted' | 'all';

export interface ListSessionsParams {
  state?: SessionListState;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateSessionPayload {
  source?: string;
  title?: string | null;
  description?: string | null;
}

export interface UpdateSessionPayload {
  title?: string | null;
  description?: string | null;
}

export type RuleStatus = 'active' | 'probation' | 'retired';

export interface Rule {
  id: string;
  source: 'sleep-cycle' | 'manual';
  condition: {
    filePattern?: string;
    oracleName?: string;
    riskAbove?: number;
    modelPattern?: string;
  };
  action: 'escalate' | 'require-oracle' | 'prefer-model' | 'adjust-threshold' | 'assign-worker';
  parameters: Record<string, unknown>;
  status: RuleStatus;
  createdAt: number;
  effectiveness: number;
  specificity: number;
  supersededBy?: string;
  origin?: 'local' | 'a2a' | 'mcp';
}

export interface RulesResponse {
  rules: Rule[];
  counts: { active: number; probation: number; retired: number };
}

export interface OracleAccuracyStats {
  total: number;
  correct: number;
  wrong: number;
  pending: number;
  accuracy: number | null;
}

export interface OracleSummary {
  name: string;
  builtin: boolean;
  tier: string | null;
  timeoutMs: number | null;
  timeoutBehavior: string | null;
  enabled: boolean;
  languages: string[];
  transport: string;
  circuitState: 'closed' | 'open' | 'half-open';
  accuracy: OracleAccuracyStats | null;
}

export interface SleepCycleStatus {
  enabled: boolean;
  interval: number | null;
  totalRuns: number;
  recentRuns: number[];
  patternsExtracted: number;
}

export interface SleepCycleTriggerResult {
  triggered: boolean;
  startedAt: number;
}

export type ShadowStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ShadowJobSummary {
  id: string;
  taskId: string;
  status: ShadowStatus;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
  result?: unknown;
  mutationCount: number;
  mutationFiles: string[];
}

export interface ShadowReport {
  enabled: boolean;
  jobs: ShadowJobSummary[];
  counts: { pending: number; running: number; done: number; failed: number };
}

export interface TraceSummary {
  id: string;
  taskId: string;
  timestamp: number;
  routingLevel: number;
  approach?: string;
  outcome?: string;
  modelUsed?: string;
  tokensConsumed?: number;
  durationMs?: number;
  riskScore?: number;
  taskTypeSignature?: string;
}

export interface TracesResponse {
  traces: TraceSummary[];
  count: number;
  total: number;
}

export interface MemoryProposal {
  filename: string;
  path: string;
  slug: string;
  category: string | null;
  confidence: number | null;
  description: string | null;
  content: string;
}

export interface MemoryProposalsResponse {
  proposals: MemoryProposal[];
}

export interface CalibrationReport {
  enabled: boolean;
  traceCount: number;
  recentBrierScores: number[];
  averageBrier: number | null;
}

export interface HMSRecentTrace {
  id: string;
  taskId: string;
  timestamp: number;
  outcome?: string;
  riskScore: number | null;
  approach?: string;
}

export interface HMSReport {
  config: Record<string, unknown> | null;
  recentTraces: HMSRecentTrace[];
  summary: { totalAnalyzed: number; highRiskCount: number; avgRisk: number | null };
}

export type PeerTrustLevel = 'untrusted' | 'provisional' | 'established' | 'trusted';

export interface PeerTrustRecord {
  peerId: string;
  instanceId: string;
  trustLevel: PeerTrustLevel;
  interactions: number;
  accurate: number;
  wilsonLB: number;
  lastInteraction: number;
  promotedAt?: number;
  demotedAt?: number;
  consecutiveFailures: number;
}

export interface PeersReport {
  enabled: boolean;
  peers: PeerTrustRecord[];
}

export interface ProviderTrustRecord {
  provider: string;
  capability: string;
  successes: number;
  failures: number;
  lastUpdated: number;
  evidenceHash?: string;
}

export interface ProvidersReport {
  enabled: boolean;
  providers: ProviderTrustRecord[];
}

export interface FederationPoolStatus {
  total_contributed_usd: number;
  total_consumed_usd: number;
  remaining_usd: number;
  exhausted: boolean;
}

export interface FederationReport {
  enabled: boolean;
  pool: FederationPoolStatus;
}

export interface MarketPhaseState {
  currentPhase: 'A' | 'B' | 'C' | string;
  auctionCount: number;
  activatedAt?: number;
  lastEvaluatedAt?: number;
}

export interface BidAccuracyRecord {
  bidderId: string;
  settlements: number;
  accurate: number;
  avgPenalty: number;
  lastUpdated: number;
}

export interface MarketReport {
  enabled: boolean;
  active: boolean;
  phase?: MarketPhaseState;
  bidderStats?: BidAccuracyRecord[];
}

export interface CostEntry {
  id: string;
  taskId: string;
  workerId: string | null;
  engineId: string;
  timestamp: number;
  tokens_input: number;
  tokens_output: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  duration_ms: number;
  oracle_invocations: number;
  computed_usd: number;
  cost_tier: 'billing' | 'estimated';
  routing_level: number;
  task_type_signature: string | null;
}

export interface EconomyRecentResponse {
  entries: CostEntry[];
  total: number;
}

export interface CapabilityScore {
  workerId: string;
  fingerprintKey: string;
  score: number;
  samples: number;
  successRate: number;
  lastUpdated?: number;
}

export interface EngineDetail {
  worker: Worker;
  capabilities: CapabilityScore[];
  providerTrust: ProviderTrustRecord | null;
}

export interface SessionClarifications {
  sessionId: string;
  pendingClarifications: string[];
  status: string;
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
  /**
   * Legacy shape — old backends returned `string[]`. New backends (server.ts
   * `getConversationHistoryDetailed`) return a richer structured shape so
   * the chat UI can render a "tools used" chip without re-fetching the
   * trace. Both are accepted to keep older deployments working.
   */
  toolsUsed?: string[] | Array<{ id: string; name: string; inputPreview: string }>;
  /**
   * Slim summary of the ExecutionTrace for this turn — only present on
   * assistant messages where a TraceStore was wired server-side. Powers
   * the model/routing/duration chip row on past assistant bubbles.
   */
  traceSummary?: {
    routingLevel: number;
    modelUsed: string;
    durationMs: number;
    tokensConsumed: number;
    outcome: string;
    approach?: string;
    oracleVerdictCount: number;
    affectedFiles: string[];
  };
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
  getRules: (status?: RuleStatus) =>
    fetchJSON<RulesResponse>(status ? `/rules?status=${status}` : '/rules'),
  getFacts: () => fetchJSON<{ facts: Fact[] }>('/facts'),
  getEconomy: () => fetchJSON<EconomyResponse>('/economy'),
  getAgents: () => fetchJSON<{ agents: AgentListEntry[] }>('/agents'),
  getAgent: (id: string) => fetchJSON<AgentDetail>(`/agents/${encodeURIComponent(id)}`),
  getSkills: (status?: 'active' | 'probation' | 'demoted') =>
    fetchJSON<{ skills: CachedSkill[] }>(status ? `/skills?status=${status}` : '/skills'),
  getPatterns: () => fetchJSON<{ patterns: ExtractedPattern[] }>('/patterns'),
  getDoctor: (deep = false) => fetchJSON<DoctorReport>(`/doctor${deep ? '?deep=true' : ''}`),
  getConfig: () => fetchJSON<ConfigResponse>('/config'),
  validateConfig: (body: unknown) =>
    fetchJSON<ValidationResult>('/config/validate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getMCP: () => fetchJSON<MCPReport>('/mcp'),
  getOracles: () => fetchJSON<{ oracles: OracleSummary[] }>('/oracles'),
  getSleepCycle: () => fetchJSON<SleepCycleStatus>('/sleep-cycle'),
  triggerSleepCycle: () =>
    fetchJSON<SleepCycleTriggerResult>('/sleep-cycle/trigger', { method: 'POST' }),
  getShadow: (status?: ShadowStatus) =>
    fetchJSON<ShadowReport>(status ? `/shadow?status=${status}` : '/shadow'),
  getTraces: (opts?: { limit?: number; outcome?: string; taskType?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.outcome) params.set('outcome', opts.outcome);
    if (opts?.taskType) params.set('taskType', opts.taskType);
    const qs = params.toString();
    return fetchJSON<TracesResponse>(qs ? `/traces?${qs}` : '/traces');
  },
  getMemory: () => fetchJSON<MemoryProposalsResponse>('/memory'),
  approveMemory: (handle: string, reviewer: string) =>
    fetchJSON<{ approved: string; learnedPath: string }>('/memory/approve', {
      method: 'POST',
      body: JSON.stringify({ handle, reviewer }),
    }),
  rejectMemory: (handle: string, reviewer: string, reason: string) =>
    fetchJSON<{ rejected: string; rejectedPath: string }>('/memory/reject', {
      method: 'POST',
      body: JSON.stringify({ handle, reviewer, reason }),
    }),
  getCalibration: () => fetchJSON<CalibrationReport>('/predictions/calibration'),
  getHMS: () => fetchJSON<HMSReport>('/hms'),
  getPeers: () => fetchJSON<PeersReport>('/peers'),
  getProviders: () => fetchJSON<ProvidersReport>('/providers'),
  getFederation: () => fetchJSON<FederationReport>('/federation'),
  getMarket: () => fetchJSON<MarketReport>('/market'),
  getEconomyRecent: (limit = 100) =>
    fetchJSON<EconomyRecentResponse>(`/economy/recent?limit=${limit}`),
  getEngine: (id: string) => fetchJSON<EngineDetail>(`/engines/${encodeURIComponent(id)}`),
  getSessionClarifications: (sessionId: string) =>
    fetchJSON<SessionClarifications>(`/sessions/${encodeURIComponent(sessionId)}/clarifications`),

  // Tasks (auth for mutations)
  getTasks: () => fetchJSON<{ tasks: Task[] }>('/tasks'),
  getTask: (id: string) => fetchJSON<Task>(`/tasks/${id}`),
  submitTask: (body: Record<string, unknown>) =>
    fetchJSON<{ result: TaskResult }>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  submitAsyncTask: (body: Record<string, unknown>) =>
    fetchJSON<{ taskId: string; status: string }>('/tasks/async', { method: 'POST', body: JSON.stringify(body) }),
  cancelTask: (id: string) =>
    fetchJSON<{ taskId: string; status: string }>(`/tasks/${id}`, { method: 'DELETE' }),

  /**
   * Manual retry for a failed/timed-out task. Preserves session, goal,
   * targetFiles, and constraints from the parent. Defaults to a 240s
   * budget on the backend; pass `body.maxDurationMs` or `body.budget`
   * to override.
   */
  retryTask: (
    id: string,
    body?: {
      reason?: string;
      maxDurationMs?: number;
      budget?: { maxTokens: number; maxDurationMs: number; maxRetries: number };
      goal?: string;
      constraints?: string[];
    },
  ) =>
    fetchJSON<{
      taskId: string;
      parentTaskId: string;
      sessionId?: string;
      status: string;
      budget: { maxTokens: number; maxDurationMs: number; maxRetries: number };
    }>(`/tasks/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  /**
   * Persisted bus-event log for a past task. Powers the historical Process
   * card in the chat: feeds the same `reduceTurn` reducer used live to
   * reconstruct the Phase / Tools / Oracles / Plan / Reasoning surfaces.
   *
   * Returns 404 when the backend has no DB / recorder wired — callers
   * should treat that case as "no history available" and fall back to
   * just rendering the trace summary chip row.
   */
  getTaskEventHistory: (taskId: string, since?: number) => {
    const qs = since !== undefined ? `?since=${since}` : '';
    return fetchJSON<{
      taskId: string;
      events: Array<{
        id: string;
        taskId: string;
        sessionId?: string;
        seq: number;
        eventType: string;
        payload: Record<string, unknown>;
        ts: number;
      }>;
      lastSeq: number;
    }>(`/tasks/${encodeURIComponent(taskId)}/event-history${qs}`);
  },

  // Approval (A6)
  getPendingApprovals: () => fetchJSON<{ pending: string[] }>('/approvals'),
  approveTask: (taskId: string, decision: 'approved' | 'rejected') =>
    fetchJSON<{ taskId: string; decision: string }>(`/tasks/${taskId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  // Sessions (auth required)
  getSessions: (params: ListSessionsParams = {}) => {
    const qs = new URLSearchParams();
    if (params.state) qs.set('state', params.state);
    if (params.search) qs.set('search', params.search);
    if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
    if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
    const tail = qs.toString();
    return fetchJSON<{ sessions: Session[] }>(`/sessions${tail ? `?${tail}` : ''}`);
  },
  createSession: (payload: CreateSessionPayload = {}) => {
    const body = {
      source: payload.source ?? 'ui',
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
    };
    return fetchJSON<{ session: Session }>('/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getSession: (id: string) => fetchJSON<{ session: Session }>(`/sessions/${id}`),
  updateSession: (id: string, patch: UpdateSessionPayload) =>
    fetchJSON<{ session: Session }>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  archiveSession: (id: string) =>
    fetchJSON<{ session: Session }>(`/sessions/${id}/archive`, { method: 'POST' }),
  unarchiveSession: (id: string) =>
    fetchJSON<{ session: Session }>(`/sessions/${id}/unarchive`, { method: 'POST' }),
  deleteSession: (id: string) =>
    fetchJSON<{ session: Session }>(`/sessions/${id}`, { method: 'DELETE' }),
  restoreSession: (id: string) =>
    fetchJSON<{ session: Session }>(`/sessions/${id}/restore`, { method: 'POST' }),
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

  // Workflow approval gate (Phase E). Long-form goals pause execution until
  // the user approves the plan; these endpoints resolve the gate.
  approveWorkflow: (sessionId: string, taskId: string) =>
    fetchJSON<{ taskId: string; sessionId: string; status: 'approved' }>(
      `/sessions/${sessionId}/workflow/approve`,
      { method: 'POST', body: JSON.stringify({ taskId }) },
    ),
  rejectWorkflow: (sessionId: string, taskId: string, reason?: string) =>
    fetchJSON<{ taskId: string; sessionId: string; status: 'rejected' }>(
      `/sessions/${sessionId}/workflow/reject`,
      { method: 'POST', body: JSON.stringify({ taskId, reason }) },
    ),

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
