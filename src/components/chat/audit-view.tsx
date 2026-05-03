/**
 * AuditView — A8 unified audit surface.
 *
 * Single screen across four tabs (Reasoning, Tool calls, Decisions, Trace)
 * that lets a reviewer answer the five audit questions: what did the
 * agent think before each tool call; what did it try, and what came back;
 * which decisions were made, by which rule; and was the run traceable.
 *
 * Four-tab MVP: the brief calls for six (Plan + Delegates and Final), but
 * those are already covered by the existing `<PlanSurface>` /
 * `<AgentRosterCard>` / `<MessageBubble>` surfaces — duplicating them in
 * AuditView would just re-render the same data. Plan + Delegates and
 * Final tabs ship as a follow-up iteration once the core four prove
 * load-bearing.
 *
 * Render parity: live and historical paths feed the same component
 * because both sources land via the projection's `auditLog`. The only
 * difference is whether `useAuditProjection` is polling or static.
 */
import { Activity, Brain, FileSearch, Filter, Gavel } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AuditEntry, TaskProcessSectionCompleteness } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { SessionCard } from './session-card';

export type AuditTab = 'reasoning' | 'tools' | 'decisions' | 'trace';

interface AuditViewProps {
  auditLog: readonly AuditEntry[];
  completenessBySection?: readonly TaskProcessSectionCompleteness[];
  /** Initial tab. Defaults to 'reasoning' when there are thoughts, else 'decisions'. */
  defaultTab?: AuditTab;
  className?: string;
}

const TAB_DEFS: Array<{ id: AuditTab; label: string; icon: typeof Brain }> = [
  { id: 'reasoning', label: 'Reasoning', icon: Brain },
  { id: 'tools', label: 'Tool calls', icon: Activity },
  { id: 'decisions', label: 'Decisions', icon: Gavel },
  { id: 'trace', label: 'Trace', icon: FileSearch },
];

export function AuditView({ auditLog, completenessBySection = [], defaultTab, className }: AuditViewProps) {
  const counts = useMemo(() => countByKind(auditLog), [auditLog]);
  const initialTab = defaultTab ?? (counts.thoughts > 0 ? 'reasoning' : 'decisions');
  const [tab, setTab] = useState<AuditTab>(initialTab);
  const [filter, setFilter] = useState('');

  if (auditLog.length === 0) return null;

  return (
    <SessionCard variant="secondary" className={cn('flex flex-col', className)}>
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-1">
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
                  active
                    ? 'bg-bg/40 font-medium text-text'
                    : 'text-text-muted hover:bg-bg/20 hover:text-text',
                )}
                aria-pressed={active}
              >
                <Icon size={14} aria-hidden />
                <span>{label}</span>
                {count > 0 && (
                  <span className="rounded-sm bg-bg/30 px-1 text-text-muted">{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <FilterInput value={filter} onChange={setFilter} />
      </header>

      <div className="flex-1 px-3 py-2">
        {tab === 'reasoning' && <ReasoningTab entries={auditLog} filter={filter} completeness={completenessBySection} />}
        {tab === 'tools' && <ToolCallsTab entries={auditLog} filter={filter} />}
        {tab === 'decisions' && <DecisionsTab entries={auditLog} filter={filter} />}
        {tab === 'trace' && <TraceTab entries={auditLog} filter={filter} />}
      </div>
    </SessionCard>
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
}: {
  entries: readonly AuditEntry[];
  filter: string;
  completeness: readonly TaskProcessSectionCompleteness[];
}) {
  const thoughts = entries.filter(
    (e): e is Extract<AuditEntry, { kind: 'thought' }> => e.kind === 'thought',
  );
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
        <li key={t.id}>
          <SessionCard variant="tertiary" padded>
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

function ToolCallsTab({ entries, filter }: { entries: readonly AuditEntry[]; filter: string }) {
  const tools = entries.filter(
    (e): e is Extract<AuditEntry, { kind: 'tool_call' }> => e.kind === 'tool_call',
  );
  const filtered = applyFilter(tools, filter, (e) => e.toolId);
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
        </tr>
      </thead>
      <tbody>
        {filtered.map((t) => (
          <tr key={t.id} className="border-t border-border/30">
            <td className="py-1 font-medium">{t.toolId}</td>
            <td className="py-1">
              <LifecyclePill lifecycle={t.lifecycle} />
            </td>
            <td className="py-1 text-text-muted">{t.latencyMs != null ? `${t.latencyMs}ms` : '—'}</td>
            <td className="py-1">
              <ActorLabel actor={t.actor} />
            </td>
            <td className="py-1 font-mono text-2xs text-text-muted">{t.argsHash.slice(0, 10)}…</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DecisionsTab({ entries, filter }: { entries: readonly AuditEntry[]; filter: string }) {
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
        <li key={e.id}>
          <SessionCard variant="tertiary" padded>
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

function TraceTab({ entries, filter }: { entries: readonly AuditEntry[]; filter: string }) {
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
          <tr key={e.id} className="border-t border-border/30">
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

function LifecyclePill({ lifecycle }: { lifecycle: 'executed' | 'failed' | 'retried' }) {
  const tone =
    lifecycle === 'executed' ? 'bg-green/15 text-green' : lifecycle === 'failed' ? 'bg-red/15 text-red' : 'bg-yellow/15 text-yellow';
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

// ── Helpers ─────────────────────────────────────────────────────────

interface KindCounts {
  thoughts: number;
  toolCalls: number;
  decisions: number;
  total: number;
}

function countByKind(entries: readonly AuditEntry[]): KindCounts {
  let thoughts = 0;
  let toolCalls = 0;
  let decisions = 0;
  for (const e of entries) {
    if (e.kind === 'thought') thoughts += 1;
    else if (e.kind === 'tool_call') toolCalls += 1;
    else if (e.kind === 'decision' || e.kind === 'verdict') decisions += 1;
  }
  return { thoughts, toolCalls, decisions, total: entries.length };
}

function tabCount(tab: AuditTab, counts: KindCounts): number {
  switch (tab) {
    case 'reasoning':
      return counts.thoughts;
    case 'tools':
      return counts.toolCalls;
    case 'decisions':
      return counts.decisions;
    case 'trace':
      return counts.total;
  }
}

function applyFilter<T>(items: readonly T[], filter: string, get: (item: T) => string): T[] {
  if (!filter.trim()) return [...items];
  const needle = filter.toLowerCase();
  return items.filter((item) => get(item).toLowerCase().includes(needle));
}
