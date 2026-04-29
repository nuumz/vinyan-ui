import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useGovernanceSearch, useGovernanceReplay } from '@/hooks/use-governance';
import { PageHeader } from '@/components/ui/page-header';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { JsonView } from '@/components/ui/json-view';
import { cn, timeAgo } from '@/lib/utils';
import type { GovernanceTraceSummary } from '@/lib/api-client';

/**
 * A8/T2 — Governance decisions explorer.
 * Searches persisted decisions by actor / policy version / decisionId / time
 * and replays a single decision (persisted confidence is never recomputed).
 */
export default function Governance() {
  const [filter, setFilter] = useState<{ actor: string; policyVersion: string; decisionId: string }>({
    actor: '',
    policyVersion: '',
    decisionId: '',
  });
  const query = useGovernanceSearch({
    actor: filter.actor || undefined,
    policyVersion: filter.policyVersion || undefined,
    decisionId: filter.decisionId || undefined,
    limit: 100,
  });

  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const replay = useGovernanceReplay(selectedDecisionId);

  const rows = query.data?.rows ?? [];
  const loading = !query.data && query.isLoading;

  const policyVersions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.policyVersion && set.add(r.policyVersion));
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Governance"
        description={`Persisted A8 decision provenance — actor, policy version, evidence (${query.data?.total ?? '—'} total)`}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <FilterInput
          label="Decision id"
          value={filter.decisionId}
          onChange={(v) => setFilter((f) => ({ ...f, decisionId: v }))}
        />
        <FilterInput
          label="Actor"
          value={filter.actor}
          onChange={(v) => setFilter((f) => ({ ...f, actor: v }))}
        />
        <FilterInput
          label="Policy version"
          value={filter.policyVersion}
          onChange={(v) => setFilter((f) => ({ ...f, policyVersion: v }))}
          datalist={policyVersions}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState message="No governance decisions match filters" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Decision</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Policy</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2 text-right">Level</th>
                  <th className="px-4 py-2 text-right">Evidence</th>
                  <th className="px-4 py-2 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DecisionRow
                    key={row.traceId}
                    row={row}
                    selected={selectedDecisionId === row.decisionId}
                    onSelect={() => row.decisionId && setSelectedDecisionId(row.decisionId)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selectedDecisionId !== null}
        onClose={() => setSelectedDecisionId(null)}
        title="Decision replay"
        subtitle={selectedDecisionId ?? undefined}
        width="xl"
      >
        {replay.isLoading && <div className="text-text-dim text-sm">Loading…</div>}
        {replay.error && (
          <div className="text-sm text-red-400">
            {(replay.error as Error).message ?? 'Failed to load replay'}
          </div>
        )}
        {replay.data && <ReplayDetail summary={replay.data} />}
      </DetailDrawer>
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  datalist,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  datalist?: string[];
}) {
  const listId = datalist && datalist.length > 0 ? `governance-${label.replace(/\s+/g, '-')}` : undefined;
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        list={listId}
        className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-56"
      />
      {listId && (
        <datalist id={listId}>
          {datalist?.map((v) => <option key={v} value={v} />)}
        </datalist>
      )}
    </div>
  );
}

function DecisionRow({
  row,
  selected,
  onSelect,
}: {
  row: GovernanceTraceSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const unavailable = row.availability === 'unavailable';
  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0 cursor-pointer hover:bg-white/5 transition-colors',
        selected && 'bg-accent/10',
        unavailable && 'opacity-60',
      )}
      onClick={onSelect}
    >
      <td className="px-4 py-2 font-mono text-xs">
        {row.decisionId ?? <span className="text-text-dim">unavailable</span>}
      </td>
      <td className="px-4 py-2">{row.governanceActor ?? <span className="text-text-dim">—</span>}</td>
      <td className="px-4 py-2">
        {row.policyVersion ? (
          <Badge variant="info">{row.policyVersion}</Badge>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        {row.outcome ? <StatusBadge status={row.outcome} /> : <span className="text-text-dim">—</span>}
      </td>
      <td className="px-4 py-2 text-right">
        <Badge variant="info">L{row.routingLevel}</Badge>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">{row.evidenceCount}</td>
      <td className="px-4 py-2 text-right text-text-dim text-xs">
        {row.decidedAt ? timeAgo(row.decidedAt) : timeAgo(row.timestamp)}
      </td>
    </tr>
  );
}

function ReplayDetail({ summary }: { summary: import('@/lib/api-client').DecisionReplaySummary }) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <Row label="Decision id" value={<code className="text-xs">{summary.decisionId}</code>} />
        <Row label="Availability" value={<Badge variant={summary.availability === 'available' ? 'success' : 'warning'}>{summary.availability}</Badge>} />
        <Row label="Trace" value={<code className="text-xs">{summary.traceId}</code>} />
        <Row label="Task" value={<code className="text-xs">{summary.taskId}</code>} />
        {summary.attributedTo && <Row label="Attributed to" value={summary.attributedTo} />}
        {summary.wasGeneratedBy && <Row label="Generated by" value={summary.wasGeneratedBy} />}
        {summary.policyVersion && <Row label="Policy version" value={<Badge variant="info">{summary.policyVersion}</Badge>} />}
        <Row label="Routing level" value={<Badge variant="info">L{summary.routingLevel}</Badge>} />
        {summary.outcome && <Row label="Outcome" value={<StatusBadge status={summary.outcome} />} />}
        {summary.decidedAt && <Row label="Decided at" value={timeAgo(summary.decidedAt)} />}
        {summary.evidenceObservedAt && <Row label="Evidence observed" value={timeAgo(summary.evidenceObservedAt)} />}
        {summary.reason && <Row label="Reason" value={<span className="text-sm">{summary.reason}</span>} />}
        {summary.escalationPath && summary.escalationPath.length > 0 && (
          <Row label="Escalation path" value={<code className="text-xs">L{summary.escalationPath.join(' → L')}</code>} />
        )}
        {summary.pipelineConfidence && (
          <Row label="Pipeline confidence" value={<span className="tabular-nums">{summary.pipelineConfidence.composite.toFixed(3)}</span>} />
        )}
      </section>

      {summary.evidence.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-text-dim mb-2">Evidence ({summary.evidence.length})</h3>
          <div className="space-y-1">
            {summary.evidence.map((e, i) => (
              <div key={i} className="text-xs p-2 rounded bg-bg border border-border">
                <span className="text-text-dim">{e.kind}</span>{' '}
                <code>{e.source}</code>
                {e.fileHash && <span className="text-text-dim ml-2">{e.fileHash.slice(0, 16)}…</span>}
                {e.detail && <div className="mt-1 text-text-dim">{e.detail}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {summary.goalGrounding && summary.goalGrounding.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-text-dim mb-2">A10 Goal grounding</h3>
          <div className="space-y-1">
            {summary.goalGrounding.map((g, i) => (
              <div key={i} className="text-xs p-2 rounded bg-bg border border-border">
                <Badge variant="info">{g.action}</Badge> <span className="text-text-dim">{g.phase}</span>
                <div className="mt-1">{g.reason}</div>
                {(g.goalDrift || g.freshnessDowngraded) && (
                  <div className="mt-1 text-text-dim">
                    {g.goalDrift && 'drift '}{g.freshnessDowngraded && 'stale-evidence '}
                    {g.staleFactCount != null && `(${g.staleFactCount} stale)`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {summary.confidenceDecision !== undefined && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-text-dim mb-2">Confidence decision (persisted)</h3>
          <JsonView data={summary.confidenceDecision} />
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="text-text-dim text-xs uppercase tracking-wide w-36 shrink-0">{label}</span>
      <span className="flex-1">{value}</span>
    </div>
  );
}
