/**
 * AuditView — A8 unified audit surface (Phase 3 expansion).
 *
 * Six tabs that let a reviewer answer the audit-redesign questions:
 *
 *   1. Reasoning   — chain-of-thought rows, scoped by actor
 *   2. Tool calls  — 6-state lifecycle pills with capability-token + denyReason detail
 *   3. Decisions   — decision + verdict rows with rule/oracle/tier provenance
 *   4. Hierarchy   — collapsible 6-level tree (Session → Workflow → Task →
 *                    Sub-Task → Agent → Sub-Agent). Click a node scopes the
 *                    other tabs to that node's audit entries.
 *   5. Final       — kind:'final' rows with chips linking to assembling steps
 *                    and sub-agents. Clicking a chip scopes other tabs.
 *   6. Trace       — raw entry table; debug pane.
 *
 * Plus three cross-tab affordances landed in Phase 3:
 *
 *   - Timeline scrubber (top): one tick per entry, click jumps every tab
 *     to that ts. Tick array memoized on auditLog reference identity.
 *   - Provenance footer (bottom): policy / models / oracles / capability
 *     tokens summary + drawer. Click expands.
 *   - Per-section completeness banner: surfaces section-specific copy
 *     (e.g. "CoT incomplete: 3 trailing deltas without close") — never
 *     a generic "incomplete" message.
 *
 * Live + historical parity: same render path. Historical mode is
 * currently distinguished only by the parent's polling cadence (the hook
 * controls that). Interactive gate buttons are off-limits here — gates
 * live in `<InterruptBanner>` and `<PartialDecisionCard>`.
 */
import { Activity, Brain, ChevronRight, FileSearch, Filter, Gavel, GitBranch, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuditEntry,
  TaskProcessByEntity,
  TaskProcessProvenance,
  TaskProcessSectionCompleteness,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { SessionCard } from './session-card';

export type AuditTab = 'reasoning' | 'tools' | 'decisions' | 'hierarchy' | 'final' | 'trace';

interface AuditViewProps {
  auditLog: readonly AuditEntry[];
  completenessBySection?: readonly TaskProcessSectionCompleteness[];
  /** Phase 3: provenance roll-up for the footer. */
  provenance?: TaskProcessProvenance;
  /** Phase 3: id rollup for the Hierarchy tab. */
  byEntity?: TaskProcessByEntity;
  /** Initial tab. Defaults to 'reasoning' when there are thoughts, else 'decisions'. */
  defaultTab?: AuditTab;
  className?: string;
}

const TAB_DEFS: Array<{ id: AuditTab; label: string; icon: typeof Brain }> = [
  { id: 'reasoning', label: 'Reasoning', icon: Brain },
  { id: 'tools', label: 'Tool calls', icon: Activity },
  { id: 'decisions', label: 'Decisions', icon: Gavel },
  { id: 'hierarchy', label: 'Hierarchy', icon: GitBranch },
  { id: 'final', label: 'Final', icon: Trophy },
  { id: 'trace', label: 'Trace', icon: FileSearch },
];

interface FocusState {
  /** Audit-entry ts the scrubber pinned. Tabs scroll their matching row into view. */
  focusedTs?: number;
  /** Audit-entry id the scrubber pinned (more precise than ts when multiple entries share ts). */
  focusedId?: string;
  /** Sub-agent id selected from Hierarchy or Final. Tabs filter rows. */
  focusedSubAgentId?: string;
  /** Sub-task id selected from Hierarchy or Final. Tabs filter rows. */
  focusedSubTaskId?: string;
}

export function AuditView({
  auditLog,
  completenessBySection = [],
  provenance,
  byEntity,
  defaultTab,
  className,
}: AuditViewProps) {
  const counts = useMemo(() => countByKind(auditLog), [auditLog]);
  const initialTab = defaultTab ?? (counts.thoughts > 0 ? 'reasoning' : 'decisions');
  const [tab, setTab] = useState<AuditTab>(initialTab);
  const [filter, setFilter] = useState('');
  const [focus, setFocus] = useState<FocusState>({});
  const [provenanceOpen, setProvenanceOpen] = useState(false);

  if (auditLog.length === 0) return null;

  const focusEntry = (entry: AuditEntry) => setFocus({ focusedTs: entry.ts, focusedId: entry.id });
  const focusSubAgent = (subAgentId: string | undefined) =>
    setFocus((f) => ({ ...f, focusedSubAgentId: subAgentId }));
  const focusSubTask = (subTaskId: string | undefined) => setFocus((f) => ({ ...f, focusedSubTaskId: subTaskId }));

  const scopedEntries = useMemo(() => {
    if (!focus.focusedSubAgentId && !focus.focusedSubTaskId) return auditLog;
    return auditLog.filter((e) => {
      if (focus.focusedSubAgentId && e.subAgentId !== focus.focusedSubAgentId) {
        if (!(e.kind === 'subagent' && e.subAgentId === focus.focusedSubAgentId)) {
          if (!(e.kind === 'plan_step' && e.subAgentId === focus.focusedSubAgentId)) {
            return false;
          }
        }
      }
      if (focus.focusedSubTaskId && e.subTaskId !== focus.focusedSubTaskId) {
        if (!(e.kind === 'subtask' && e.subTaskId === focus.focusedSubTaskId)) return false;
      }
      return true;
    });
  }, [auditLog, focus.focusedSubAgentId, focus.focusedSubTaskId]);

  return (
    <SessionCard variant="secondary" className={cn('flex flex-col', className)}>
      <CompletenessBanner completeness={completenessBySection} />

      <Scrubber entries={auditLog} focusedId={focus.focusedId} onPick={focusEntry} />

      <header className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {TAB_DEFS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const count = tabCount(id, counts);
            return (
              <button
                type="button"
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs transition-colors',
                  active ? 'bg-bg/40 font-medium text-text' : 'text-text-muted hover:bg-bg/20 hover:text-text',
                )}
                aria-pressed={active}
              >
                <Icon size={14} aria-hidden />
                <span>{label}</span>
                {count > 0 && <span className="rounded-sm bg-bg/30 px-1 text-text-muted">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {(focus.focusedSubAgentId || focus.focusedSubTaskId) && (
            <button
              type="button"
              onClick={() => setFocus({})}
              className="rounded-sm bg-bg/30 px-2 py-0.5 text-2xs text-text-muted hover:bg-bg/40"
              title="Clear scope filter"
            >
              clear scope
            </button>
          )}
          <FilterInput value={filter} onChange={setFilter} />
        </div>
      </header>

      <div className="flex-1 px-3 py-2">
        {tab === 'reasoning' && (
          <ReasoningTab entries={scopedEntries} filter={filter} completeness={completenessBySection} focus={focus} />
        )}
        {tab === 'tools' && <ToolCallsTab entries={scopedEntries} filter={filter} focus={focus} />}
        {tab === 'decisions' && <DecisionsTab entries={scopedEntries} filter={filter} focus={focus} />}
        {tab === 'hierarchy' && (
          <HierarchyTab
            byEntity={byEntity}
            entries={auditLog}
            focus={focus}
            onFocusSubAgent={focusSubAgent}
            onFocusSubTask={focusSubTask}
          />
        )}
        {tab === 'final' && (
          <FinalTab entries={auditLog} onFocusSubAgent={focusSubAgent} onFocusStep={(id) => setFocus({ focusedSubTaskId: undefined, focusedSubAgentId: undefined, focusedTs: undefined, focusedId: id })} />
        )}
        {tab === 'trace' && <TraceTab entries={scopedEntries} filter={filter} focus={focus} />}
      </div>

      <ProvenanceFooter provenance={provenance} open={provenanceOpen} onToggle={() => setProvenanceOpen((v) => !v)} />
    </SessionCard>
  );
}

// ── Completeness banner (Phase 3.6) ─────────────────────────────────

const SECTION_LABEL: Record<string, string> = {
  thoughts: 'CoT',
  toolCalls: 'Tool calls',
  decisions: 'Decisions',
  verdicts: 'Verdicts',
  planSteps: 'Plan steps',
  delegates: 'Delegates',
  subTasks: 'Sub-tasks',
  subAgents: 'Sub-agents',
  workflowEvents: 'Workflow events',
  sessionEvents: 'Session events',
  gates: 'Gates',
  finals: 'Finals',
};

function CompletenessBanner({
  completeness,
}: {
  completeness: readonly TaskProcessSectionCompleteness[];
}) {
  // Surface only sections that are NOT fully complete. The brief: "Banner
  // copy must name the missing section ('CoT incomplete: 3 trailing deltas
  // without close') — never a generic 'incomplete' message."
  const issues = completeness.filter((c) => c.kind !== 'complete');
  if (issues.length === 0) return null;
  return (
    <div className="border-b border-border/40 bg-bg/15 px-3 py-1.5">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-2xs">
        {issues.map((c) => {
          const label = SECTION_LABEL[c.section] ?? c.section;
          const tone = c.kind === 'partial' ? 'text-yellow' : 'text-text-muted';
          const verdict = c.kind === 'partial' ? 'incomplete' : 'unclassifiable';
          return (
            <li key={c.section} className={tone}>
              <span className="font-medium">{label}</span> {verdict}
              {c.reason && <span className="text-text-muted/70">: {c.reason}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Scrubber (Phase 3.4) ────────────────────────────────────────────

function Scrubber({
  entries,
  focusedId,
  onPick,
}: {
  entries: readonly AuditEntry[];
  focusedId: string | undefined;
  onPick: (entry: AuditEntry) => void;
}) {
  // One tick per entry, scaled to the [min, max] ts window. Memoized on
  // the entries reference so re-render with stable projection content
  // does not rebuild the array.
  const ticks = useMemo(() => buildTicks(entries), [entries]);
  if (ticks.length === 0) return null;
  return (
    <div className="border-b border-border/40 px-3 py-2" aria-label="Audit timeline scrubber">
      <div className="relative h-2 rounded-sm bg-bg/30">
        {ticks.map((tick) => {
          const active = focusedId === tick.entry.id;
          return (
            <button
              key={tick.entry.id}
              type="button"
              onClick={() => onPick(tick.entry)}
              className={cn(
                'absolute top-0 h-full w-[3px] -translate-x-1/2 rounded-sm transition-colors',
                active ? 'bg-blue z-10' : KIND_TICK_TONE[tick.entry.kind] ?? 'bg-text-muted/40',
              )}
              style={{ left: `${tick.pct * 100}%` }}
              title={`${tick.entry.kind} · ${new Date(tick.entry.ts).toISOString().slice(11, 23)}`}
              aria-pressed={active}
              aria-label={`${tick.entry.kind} at ${new Date(tick.entry.ts).toISOString()}`}
            />
          );
        })}
      </div>
    </div>
  );
}

const KIND_TICK_TONE: Record<string, string> = {
  thought: 'bg-blue/60',
  tool_call: 'bg-green/60',
  decision: 'bg-yellow/60',
  verdict: 'bg-purple/60',
  subtask: 'bg-orange/60',
  subagent: 'bg-orange/60',
  workflow: 'bg-blue/60',
  session: 'bg-text-muted',
  gate: 'bg-yellow/60',
  final: 'bg-green',
};

interface ScrubberTick {
  entry: AuditEntry;
  pct: number;
}

function buildTicks(entries: readonly AuditEntry[]): ScrubberTick[] {
  if (entries.length === 0) return [];
  const minTs = entries.reduce((acc, e) => Math.min(acc, e.ts), entries[0]?.ts ?? 0);
  const maxTs = entries.reduce((acc, e) => Math.max(acc, e.ts), entries[0]?.ts ?? 0);
  const span = Math.max(1, maxTs - minTs);
  return entries.map((entry) => ({
    entry,
    pct: (entry.ts - minTs) / span,
  }));
}

// ── Provenance footer (Phase 3.5) ───────────────────────────────────

function ProvenanceFooter({
  provenance,
  open,
  onToggle,
}: {
  provenance: TaskProcessProvenance | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  if (!provenance) return null;
  const policyLabel = provenance.policyVersions.length > 0 ? provenance.policyVersions.join(', ') : '—';
  const promptHashShort = provenance.promptHashes[0]?.slice(0, 10) ?? '—';
  return (
    <footer className="border-t border-border/40 bg-bg/15 px-3 py-1.5 text-2xs text-text-muted">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left hover:text-text"
        aria-expanded={open}
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>policy {policyLabel}</span>
          <span aria-hidden>·</span>
          <span>{provenance.modelIds.length} models</span>
          <span aria-hidden>·</span>
          <span>{provenance.oracleIds.length} oracles</span>
          <span aria-hidden>·</span>
          <span className="font-mono">prompt 0x{promptHashShort}</span>
          <span aria-hidden>·</span>
          <span>capability tokens {provenance.capabilityTokenIds.length}</span>
        </span>
        <ChevronRight size={12} className={cn('transition-transform', open && 'rotate-90')} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ProvenanceList title="Policy versions" items={provenance.policyVersions} />
          <ProvenanceList title="Model IDs" items={provenance.modelIds} />
          <ProvenanceList title="Oracle IDs" items={provenance.oracleIds} />
          <ProvenanceList title="Prompt hashes" items={provenance.promptHashes} mono />
          <ProvenanceList title="Capability tokens" items={provenance.capabilityTokenIds} mono />
        </div>
      )}
    </footer>
  );
}

function ProvenanceList({ title, items, mono }: { title: string; items: readonly string[]; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-text-muted/80">{title}</div>
      {items.length === 0 ? (
        <div className="text-text-muted/60">none</div>
      ) : (
        <ul className={cn('flex flex-col gap-0.5', mono && 'font-mono')}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Filter input ────────────────────────────────────────────────────

function FilterInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded-sm border border-border/40 bg-bg/20 px-2 py-0.5 text-xs">
      <Filter size={12} aria-hidden className="text-text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="filter"
        className="w-32 bg-transparent placeholder-text-muted/50 focus:outline-none"
      />
    </label>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────

function ReasoningTab({
  entries,
  filter,
  completeness,
  focus,
}: {
  entries: readonly AuditEntry[];
  filter: string;
  completeness: readonly TaskProcessSectionCompleteness[];
  focus: FocusState;
}) {
  const thoughts = entries.filter((e): e is Extract<AuditEntry, { kind: 'thought' }> => e.kind === 'thought');
  const filtered = applyFilter(thoughts, filter, (e) => e.content);
  const sectionMeta = completeness.find((c) => c.section === 'thoughts');
  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No reasoning entries yet"
        hint={
          sectionMeta?.kind === 'unclassifiable'
            ? sectionMeta.reason
            : 'Thought blocks land at each tool-call announce.'
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {filtered.map((t) => (
        <li key={t.id} ref={focus.focusedId === t.id ? scrollIntoViewRef : undefined}>
          <SessionCard variant="tertiary" padded tone={focus.focusedId === t.id ? 'info' : undefined}>
            <div className="mb-1 flex items-center justify-between text-2xs text-text-muted">
              <ActorLabel actor={t.actor} />
              <span>{t.trigger ?? 'thought'}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{t.content}</p>
          </SessionCard>
        </li>
      ))}
    </ul>
  );
}

function ToolCallsTab({
  entries,
  filter,
  focus,
}: {
  entries: readonly AuditEntry[];
  filter: string;
  focus: FocusState;
}) {
  const tools = entries.filter((e): e is Extract<AuditEntry, { kind: 'tool_call' }> => e.kind === 'tool_call');
  const filtered = applyFilter(tools, filter, (e) => `${e.toolId} ${e.lifecycle} ${e.denyReason ?? ''}`);
  if (filtered.length === 0) {
    return <EmptyState title="No tool calls" hint="Tool entries land per worker call." />;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-2xs text-text-muted">
        <tr>
          <th className="pb-1">Tool</th>
          <th className="pb-1">Lifecycle</th>
          <th className="pb-1">Latency</th>
          <th className="pb-1">Actor</th>
          <th className="pb-1">Hash</th>
          <th className="pb-1">Token</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((t) => (
          <tr
            key={t.id}
            ref={focus.focusedId === t.id ? scrollIntoViewRef : undefined}
            className={cn('border-t border-border/30', focus.focusedId === t.id && 'bg-blue/5')}
          >
            <td className="py-1 font-medium" title={t.denyReason}>
              {t.toolId}
            </td>
            <td className="py-1">
              <LifecyclePill lifecycle={t.lifecycle} />
            </td>
            <td className="py-1 text-text-muted">{t.latencyMs != null ? `${t.latencyMs}ms` : '—'}</td>
            <td className="py-1">
              <ActorLabel actor={t.actor} />
            </td>
            <td className="py-1 font-mono text-2xs text-text-muted">{t.argsHash.slice(0, 10)}…</td>
            <td className="py-1 font-mono text-2xs text-text-muted">{t.capabilityTokenId ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DecisionsTab({
  entries,
  filter,
  focus,
}: {
  entries: readonly AuditEntry[];
  filter: string;
  focus: FocusState;
}) {
  const rows = entries.filter(
    (e): e is Extract<AuditEntry, { kind: 'decision' | 'verdict' }> => e.kind === 'decision' || e.kind === 'verdict',
  );
  const filtered = applyFilter(rows, filter, (e) =>
    e.kind === 'decision' ? `${e.verdict} ${e.rationale} ${e.ruleId ?? ''}` : `${e.source} ${e.oracleId ?? ''}`,
  );
  if (filtered.length === 0) {
    return <EmptyState title="No decisions yet" hint="Routing, gate, oracle, and critic verdicts land here." />;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {filtered.map((e) => (
        <li key={e.id} ref={focus.focusedId === e.id ? scrollIntoViewRef : undefined}>
          <SessionCard variant="tertiary" padded tone={focus.focusedId === e.id ? 'info' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <KindBadge kind={e.kind === 'decision' ? e.decisionType : e.source} />
                  <ActorLabel actor={e.actor} />
                  {e.kind === 'decision' && e.tier && <TierBadge tier={e.tier} />}
                </div>
                {e.kind === 'decision' ? (
                  <>
                    <p className="mt-1 text-sm text-text">{e.verdict}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{e.rationale}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-text">
                    {e.source}: {String(e.pass)}
                    {typeof e.confidence === 'number' && ` · confidence ${e.confidence.toFixed(2)}`}
                  </p>
                )}
              </div>
              <div className="text-right text-2xs text-text-muted">
                {e.kind === 'decision' && e.ruleId && (
                  <div className="font-mono" title="rule id">
                    {e.ruleId}
                  </div>
                )}
                {e.kind === 'verdict' && e.oracleId && (
                  <div className="font-mono" title="oracle id">
                    {e.oracleId}
                  </div>
                )}
              </div>
            </div>
          </SessionCard>
        </li>
      ))}
    </ul>
  );
}

// ── Hierarchy tab (Phase 3.3) ───────────────────────────────────────

function HierarchyTab({
  byEntity,
  entries,
  focus,
  onFocusSubAgent,
  onFocusSubTask,
}: {
  byEntity: TaskProcessByEntity | undefined;
  entries: readonly AuditEntry[];
  focus: FocusState;
  onFocusSubAgent: (id: string | undefined) => void;
  onFocusSubTask: (id: string | undefined) => void;
}) {
  if (!byEntity) {
    return (
      <EmptyState
        title="Hierarchy unavailable"
        hint="The projection's byEntity rollup is not present. Reload may help."
      />
    );
  }
  // Persona name lookup from `subagent` rows when present.
  const personaBySubAgent = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.kind === 'subagent' && e.subAgentId && e.persona) map.set(e.subAgentId, e.persona);
    }
    return map;
  }, [entries]);

  return (
    <div className="font-mono text-xs">
      <Node
        label={byEntity.sessionId ? `session: ${byEntity.sessionId}` : 'session: (unknown)'}
        depth={0}
        empty={!byEntity.sessionId}
      >
        <Node label={`workflow: ${byEntity.workflowId ?? byEntity.taskId}`} depth={1}>
          <Node label={`task: ${byEntity.taskId}`} depth={2}>
            {byEntity.subTaskIds.length === 0 && byEntity.subAgentIds.length === 0 && (
              <Node label="(no sub-tasks / sub-agents)" depth={3} empty />
            )}
            {byEntity.subTaskIds.map((stid) => (
              <Node
                key={`st-${stid}`}
                label={`sub-task: ${stid}`}
                depth={3}
                active={focus.focusedSubTaskId === stid}
                onClick={() => onFocusSubTask(focus.focusedSubTaskId === stid ? undefined : stid)}
              />
            ))}
            {byEntity.subAgentIds.length > 0 && (
              <Node label={`agent: ${byEntity.taskId}`} depth={3}>
                {byEntity.subAgentIds.map((said) => {
                  const persona = personaBySubAgent.get(said);
                  // Canonical actor naming — never bare "agent"; this is the
                  // sub-agent's own dimension, label uses persona when known.
                  const label = persona
                    ? `sub-agent: persona:${persona} (${said})`
                    : `sub-agent: ${said}`;
                  return (
                    <Node
                      key={`sa-${said}`}
                      label={label}
                      depth={4}
                      active={focus.focusedSubAgentId === said}
                      onClick={() => onFocusSubAgent(focus.focusedSubAgentId === said ? undefined : said)}
                    />
                  );
                })}
              </Node>
            )}
          </Node>
        </Node>
      </Node>
    </div>
  );
}

function Node({
  label,
  depth,
  children,
  active,
  empty,
  onClick,
}: {
  label: string;
  depth: number;
  children?: React.ReactNode;
  active?: boolean;
  empty?: boolean;
  onClick?: () => void;
}) {
  const indent = { paddingLeft: `${depth * 1.25}rem` };
  const inner = (
    <div
      className={cn(
        'flex items-center gap-1 rounded-sm py-0.5',
        active && 'bg-blue/10 text-blue',
        empty && 'text-text-muted/60 italic',
        onClick && !active && 'hover:bg-bg/30',
      )}
      style={indent}
    >
      <ChevronRight size={10} aria-hidden className="text-text-muted/60" />
      <span>{label}</span>
    </div>
  );
  return (
    <div>
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {inner}
        </button>
      ) : (
        inner
      )}
      {children}
    </div>
  );
}

// ── Final tab (Phase 3.3) ───────────────────────────────────────────

function FinalTab({
  entries,
  onFocusSubAgent,
  onFocusStep,
}: {
  entries: readonly AuditEntry[];
  onFocusSubAgent: (id: string | undefined) => void;
  onFocusStep: (entryId: string) => void;
}) {
  const finals = entries.filter((e): e is Extract<AuditEntry, { kind: 'final' }> => e.kind === 'final');
  if (finals.length === 0) {
    return (
      <EmptyState
        title="No final answer recorded yet"
        hint="A kind:'final' entry lands when the orchestrator commits an answer."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {finals.map((f) => (
        <li key={f.id}>
          <SessionCard variant="tertiary" padded>
            <div className="mb-1 flex items-center justify-between text-2xs text-text-muted">
              <span>final answer</span>
              <span className="font-mono">0x{f.contentHash.slice(0, 10)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{f.contentRedactedPreview}</p>
            {(f.assembledFromStepIds.length > 0 ||
              f.assembledFromDelegateIds.length > 0 ||
              (f.assembledFromSubAgentIds?.length ?? 0) > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs">
                <span className="text-text-muted">assembled from:</span>
                {f.assembledFromStepIds.map((sid) => (
                  <button
                    key={`step-${sid}`}
                    type="button"
                    onClick={() => onFocusStep(sid)}
                    className="rounded-sm bg-bg/30 px-1.5 py-0.5 text-text hover:bg-bg/50"
                  >
                    step {sid}
                  </button>
                ))}
                {(f.assembledFromSubAgentIds ?? f.assembledFromDelegateIds).map((said) => (
                  <button
                    key={`sa-${said}`}
                    type="button"
                    onClick={() => onFocusSubAgent(said)}
                    className="rounded-sm bg-orange/15 px-1.5 py-0.5 text-orange hover:bg-orange/25"
                  >
                    sub-agent {said}
                  </button>
                ))}
              </div>
            )}
          </SessionCard>
        </li>
      ))}
    </ul>
  );
}

function TraceTab({
  entries,
  filter,
  focus,
}: {
  entries: readonly AuditEntry[];
  filter: string;
  focus: FocusState;
}) {
  const filtered = applyFilter(entries, filter, (e) => `${e.kind} ${e.id} ${e.actor.type}`);
  if (filtered.length === 0) {
    return <EmptyState title="No audit entries" hint="The audit log will populate as the task runs." />;
  }
  return (
    <table className="w-full font-mono text-2xs">
      <thead className="text-left text-text-muted">
        <tr>
          <th className="pb-1">ts</th>
          <th className="pb-1">kind</th>
          <th className="pb-1">actor</th>
          <th className="pb-1">id</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((e) => (
          <tr
            key={e.id}
            ref={focus.focusedId === e.id ? scrollIntoViewRef : undefined}
            className={cn('border-t border-border/30', focus.focusedId === e.id && 'bg-blue/5')}
          >
            <td className="py-1 text-text-muted">{new Date(e.ts).toISOString().slice(11, 23)}</td>
            <td className="py-1 text-text">{e.kind}</td>
            <td className="py-1 text-text">{actorLabelText(e.actor)}</td>
            <td className="py-1 text-text-muted">{e.id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Atoms ───────────────────────────────────────────────────────────

function ActorLabel({ actor }: { actor: AuditEntry['actor'] }) {
  return <span className="text-2xs">{actorLabelText(actor)}</span>;
}

function actorLabelText(actor: AuditEntry['actor']): string {
  // Canonical names — never bare "Agent". Vendor only relevant for cli-delegate.
  const id = actor.id ? `:${actor.id}` : '';
  return actor.type === 'cli-delegate' && actor.vendor ? `${actor.type}:${actor.vendor}${id}` : `${actor.type}${id}`;
}

type ToolCallLifecycle = 'proposed' | 'authorized' | 'denied' | 'executed' | 'failed' | 'retried';

function LifecyclePill({ lifecycle }: { lifecycle: ToolCallLifecycle }) {
  // Phase 2.2 — six lifecycle states. Tone groups them into intent buckets:
  // green = success path, red = denial/failure, yellow = retry/intermediate.
  const tone =
    lifecycle === 'executed'
      ? 'bg-green/15 text-green'
      : lifecycle === 'authorized'
        ? 'bg-green/10 text-green'
        : lifecycle === 'denied' || lifecycle === 'failed'
          ? 'bg-red/15 text-red'
          : 'bg-yellow/15 text-yellow';
  return <span className={cn('rounded-sm px-1.5 py-0.5 text-2xs', tone)}>{lifecycle}</span>;
}

function KindBadge({ kind }: { kind: string }) {
  return <span className="rounded-sm bg-bg/30 px-1.5 py-0.5 text-2xs text-text-muted">{kind}</span>;
}

function TierBadge({ tier }: { tier: 'deterministic' | 'heuristic' | 'probabilistic' }) {
  const tone =
    tier === 'deterministic'
      ? 'bg-green/10 text-green'
      : tier === 'heuristic'
        ? 'bg-yellow/10 text-yellow'
        : 'bg-blue/10 text-blue';
  return <span className={cn('rounded-sm px-1.5 py-0.5 text-2xs', tone)}>{tier}</span>;
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-6 text-center text-text-muted">
      <p className="text-sm">{title}</p>
      {hint && <p className="mt-1 text-xs">{hint}</p>}
    </div>
  );
}

// Ref callback that scrolls the matched element into view. Used by the
// scrubber's tab-syncing behavior — when focusedId matches a row, that
// row's <li>/<tr> receives this ref and pulls itself into view.
function scrollIntoViewRef(node: HTMLElement | null) {
  if (node) {
    // `requestAnimationFrame` defers to after layout so the scroll lands
    // on the actual rendered row position rather than the pre-mount one.
    requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

interface KindCounts {
  thoughts: number;
  toolCalls: number;
  decisions: number;
  hierarchy: number;
  finals: number;
  total: number;
}

function countByKind(entries: readonly AuditEntry[]): KindCounts {
  let thoughts = 0;
  let toolCalls = 0;
  let decisions = 0;
  let finals = 0;
  for (const e of entries) {
    if (e.kind === 'thought') thoughts += 1;
    else if (e.kind === 'tool_call') toolCalls += 1;
    else if (e.kind === 'decision' || e.kind === 'verdict') decisions += 1;
    else if (e.kind === 'final') finals += 1;
  }
  return { thoughts, toolCalls, decisions, finals, hierarchy: 0, total: entries.length };
}

function tabCount(tab: AuditTab, counts: KindCounts): number {
  switch (tab) {
    case 'reasoning':
      return counts.thoughts;
    case 'tools':
      return counts.toolCalls;
    case 'decisions':
      return counts.decisions;
    case 'hierarchy':
      return 0; // hierarchy is structural — count is zero by design
    case 'final':
      return counts.finals;
    case 'trace':
      return counts.total;
  }
}

function applyFilter<T>(items: readonly T[], filter: string, get: (item: T) => string): T[] {
  if (!filter.trim()) return [...items];
  const needle = filter.toLowerCase();
  return items.filter((item) => get(item).toLowerCase().includes(needle));
}

// Suppress unused-import warning for `useEffect` and `useRef` — kept
// available for future tab implementations that need stateful effects.
void useEffect;
void useRef;
