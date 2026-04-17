import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRules } from '@/hooks/use-rules';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { JsonView } from '@/components/ui/json-view';
import { cn, timeAgo } from '@/lib/utils';
import type { Rule, RuleStatus } from '@/lib/api-client';

export default function Rules() {
  const [status, setStatus] = useState<RuleStatus>('active');
  const { data, isFetching, isLoading, refetch } = useRules(status);
  const rules = data?.rules ?? [];
  const counts = data?.counts ?? { active: 0, probation: 0, retired: 0 };

  const [selected, setSelected] = useState<Rule | null>(null);

  const tabs: ReadonlyArray<TabItem<RuleStatus>> = [
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'probation', label: 'Probation', count: counts.probation },
    { id: 'retired', label: 'Retired', count: counts.retired },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rules"
        description="Evolution rules — pattern-mined from successful traces, validated before promotion."
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <Tabs items={tabs} active={status} onChange={setStatus} />

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {rules.length === 0 ? (
            <EmptyState
              message={`No ${status} rules`}
              hint={
                status === 'active'
                  ? 'Rules are promoted after successful probation — run tasks to accumulate traces'
                  : undefined
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Condition</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2 text-right">Effectiveness</th>
                  <th className="px-4 py-2 text-right">Specificity</th>
                  <th className="px-4 py-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <RuleRow key={r.id} rule={r} onSelect={() => setSelected(r)} selected={selected?.id === r.id} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Rule"
        subtitle={selected?.id}
        width="xl"
      >
        {selected && <RuleDetail rule={selected} />}
      </DetailDrawer>
    </div>
  );
}

function RuleRow({
  rule,
  onSelect,
  selected,
}: {
  rule: Rule;
  onSelect: () => void;
  selected: boolean;
}) {
  const effColor =
    rule.effectiveness >= 0.7
      ? 'text-green'
      : rule.effectiveness >= 0.4
        ? 'text-yellow'
        : 'text-red';
  return (
    <tr
      onClick={onSelect}
      className={cn(
        'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
        selected && 'bg-white/[0.02]',
      )}
    >
      <td className="px-4 py-2 font-mono text-xs truncate max-w-[10rem]" title={rule.id}>
        {rule.id}
      </td>
      <td className="px-4 py-2">
        <Badge variant="info">{rule.action}</Badge>
      </td>
      <td className="px-4 py-2 text-xs text-text-dim truncate max-w-[28rem]">
        {summarizeCondition(rule.condition)}
      </td>
      <td className="px-4 py-2 text-xs text-text-dim">{rule.source}</td>
      <td className={cn('px-4 py-2 text-xs tabular-nums text-right', effColor)}>
        {(rule.effectiveness * 100).toFixed(0)}%
      </td>
      <td className="px-4 py-2 text-xs tabular-nums text-right text-text-dim">
        {rule.specificity}
      </td>
      <td className="px-4 py-2 text-xs tabular-nums text-right text-text-dim">
        {timeAgo(rule.createdAt)}
      </td>
    </tr>
  );
}

function RuleDetail({ rule }: { rule: Rule }) {
  return (
    <div className="space-y-3 text-sm">
      <Row label="ID" value={<code className="text-xs">{rule.id}</code>} />
      <Row label="Status" value={<StatusBadge status={rule.status} />} />
      <Row label="Source" value={rule.source} />
      {rule.origin && <Row label="Origin" value={rule.origin} />}
      <Row label="Action" value={<Badge variant="info">{rule.action}</Badge>} />
      <Row
        label="Effectiveness"
        value={<span className="tabular-nums">{(rule.effectiveness * 100).toFixed(1)}%</span>}
      />
      <Row label="Specificity" value={rule.specificity} />
      <Row label="Created" value={timeAgo(rule.createdAt)} />
      {rule.supersededBy && <Row label="Superseded by" value={rule.supersededBy} />}

      <div>
        <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Condition</div>
        <JsonView data={rule.condition} collapsibleTopLevel={false} />
      </div>

      <div>
        <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Parameters</div>
        <JsonView data={rule.parameters} collapsibleTopLevel={false} />
      </div>
    </div>
  );
}

function summarizeCondition(c: Rule['condition']): string {
  const parts: string[] = [];
  if (c.filePattern) parts.push(`file=${c.filePattern}`);
  if (c.oracleName) parts.push(`oracle=${c.oracleName}`);
  if (c.riskAbove !== undefined) parts.push(`risk>${c.riskAbove}`);
  if (c.modelPattern) parts.push(`model=${c.modelPattern}`);
  return parts.join(' · ') || 'any';
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-dim">{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  );
}
