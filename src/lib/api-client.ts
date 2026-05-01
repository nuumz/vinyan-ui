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

/**
 * Coarse classification used by the operations console "Needs action"
 * column. Backend-derived from durable signals only — never inferred
 * from display text. Mirrors the union in `src/api/server.ts`.
 */
export type TaskNeedsActionType =
  | 'none'
  | 'approval'
  | 'workflow-human-input'
  | 'partial-decision'
  | 'coding-cli-approval'
  | 'stale-running'
  | 'failed'
  | 'timeout';

/**
 * Rich task summary returned by `GET /api/v1/tasks`. Backwards compat:
 * the legacy `Task` alias remains so older call-sites keep compiling.
 */
export interface TaskSummary {
  taskId: string;
  sessionId?: string;
  parentTaskId?: string;
  goal?: string;
  /**
   * Projected status — preserves `escalated`, `uncertain`, `partial`,
   * `input-required`, `cancelled`, `timeout` from the underlying
   * `TaskResult.status` instead of collapsing everything non-completed
   * to `failed`.
   */
  status: string;
  dbStatus?: string;
  resultStatus?: string;
  createdAt: number;
  updatedAt: number;
  durationMs?: number;
  routingLevel?: number;
  approach?: string;
  modelUsed?: string;
  workerId?: string | null;
  tokensConsumed?: number;
  qualityScore?: number;
  affectedFiles?: string[];
  errorSummary?: string;
  needsAction: boolean;
  needsActionType: TaskNeedsActionType;
  retryOf?: string;
  retryChildren?: string[];
  hasEventHistory: boolean;
  sessionSource?: string;
  archivedAt?: number | null;
  result?: TaskResult;
}

/** Backwards-compat alias for callers still consuming the old shape. */
export type Task = TaskSummary;

/** Aggregate counts returned alongside the filtered list response. */
export interface TaskCounts {
  byDbStatus: Record<string, number>;
  byStatus: Record<string, number>;
  byNeedsAction: Record<string, number>;
  needsActionTotal: number;
}

export interface ListTasksParams {
  limit?: number;
  offset?: number;
  status?: string | string[];
  sessionId?: string;
  source?: 'ui' | 'api' | 'all';
  search?: string;
  approach?: string;
  routingLevel?: number;
  needsAction?: TaskNeedsActionType | 'any';
  hasError?: boolean;
  from?: number;
  to?: number;
  sort?: 'created-desc' | 'created-asc' | 'updated-desc' | 'updated-asc';
  visibility?: 'active' | 'archived' | 'all';
}

export interface ListTasksResponse {
  tasks: TaskSummary[];
  total: number;
  limit: number;
  offset: number;
  counts: TaskCounts;
}

export interface TaskDetailResponse {
  taskId: string;
  sessionId?: string;
  status: string;
  resultStatus?: string;
  goal?: string;
  taskInput?: {
    id: string;
    goal: string;
    taskType?: string;
    targetFiles?: string[];
    constraints?: string[];
    budget?: { maxTokens: number; maxDurationMs: number; maxRetries: number };
    parentTaskId?: string;
  };
  result?: TaskResult;
  trace?: TaskResult['trace'];
  mutations: TaskResult['mutations'];
  qualityScore?: TaskResult['qualityScore'];
  lifecycle: {
    createdAt?: number;
    updatedAt?: number;
    archivedAt?: number | null;
  };
  lineage: {
    parentTaskId?: string;
    retryChildren: string[];
  };
  pendingApproval?: {
    riskScore: number;
    reason: string;
    requestedAt: number;
  };
  /**
   * Authoritative gate state derived from the persisted event log +
   * durable approval rows — mirrors the row-level needs-action signal
   * but always queryable per task. Use this in the drawer to confirm
   * the gate badge is still actionable. `codingCliApproval` is sourced
   * from `coding_cli_approvals` (durable row), NOT folded from raw
   * `coding-cli:*` events on the client.
   */
  pendingGates?: {
    partialDecision: boolean;
    humanInput: boolean;
    approval: boolean;
    codingCliApproval?: boolean;
  };
  codingCli?: unknown[];
  eventHistory: {
    recorder: boolean;
    eventCount?: number;
  };
  sessionSource?: string;
}

// ── Backend-authoritative process projection (mirror of
// `vinyan-agent/src/api/projections/task-process-projection.ts`).
// Frontend uses these as the single source of truth for lifecycle /
// gates / plan / coding-cli / diagnostics — no client-side reducer
// reconstructs the same fields from raw events. ────────────────────

export type TaskLifecycleStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'escalated'
  | 'timeout'
  | 'cancelled'
  | 'input-required';

export interface TaskProcessLifecycle {
  taskId: string;
  sessionId?: string;
  status: TaskLifecycleStatus;
  dbStatus?: string;
  resultStatus?: string;
  startedAt?: number;
  updatedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  terminalEventType?: string;
  terminalReason?: string;
}

export type TaskProcessCompletenessKind =
  | 'complete'
  | 'terminal-error'
  | 'missing-terminal'
  | 'awaiting-user'
  | 'empty'
  | 'unsupported'
  | 'error';

export interface TaskProcessCompleteness {
  kind: TaskProcessCompletenessKind;
  eventCount: number;
  firstTs?: number;
  lastTs?: number;
  truncated: boolean;
  reason?: string;
}

export interface TaskProcessGate {
  open: boolean;
  resolved: boolean;
  openedAt?: number;
  resolvedAt?: number;
  openedEventId?: string;
  resolvedEventId?: string;
  detail?: Record<string, unknown>;
}

export interface TaskProcessGates {
  approval: TaskProcessGate;
  workflowHumanInput: TaskProcessGate;
  partialDecision: TaskProcessGate;
  codingCliApproval: TaskProcessGate;
}

export interface TaskProcessTodoItem {
  id: string;
  content: string;
  status: string;
  activeForm?: string;
}

export interface TaskProcessPlanStep {
  id: string;
  description: string;
  strategy?: string;
  status: string;
  agentId?: string;
  subTaskId?: string;
  startedAt?: number;
  finishedAt?: number;
  fallbackUsed?: boolean;
}

export interface TaskProcessSubtask {
  subtaskId: string;
  stepId: string;
  status: string;
  agentId?: string;
  startedAt?: number;
  completedAt?: number;
  errorKind?: string;
  errorMessage?: string;
  outputPreview?: string;
}

export interface TaskProcessPlan {
  decisionStage?: string;
  todoList: TaskProcessTodoItem[];
  steps: TaskProcessPlanStep[];
  multiAgentSubtasks: TaskProcessSubtask[];
  groupMode?: string;
  winner?: { agentId?: string; reasoning?: string; runnerUpAgentId?: string };
}

export interface TaskProcessCodingCliPendingApproval {
  requestId: string;
  command: string;
  reason: string;
  policyDecision: string;
  requestedAt: number;
}

export interface TaskProcessCodingCliResolvedApproval {
  requestId: string;
  command: string;
  policyDecision: string;
  humanDecision: string;
  decidedBy: string;
  decidedAt: number;
  requestedAt: number;
}

export interface TaskProcessCodingCliFailureDetail {
  reason?: string;
  at: number;
}

export interface TaskProcessCodingCliCancelDetail {
  by?: string;
  reason?: string;
  at: number;
}

export interface TaskProcessCodingCliStalledDetail {
  idleMs: number;
  at: number;
}

export interface TaskProcessCodingCliSession {
  id: string;
  taskId: string;
  providerId: string;
  state: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  filesChanged: string[];
  commandsRequested: string[];
  pendingApprovals: TaskProcessCodingCliPendingApproval[];
  resolvedApprovals: TaskProcessCodingCliResolvedApproval[];
  finalResult?: unknown;
  failureDetail?: TaskProcessCodingCliFailureDetail;
  cancelDetail?: TaskProcessCodingCliCancelDetail;
  stalledDetail?: TaskProcessCodingCliStalledDetail;
}

export interface TaskProcessPhase {
  name: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface TaskProcessToolCall {
  callId: string;
  tool: string;
  status: string;
  ts: number;
  outputPreview?: string;
}

export interface TaskProcessOracleVerdict {
  oracle: string;
  verdict: string;
  confidence?: number;
  ts: number;
}

export interface TaskProcessEscalation {
  fromLevel?: number;
  toLevel?: number;
  reason?: string;
  ts: number;
}

export interface TaskProcessDiagnostics {
  phases: TaskProcessPhase[];
  toolCalls: TaskProcessToolCall[];
  oracleVerdicts: TaskProcessOracleVerdict[];
  routingLevel?: number;
  escalations: TaskProcessEscalation[];
}

export interface TaskProcessHistory {
  lastSeq: number;
  eventCount: number;
  truncated: boolean;
  descendantTaskIds: string[];
}

export interface TaskProcessProjection {
  lifecycle: TaskProcessLifecycle;
  completeness: TaskProcessCompleteness;
  gates: TaskProcessGates;
  plan: TaskProcessPlan;
  codingCliSessions: TaskProcessCodingCliSession[];
  diagnostics: TaskProcessDiagnostics;
  history: TaskProcessHistory;
}

export interface PendingApproval {
  taskId: string;
  riskScore: number;
  reason: string;
  requestedAt: number;
  /** Distinct approval slot under the same taskId — defaults to `'default'`
   *  on the backend. Surfaced for client-side dedupe and for callers that
   *  need to address a specific slot. */
  approvalKey?: string;
  /** Stable durable id from the approval ledger when wired. Preferred
   *  dedupe key on the client. */
  approvalId?: string;
  profile?: string;
  sessionId?: string;
}

export interface TaskResult {
  id: string;
  status: 'completed' | 'failed' | 'escalated' | 'uncertain' | 'input-required' | 'partial';
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
    workerId?: string | null;
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
  stats?: EngineStats;
}

export interface EngineStats {
  totalTasks: number;
  successRate: number;
  avgQualityScore: number;
  avgDurationMs: number;
  avgTokenCost: number;
  taskTypeBreakdown: Record<
    string,
    {
      count: number;
      successRate: number;
      avgQuality: number;
      avgTokens: number;
    }
  >;
  lastActiveAt: number;
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

// ── Unified Skill Library ──────────────────────────────────────────
// Mirrors `src/api/skill-catalog-service.ts` on the backend. The /skills
// page renders these directly; CRUD endpoints accept the simple write shape.

export type SkillCatalogKind = 'simple' | 'heavy' | 'cached';

export type SimpleSkillScope = 'user' | 'project' | 'user-agent' | 'project-agent';

export interface SkillCatalogItem {
  id: string;
  kind: SkillCatalogKind;
  name: string;
  description: string;
  /** Simple: scope. Heavy: 'artifact-store'. Cached: 'cached_skills'. */
  source: SimpleSkillScope | 'artifact-store' | 'cached_skills';
  scope?: SimpleSkillScope;
  agentId?: string;
  editable: boolean;
  path?: string;
  status?: string;
  trustTier?: string;
  successRate?: number;
  usageCount?: number;
  contentHash?: string;
  lastUpdated?: number;
}

export interface SkillCatalogDetail extends SkillCatalogItem {
  body?: string;
  approach?: string;
  heavyFrontmatter?: Record<string, unknown>;
  files?: string[];
  probationRemaining?: number;
  verificationProfile?: string;
  riskAtCreation?: number;
}

export interface SimpleSkillWriteBody {
  name: string;
  description: string;
  body: string;
  scope?: SimpleSkillScope;
  agentId?: string;
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

/** Single dominant lifecycle label, derived server-side from status + archived/deleted timestamps. */
export type SessionLifecycleState =
  | 'active'
  | 'suspended'
  | 'compacted'
  | 'closed'
  | 'archived'
  | 'trashed';

/** What the session is doing right now — derived from running-task count. */
export type SessionActivityState = 'in-progress' | 'idle' | 'empty';

export interface Session {
  id: string;
  source: string;
  status: 'active' | 'suspended' | 'compacted' | 'closed';
  createdAt: number;
  updatedAt: number;
  taskCount: number;
  /** Subset of taskCount — tasks in `pending` or `running` state. */
  runningTaskCount: number;
  title: string | null;
  description: string | null;
  archivedAt: number | null;
  deletedAt: number | null;
  /**
   * Single dominant lifecycle label. Prefer this over `status` +
   * archivedAt/deletedAt arithmetic in render code — backend already does
   * the priority resolution (trashed > archived > compacted > suspended >
   * active) so the UI just renders a single chip.
   */
  lifecycleState: SessionLifecycleState;
  /** What the session is doing right now (drives "X running" indicators). */
  activityState: SessionActivityState;
}

export type SessionListState = 'active' | 'archived' | 'deleted' | 'all';

/**
 * Origin filter — when omitted the backend defaults to `ui`, which hides
 * sessions created by external clients (curl, scripts, MCP). Pass `'all'`
 * to include those.
 */
export type SessionListSource = 'ui' | 'api' | 'all';

export interface ListSessionsParams {
  state?: SessionListState;
  source?: SessionListSource;
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

// ── External Coding CLI types ────────────────────────────────────────────

export type CodingCliProviderId = 'claude-code' | 'github-copilot';

export interface CodingCliCapabilities {
  headless: boolean;
  interactive: boolean;
  streamProtocol: boolean;
  resume: boolean;
  nativeHooks: boolean;
  jsonOutput: boolean;
  approvalPrompts: boolean;
  toolEvents: boolean;
  fileEditEvents: boolean;
  transcriptAccess: boolean;
  statusCommand: boolean;
  cancelSupport: boolean;
}

export interface CodingCliDetectionResponse {
  providerId: CodingCliProviderId;
  available: boolean;
  binaryPath: string | null;
  version: string | null;
  variant: 'full' | 'limited' | 'unknown';
  notes: string[];
  capabilities: CodingCliCapabilities;
}

export interface CodingCliTaskRequest {
  taskId: string;
  rootGoal: string;
  cwd: string;
  sessionId?: string;
  providerId?: CodingCliProviderId;
  mode?: 'headless' | 'interactive' | 'auto';
  allowedScope?: string[];
  forbiddenScope?: string[];
  approvalPolicy?: {
    autoApproveReadOnly?: boolean;
    requireHumanForWrites?: boolean;
    requireHumanForShell?: boolean;
    requireHumanForGit?: boolean;
    allowDangerousSkipPermissions?: boolean;
  };
  model?: string;
  notes?: string;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  maxOutputBytes?: number;
  correlationId?: string;
}

export interface CodingCliResultClaim {
  status: 'completed' | 'failed' | 'blocked' | 'needs_approval' | 'partial';
  providerId: CodingCliProviderId;
  summary: string;
  changedFiles: string[];
  commandsRun: string[];
  testsRun: string[];
  decisions: Array<{ decision: string; reason: string; alternatives: string[] }>;
  verification: { claimedPassed: boolean; details: string };
  blockers: string[];
  requiresHumanReview: boolean;
}

export interface CodingCliVerificationOutcome {
  passed: boolean;
  oracleVerdicts: Array<{ name: string; ok: boolean; detail?: string }>;
  testResults?: { passed: number; failed: number; skipped: number };
  predictionError?: { claimed: boolean; actual: boolean; reason: string };
  reason?: string;
}

export interface CodingCliLiveSession {
  id: string;
  taskId: string;
  providerId: CodingCliProviderId;
  state: string;
  capabilities: CodingCliCapabilities;
  filesChanged: string[];
  commandsRequested?: string[];
  result?: CodingCliResultClaim | null;
  timings: {
    createdAt: number;
    startedAt: number | null;
    endedAt: number | null;
    lastOutputAt: number | null;
    lastHookAt: number | null;
  };
}

export interface CodingCliPersistedSession {
  id: string;
  taskId: string;
  sessionId: string | null;
  providerId: CodingCliProviderId;
  binaryPath: string;
  binaryVersion: string | null;
  capabilities: CodingCliCapabilities;
  cwd: string;
  pid: number | null;
  state: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  filesChanged: string[];
  commandsRequested: string[];
  finalResult: CodingCliResultClaim | null;
}

export interface CodingCliPersistedEvent {
  id: string;
  coding_cli_session_id: string;
  task_id: string;
  seq: number;
  event_type: string;
  payload_json: string;
  ts: number;
}

export interface CodingCliCreateSessionResponse {
  sessionId: string;
  state: string;
  providerId?: CodingCliProviderId;
  capabilities?: CodingCliCapabilities;
  mode?: 'headless' | 'interactive';
  claim?: CodingCliResultClaim | null;
  verification?: CodingCliVerificationOutcome;
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
    /** Worker / agent that ran the turn (e.g. `'developer'`). */
    workerId?: string;
  };
  tokenEstimate: number;
}

export interface SessionDetail {
  id: string;
  pendingClarifications: string[];
}

// ── Governance (A8) ────────────────────────────────────

export type GovernanceAvailability = 'available' | 'unavailable';

export interface GovernanceTraceSummary {
  traceId: string;
  taskId: string;
  outcome: string;
  routingLevel: number;
  timestamp: number;
  availability: GovernanceAvailability;
  decisionId?: string;
  policyVersion?: string;
  governanceActor?: string;
  wasGeneratedBy?: string;
  decidedAt?: number;
  evidenceObservedAt?: number;
  reason?: string;
  escalationPath?: number[];
  evidenceCount: number;
}

export interface GovernanceSearchResponse {
  rows: GovernanceTraceSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface GovernanceEvidenceReference {
  source: string;
  kind: string;
  fileHash?: string;
  observedAt?: number;
  detail?: string;
}

export interface GoalGroundingCheck {
  phase: string;
  action: string;
  reason: string;
  goalDrift?: boolean;
  freshnessDowngraded?: boolean;
  staleFactCount?: number;
  policyVersion?: string;
}

export interface DecisionReplaySummary {
  decisionId: string;
  availability: GovernanceAvailability;
  traceId: string;
  taskId: string;
  outcome: string;
  routingLevel: number;
  timestamp: number;
  policyVersion?: string;
  attributedTo?: string;
  wasGeneratedBy?: string;
  decidedAt?: number;
  evidenceObservedAt?: number;
  reason?: string;
  escalationPath?: number[];
  evidence: GovernanceEvidenceReference[];
  goalGrounding?: GoalGroundingCheck[];
  pipelineConfidence?: { composite: number };
  confidenceDecision?: unknown;
}

export interface GovernanceSearchFilters {
  decisionId?: string;
  policyVersion?: string;
  actor?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

// ── Degradation Status (A9) ────────────────────────────

export type DegradationHealthStatus = 'healthy' | 'degraded' | 'partial-outage' | 'unavailable';

export interface DegradationStatusEntry {
  component: string;
  failureType: string;
  action: string;
  capabilityImpact: string;
  severity: string;
  policyVersion: string;
  reason: string;
  sourceEvent: string;
  occurredAt: number;
  lastTaskId?: string;
}

export interface DegradationStatusSnapshot {
  total: number;
  entries: DegradationStatusEntry[];
  failClosedCount: number;
  generatedAt: number;
}

export interface DegradationHealthResponse {
  status: DegradationHealthStatus;
  snapshot?: DegradationStatusSnapshot;
  reason?: string;
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

// ── Scheduler types (mirror src/api/server.ts:projectScheduleJob) ─────

/** Wire shape of a scheduled job in the operations console. */
export interface ScheduledJob {
  id: string;
  profile: string;
  cron: string;
  timezone: string;
  goal: string;
  /** `'active' | 'paused' | 'expired' | 'failed-circuit'`. */
  status: string;
  nextFireAt: number | null;
  failureStreak: number;
  createdAt: number;
  nlOriginal: string;
  origin: { platform: string; chatId: string | null; threadKey?: string };
  constraintKeys: string[];
  runCount: number;
  lastRun: { ranAt: number; taskId: string; outcome: string } | null;
}

export interface CreateScheduledJobBody {
  goal: string;
  /** Either a literal cron expression OR a natural-language phrase. */
  cron?: string;
  nl?: string;
  timezone?: string;
  constraints?: Record<string, unknown>;
  profile?: string;
}

// ── Skill proposal types (mirror src/db/skill-proposal-store.ts) ──────

export type SkillProposalStatus = 'pending' | 'approved' | 'rejected' | 'quarantined';
export type SkillProposalTrust = 'quarantined' | 'community' | 'trusted' | 'official' | 'builtin';

export interface SkillProposal {
  id: string;
  profile: string;
  status: SkillProposalStatus;
  proposedName: string;
  proposedCategory: string;
  skillMd: string;
  capabilityTags: ReadonlyArray<string>;
  toolsRequired: ReadonlyArray<string>;
  sourceTaskIds: ReadonlyArray<string>;
  evidenceEventIds: ReadonlyArray<string>;
  successCount: number;
  safetyFlags: ReadonlyArray<string>;
  trustTier: SkillProposalTrust;
  createdAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  decisionReason: string | null;
  /**
   * Latest revision number for this proposal (G2-extension). The
   * editor hands this back as `expectedRevision` for optimistic
   * locking — it ships with the proposal entity so there's no race
   * window where revisions hasn't loaded yet.
   */
  latestRevision: number;
}

/** R2: SKILL.md draft revision audit-trail row. */
export interface SkillProposalRevision {
  id: number;
  profile: string;
  proposalId: string;
  revision: number;
  skillMd: string;
  safetyFlags: ReadonlyArray<string>;
  actor: string;
  reason: string | null;
  createdAt: number;
}

/** R1 diagnostics payload — what `/autogen-policy` returns. */
export interface AutogenPolicySnapshotResponse {
  profile: string;
  threshold: number | null;
  enabled: boolean;
  explanation: string | null;
  signals: {
    pendingCount: number;
    acceptanceRate: number;
    quarantineRate: number;
    totalCreated: number;
    totalDecided: number;
    totalQuarantined: number;
  } | null;
  computedAt: number;
  ledger: {
    recentChanges: number;
    history: Array<{
      id: number;
      ts: number;
      oldValue: unknown;
      newValue: unknown;
      reason: string;
      ownerModule: string;
    }>;
  };
  tracker: {
    rows: number;
    cooldownActive: number;
    bootId: string | null;
  };
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
  /**
   * Export a single agent's full context (episodes + proficiencies + lessons)
   * as a JSON snapshot. Used by the Agent drawer "Export context" button so
   * an operator can take a backup before any reset / migration.
   */
  exportAgentContext: (id: string) =>
    fetchJSON<{ agentId: string; context: AgentContextDetail; exportedAt: number }>(
      `/agents/${encodeURIComponent(id)}/context/export`,
    ),
  /**
   * Operator action — remove ONE proficiency entry from an agent's context
   * by task signature. Idempotent. Audit logged on the server.
   */
  resetProficiency: (id: string, signature: string, reason?: string) =>
    fetchJSON<{ ok: true; removed: boolean; signature: string; remaining?: number }>(
      `/agents/${encodeURIComponent(id)}/proficiencies/reset`,
      {
        method: 'POST',
        body: JSON.stringify({ signature, ...(reason ? { reason } : {}) }),
      },
    ),
  getSkills: (filter?: { kind?: SkillCatalogKind; agentId?: string; status?: 'active' | 'probation' | 'demoted' }) => {
    const params = new URLSearchParams();
    if (filter?.kind) params.set('kind', filter.kind);
    if (filter?.agentId) params.set('agentId', filter.agentId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString();
    // Server always returns `items[]`; legacy `skills[]` mirror is kept for
    // back-compat but the UI consumes the unified shape.
    return fetchJSON<{ items?: SkillCatalogItem[]; skills: SkillCatalogItem[] | CachedSkill[] }>(
      qs ? `/skills?${qs}` : '/skills',
    );
  },
  getSkill: (id: string) => fetchJSON<SkillCatalogDetail>(`/skills/${encodeURIComponent(id)}`),
  createSkill: (body: SimpleSkillWriteBody) =>
    fetchJSON<{ id: string; path: string }>('/skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSkill: (id: string, body: SimpleSkillWriteBody) =>
    fetchJSON<{ id: string }>(`/skills/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteSkill: (id: string) =>
    // 204 No Content — fetchJSON expects parseable JSON, so use a typed `as`.
    fetch(`${API}/skills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((res) => {
      if (!res.ok) throw new Error(`DELETE /skills failed: ${res.status}`);
      return { ok: true } as const;
    }),
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
  getTraces: (opts?: {
    limit?: number;
    outcome?: string;
    /** Canonical fingerprint filter — `actionVerb::framework::blastRadius`. */
    taskSignature?: string;
    /** Legacy alias — kept for back-compat. Server resolves either to the same column. */
    taskType?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.outcome) params.set('outcome', opts.outcome);
    if (opts?.taskSignature) params.set('taskSignature', opts.taskSignature);
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

  // Governance (A8)
  searchGovernance: (filters: GovernanceSearchFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.decisionId) params.set('decisionId', filters.decisionId);
    if (filters.policyVersion) params.set('policyVersion', filters.policyVersion);
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.from != null) params.set('from', String(filters.from));
    if (filters.to != null) params.set('to', String(filters.to));
    if (filters.limit != null) params.set('limit', String(filters.limit));
    if (filters.offset != null) params.set('offset', String(filters.offset));
    const qs = params.toString();
    return fetchJSON<GovernanceSearchResponse>(qs ? `/governance/search?${qs}` : '/governance/search');
  },
  replayGovernanceDecision: (decisionId: string) =>
    fetchJSON<DecisionReplaySummary>(`/governance/decisions/${encodeURIComponent(decisionId)}/replay`),

  // Degradation status (A9)
  getDegradationHealth: () => fetchJSON<DegradationHealthResponse>('/health/degradation'),

  // Tasks (auth for mutations)
  getTasks: (params: ListTasksParams = {}) => {
    const qs = new URLSearchParams();
    if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
    if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
    if (params.sessionId) qs.set('sessionId', params.sessionId);
    if (params.source) qs.set('source', params.source);
    if (params.search) qs.set('search', params.search);
    if (params.approach) qs.set('approach', params.approach);
    if (typeof params.routingLevel === 'number') qs.set('routingLevel', String(params.routingLevel));
    if (params.needsAction) qs.set('needsAction', params.needsAction);
    if (params.hasError) qs.set('hasError', 'true');
    if (typeof params.from === 'number') qs.set('from', String(params.from));
    if (typeof params.to === 'number') qs.set('to', String(params.to));
    if (params.sort) qs.set('sort', params.sort);
    if (params.visibility) qs.set('visibility', params.visibility);
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      for (const s of statuses) qs.append('status', s);
    }
    const tail = qs.toString();
    return fetchJSON<ListTasksResponse>(tail ? `/tasks?${tail}` : '/tasks');
  },
  getTask: (id: string) => fetchJSON<TaskDetailResponse>(`/tasks/${id}`),
  submitTask: (body: Record<string, unknown>) =>
    fetchJSON<{ result: TaskResult }>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  submitAsyncTask: (body: Record<string, unknown>) =>
    fetchJSON<{ taskId: string; status: string }>('/tasks/async', { method: 'POST', body: JSON.stringify(body) }),
  cancelTask: (id: string) =>
    fetchJSON<{ taskId: string; status: string }>(`/tasks/${id}`, { method: 'DELETE' }),

  /** Soft-hide a task row from the active operations console list. */
  archiveTask: (id: string) =>
    fetchJSON<{ taskId: string; archived: boolean }>(`/tasks/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    }),
  /** Restore an archived task row. */
  unarchiveTask: (id: string) =>
    fetchJSON<{ taskId: string; archived: boolean }>(
      `/tasks/${encodeURIComponent(id)}/unarchive`,
      { method: 'POST' },
    ),
  /**
   * Bundled JSON snapshot — task summary + result + persisted event log.
   * The same payload shape can be re-played by the historical replay
   * reducer, so a saved export is a portable record of the run.
   */
  exportTask: (id: string) =>
    fetchJSON<Record<string, unknown>>(`/tasks/${encodeURIComponent(id)}/export`),

  /**
   * Manual retry for a failed/timed-out task. Preserves session, goal,
   * targetFiles, and constraints from the parent. The retry budget is
   * a backend policy decision — the server reads the parent's persisted
   * state and picks the right shape (timeout-recovery vs standard).
   * The chosen policy is echoed back in the response as `policy`.
   *
   * `body.budget` / `body.maxDurationMs` remain accepted as escape
   * hatches for operator overrides; the response then reports
   * `policy: 'client-override'`. Standard UI flows (the Tasks console
   * retry button) MUST NOT send these fields — the policy belongs to
   * the backend.
   */
  retryTask: (
    id: string,
    body?: {
      reason?: string;
      /** Operator override only — UI default flows omit this. */
      maxDurationMs?: number;
      /** Operator override only — UI default flows omit this. */
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
      /** Which retry policy the server applied — 'timeout' / 'standard' / 'client-override'. */
      policy: 'timeout' | 'standard' | 'client-override';
    }>(`/tasks/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  /**
   * Persisted bus-event log for a past task. Powers the historical Process
   * card in the chat: feeds the same `reduceTurn` reducer used live to
   * reconstruct the Phase / Tools / Oracles / Plan / Reasoning surfaces.
   *
   * Defaults to `includeDescendants: true` so the Multi-agent card's
   * expandable rows can render per-sub-agent tool calls — sub-agent
   * `agent:tool_*` events live under the child's own `taskId`, which the
   * legacy per-task filter does not return. The reducer's `subTaskIdIndex`
   * map (built from `workflow:delegate_dispatched.subTaskId`) pins those
   * events to the correct delegate row, so no consumer-side aggregation
   * is required. Tasks without delegates degrade cleanly — the response
   * just contains the parent's events.
   *
   * Response shape note: backend returns `lastSeq` in legacy mode and
   * `nextCursor` (+ `taskIds`, `truncated`) in descendants mode. Existing
   * consumers only read `events`, so both shapes work.
   *
   * Returns 404 when the backend has no DB / recorder wired — callers
   * should treat that case as "no history available" and fall back to
   * just rendering the trace summary chip row.
   */
  getTaskEventHistory: (
    taskId: string,
    opts?: { since?: number | string; includeDescendants?: boolean; maxDepth?: number },
  ) => {
    const params = new URLSearchParams();
    const includeDescendants = opts?.includeDescendants ?? true;
    if (includeDescendants) params.set('includeDescendants', 'true');
    if (opts?.maxDepth !== undefined) params.set('maxDepth', String(opts.maxDepth));
    if (opts?.since !== undefined) params.set('since', String(opts.since));
    const qs = params.toString();
    return fetchJSON<{
      taskId: string;
      /** Present in descendants mode — the resolved tree root (== taskId). */
      rootTaskId?: string;
      /** Present in descendants mode — the discovered descendant taskIds. */
      taskIds?: string[];
      events: Array<{
        id: string;
        taskId: string;
        sessionId?: string;
        seq: number;
        eventType: string;
        payload: Record<string, unknown>;
        ts: number;
      }>;
      /** Legacy mode — per-task seq cursor. */
      lastSeq?: number;
      /** Descendants mode — opaque `<ts>:<id>` cursor for cross-task pagination. */
      nextCursor?: string;
      /** Descendants mode — true when the resolver hit the 64-task cap. */
      truncated?: boolean;
    }>(`/tasks/${encodeURIComponent(taskId)}/event-history${qs ? `?${qs}` : ''}`);
  },

  /**
   * Backend-authoritative process projection for a task. Use this — not
   * raw `/event-history` — to render lifecycle / gate / plan / coding-cli
   * state in the UI. The backend folds the durable event log + approval
   * ledger + coding-cli store into a single canonical projection so the
   * client stays a thin renderer (no client-side reducers reconstructing
   * canonical state).
   *
   * Returns 404 when the task is unknown to every backing store.
   */
  getTaskProcessState: (taskId: string) =>
    fetchJSON<TaskProcessProjection>(`/tasks/${encodeURIComponent(taskId)}/process-state`),

  // Approval (A6)
  getPendingApprovals: () => fetchJSON<{ pending: PendingApproval[] }>('/approvals'),
  approveTask: (taskId: string, decision: 'approved' | 'rejected') =>
    fetchJSON<{ taskId: string; decision: string }>(`/tasks/${taskId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  // Sessions (auth required)
  getSessions: (params: ListSessionsParams = {}) => {
    const qs = new URLSearchParams();
    if (params.state) qs.set('state', params.state);
    if (params.source) qs.set('source', params.source);
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
   * Workflow paused on a `human-input` step (e.g. "Ask the user for the
   * topic"). The user's answer becomes that step's output and downstream
   * dependents continue. Backend emits `workflow:human_input_provided` on
   * the bus, which resolves the executor's wait.
   */
  provideWorkflowHumanInput: (
    sessionId: string,
    args: { taskId: string; stepId: string; value: string },
  ) =>
    fetchJSON<{
      taskId: string;
      stepId: string;
      sessionId: string;
      status: 'recorded';
    }>(`/sessions/${sessionId}/workflow/human-input`, {
      method: 'POST',
      body: JSON.stringify(args),
    }),

  /**
   * Ask the backend LLM for `count` candidate answers to a workflow
   * `human-input` question — surfaced as chips on the inline answer card
   * so the user has a starting point when stuck. The endpoint returns
   * 502 when the LLM is unavailable / unparseable; callers should treat
   * that as "no suggestions" and keep the type-your-own-answer flow.
   */
  suggestWorkflowHumanInput: (
    sessionId: string,
    args: { taskId: string; stepId: string; question: string; count?: number },
  ) =>
    fetchJSON<{
      taskId: string;
      stepId: string;
      sessionId: string;
      suggestions: string[];
    }>(`/sessions/${sessionId}/workflow/human-input/suggest`, {
      method: 'POST',
      body: JSON.stringify(args),
    }),

  /**
   * Workflow paused on a partial-failure decision gate — fires after a
   * `delegate-sub-agent` step failed AND its cascade caused a dependent
   * step to skip. The user picks `'continue'` (ship the deterministic
   * aggregation of survivors as `partial`) or `'abort'` (fail the task
   * with rationale). Backend emits `workflow:partial_failure_decision_provided`,
   * which resolves the executor's wait. Timeout default is 3 min — if no
   * decision arrives the executor self-aborts with `auto: true`.
   */
  providePartialFailureDecision: (
    sessionId: string,
    args: { taskId: string; decision: 'continue' | 'abort'; rationale?: string },
  ) =>
    fetchJSON<{
      taskId: string;
      sessionId: string;
      decision: 'continue' | 'abort';
      status: 'recorded';
    }>(`/sessions/${sessionId}/workflow/partial-decision`, {
      method: 'POST',
      body: JSON.stringify(args),
    }),

  // ── External Coding CLI (Claude Code / GitHub Copilot) ─────────────
  // The bus events flow through `useSSESync` + `reduceTurn` already; these
  // endpoints are for the imperative actions: pick provider, start session,
  // send follow-ups, approve/reject prompts, cancel, replay history.
  codingCli: {
    listProviders: (refresh?: boolean) =>
      fetchJSON<{ providers: CodingCliDetectionResponse[] }>(
        `/coding-cli/providers${refresh ? '?refresh=1' : ''}`,
      ),
    listSessions: () =>
      fetchJSON<{
        live: CodingCliLiveSession[];
        persisted: CodingCliPersistedSession[];
      }>('/coding-cli/sessions'),
    getSession: (sessionId: string) =>
      fetchJSON<CodingCliLiveSession | { session: CodingCliPersistedSession }>(
        `/coding-cli/sessions/${encodeURIComponent(sessionId)}`,
      ),
    createSession: (params: {
      task: CodingCliTaskRequest;
      providerId?: 'claude-code' | 'github-copilot';
      headless?: boolean;
    }) =>
      fetchJSON<CodingCliCreateSessionResponse>('/coding-cli/sessions', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    runHeadless: (params: { task: CodingCliTaskRequest; providerId?: 'claude-code' | 'github-copilot' }) =>
      fetchJSON<CodingCliCreateSessionResponse>('/coding-cli/run', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    sendMessage: (sessionId: string, text: string) =>
      fetchJSON<{ delivered: boolean }>(
        `/coding-cli/sessions/${encodeURIComponent(sessionId)}/message`,
        { method: 'POST', body: JSON.stringify({ text }) },
      ),
    approve: (sessionId: string, taskId: string, requestId: string) =>
      fetchJSON<{ resolved: boolean; decision: 'approved' }>(
        `/coding-cli/sessions/${encodeURIComponent(sessionId)}/approve`,
        { method: 'POST', body: JSON.stringify({ taskId, requestId }) },
      ),
    reject: (sessionId: string, taskId: string, requestId: string) =>
      fetchJSON<{ resolved: boolean; decision: 'rejected' }>(
        `/coding-cli/sessions/${encodeURIComponent(sessionId)}/reject`,
        { method: 'POST', body: JSON.stringify({ taskId, requestId }) },
      ),
    cancel: (sessionId: string, reason?: string) =>
      fetchJSON<{ cancelled: boolean }>(
        `/coding-cli/sessions/${encodeURIComponent(sessionId)}/cancel`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      ),
    getEvents: (sessionId: string, opts: { since?: number; limit?: number } = {}) => {
      const qs = new URLSearchParams();
      if (opts.since !== undefined) qs.set('since', String(opts.since));
      if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
      const tail = qs.toString();
      return fetchJSON<{ events: CodingCliPersistedEvent[] }>(
        `/coding-cli/sessions/${encodeURIComponent(sessionId)}/events${tail ? `?${tail}` : ''}`,
      );
    },
  },

  // ── Scheduler — durable agent cron ──────────────────────────────────
  /**
   * `GET /api/v1/scheduler/jobs` — list scheduled jobs for the
   * resolved profile. `?profile=*` admin override; `?status=` filter.
   */
  getScheduledJobs: (params: { status?: string; profile?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.profile) qs.set('profile', params.profile);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const tail = qs.toString();
    return fetchJSON<{
      jobs: ScheduledJob[];
      total: number;
      profile: string;
    }>(`/scheduler/jobs${tail ? `?${tail}` : ''}`);
  },
  getScheduledJob: (id: string) => fetchJSON<{ job: ScheduledJob }>(`/scheduler/jobs/${encodeURIComponent(id)}`),
  createScheduledJob: (body: CreateScheduledJobBody) =>
    fetchJSON<{ job: ScheduledJob }>(`/scheduler/jobs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateScheduledJob: (id: string, body: Partial<CreateScheduledJobBody>) =>
    fetchJSON<{ job: ScheduledJob; unchanged?: boolean }>(`/scheduler/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  pauseScheduledJob: (id: string) =>
    fetchJSON<{ job: ScheduledJob | null; unchanged?: boolean }>(
      `/scheduler/jobs/${encodeURIComponent(id)}/pause`,
      { method: 'POST', body: '{}' },
    ),
  resumeScheduledJob: (id: string) =>
    fetchJSON<{ job: ScheduledJob | null; unchanged?: boolean }>(
      `/scheduler/jobs/${encodeURIComponent(id)}/resume`,
      { method: 'POST', body: '{}' },
    ),
  runScheduledJobNow: (id: string) =>
    fetchJSON<{ scheduleId: string; taskId: string; status: string }>(
      `/scheduler/jobs/${encodeURIComponent(id)}/run`,
      { method: 'POST', body: '{}' },
    ),
  deleteScheduledJob: (id: string) =>
    fetchJSON<{ deleted: boolean; scheduleId: string }>(
      `/scheduler/jobs/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  // ── Skill proposals — agent-managed procedural memory ───────────────
  getSkillProposals: (params: { status?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const tail = qs.toString();
    return fetchJSON<{
      proposals: SkillProposal[];
      total: number;
      profile: string;
    }>(`/skill-proposals${tail ? `?${tail}` : ''}`);
  },
  getSkillProposal: (id: string) =>
    fetchJSON<{ proposal: SkillProposal }>(`/skill-proposals/${encodeURIComponent(id)}`),
  approveSkillProposal: (id: string, body: { decidedBy: string; reason: string }) =>
    fetchJSON<{ proposal: SkillProposal }>(`/skill-proposals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rejectSkillProposal: (id: string, body: { decidedBy: string; reason: string }) =>
    fetchJSON<{ proposal: SkillProposal }>(`/skill-proposals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setSkillProposalTrustTier: (id: string, body: { tier: string; decidedBy: string; reason: string }) =>
    fetchJSON<{ proposal: SkillProposal; decidedBy: string }>(
      `/skill-proposals/${encodeURIComponent(id)}/trust-tier`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  deleteSkillProposal: (id: string) =>
    fetchJSON<{ deleted: boolean; proposalId: string }>(
      `/skill-proposals/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
  /**
   * Live safety-scan preview. R2: pure scanner, no DB writes; the
   * editor calls this on a debounced timer as the operator types.
   */
  scanSkillProposalDraft: (skillMd: string) =>
    fetchJSON<{ safe: boolean; flags: string[]; scannedAt: number }>(`/skill-proposals/scan`, {
      method: 'POST',
      body: JSON.stringify({ skillMd }),
    }),
  /**
   * Persist an edited SKILL.md draft. Returns the updated proposal +
   * the revision number. Status flips between `pending` and
   * `quarantined` based on the safety verdict applied to the new
   * bytes.
   */
  patchSkillProposalDraft: (
    id: string,
    body: {
      skillMd: string;
      actor: string;
      reason?: string;
      /** G2 optimistic-locking expectation — current revision the operator was viewing. */
      expectedRevision?: number;
    },
  ) =>
    fetchJSON<{ proposal: SkillProposal; revision: number }>(
      `/skill-proposals/${encodeURIComponent(id)}/draft`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  /** R2 audit trail — list proposal revisions newest-first. */
  getSkillProposalRevisions: (id: string, limit = 50) =>
    fetchJSON<{ revisions: SkillProposalRevision[]; total: number }>(
      `/skill-proposals/${encodeURIComponent(id)}/revisions?limit=${limit}`,
    ),
  /**
   * R1 diagnostics — surfaces the live adaptive threshold, signals
   * that drove it, and the ledger tail.
   */
  getAutogenPolicySnapshot: () =>
    fetchJSON<AutogenPolicySnapshotResponse>(`/skill-proposals/autogen-policy`),

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
