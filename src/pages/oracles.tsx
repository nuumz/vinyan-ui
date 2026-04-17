import { useState } from 'react';
import { RefreshCw, Zap, ZapOff, CircleDashed } from 'lucide-react';
import { useOracles } from '@/hooks/use-oracles';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { cn } from '@/lib/utils';
import type { OracleSummary } from '@/lib/api-client';

type CircuitState = OracleSummary['circuitState'];

const tierVariant: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  deterministic: 'success',
  heuristic: 'info',
  probabilistic: 'warning',
  speculative: 'neutral',
};

export default function Oracles() {
  const query = useOracles();
  const oracles = query.data ?? [];
  const [selected, setSelected] = useState<OracleSummary | null>(null);

  const isFetching = query.isFetching;
  const loading = !query.data && query.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Oracles"
        description="Verification engines — tier, circuit-breaker state, and post-hoc accuracy."
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {oracles.length === 0 ? (
            <EmptyState message="No oracles registered" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Tier</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Breaker</th>
                  <th className="px-4 py-2 text-right">Accuracy</th>
                  <th className="px-4 py-2 text-right">Verdicts</th>
                  <th className="px-4 py-2 text-right">Timeout</th>
                </tr>
              </thead>
              <tbody>
                {oracles.map((o) => (
                  <OracleRow
                    key={o.name}
                    oracle={o}
                    selected={selected?.name === o.name}
                    onSelect={() => setSelected(o)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected?.builtin ? 'built-in' : 'external'}
      >
        {selected && <OracleDetail oracle={selected} />}
      </DetailDrawer>
    </div>
  );
}

function OracleRow({
  oracle,
  selected,
  onSelect,
}: {
  oracle: OracleSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const acc = oracle.accuracy;
  const accuracyDisplay = acc?.accuracy != null ? `${(acc.accuracy * 100).toFixed(0)}%` : '—';
  const accuracyColor =
    acc?.accuracy == null
      ? 'text-text-dim'
      : acc.accuracy >= 0.85
        ? 'text-green'
        : acc.accuracy >= 0.7
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
      <td className="px-4 py-2 font-mono text-xs">{oracle.name}</td>
      <td className="px-4 py-2">
        {oracle.tier ? (
          <Badge variant={tierVariant[oracle.tier] ?? 'neutral'}>{oracle.tier}</Badge>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <Badge variant={oracle.enabled ? 'success' : 'neutral'}>
          {oracle.enabled ? 'enabled' : 'disabled'}
        </Badge>
      </td>
      <td className="px-4 py-2">
        <BreakerBadge state={oracle.circuitState} />
      </td>
      <td className={cn('px-4 py-2 tabular-nums text-right', accuracyColor)}>
        {accuracyDisplay}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim">
        {acc ? `${acc.correct + acc.wrong}/${acc.total}` : '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        {oracle.timeoutMs != null ? `${oracle.timeoutMs}ms` : '—'}
      </td>
    </tr>
  );
}

function BreakerBadge({ state }: { state: CircuitState }) {
  if (state === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green">
        <Zap size={12} />
        <span>closed</span>
      </span>
    );
  }
  if (state === 'open') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red">
        <ZapOff size={12} />
        <span>open</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-yellow">
      <CircleDashed size={12} />
      <span>half-open</span>
    </span>
  );
}

function OracleDetail({ oracle }: { oracle: OracleSummary }) {
  const acc = oracle.accuracy;
  return (
    <div className="space-y-3 text-sm">
      <Row label="Name" value={<code className="text-xs">{oracle.name}</code>} />
      <Row label="Type" value={oracle.builtin ? 'built-in' : 'external'} />
      <Row
        label="Tier"
        value={
          oracle.tier ? (
            <Badge variant={tierVariant[oracle.tier] ?? 'neutral'}>{oracle.tier}</Badge>
          ) : (
            '—'
          )
        }
      />
      <Row
        label="Enabled"
        value={
          <Badge variant={oracle.enabled ? 'success' : 'neutral'}>
            {oracle.enabled ? 'yes' : 'no'}
          </Badge>
        }
      />
      <Row label="Transport" value={oracle.transport} />
      {oracle.languages.length > 0 && (
        <Row label="Languages" value={oracle.languages.join(', ')} />
      )}
      <Row label="Timeout" value={oracle.timeoutMs != null ? `${oracle.timeoutMs}ms` : '—'} />
      {oracle.timeoutBehavior && <Row label="Timeout behavior" value={oracle.timeoutBehavior} />}
      <Row label="Circuit breaker" value={<BreakerBadge state={oracle.circuitState} />} />

      {acc && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
            Accuracy (post-hoc)
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Correct" value={acc.correct} color="text-green" />
            <Stat label="Wrong" value={acc.wrong} color="text-red" />
            <Stat label="Pending" value={acc.pending} color="text-yellow" />
            <Stat label="Total" value={acc.total} color="text-text-dim" />
          </div>
          <div className="mt-2 text-xs text-text-dim">
            {acc.accuracy == null
              ? `Need ≥10 resolved verdicts (currently ${acc.correct + acc.wrong}) to compute accuracy`
              : `Accuracy: ${(acc.accuracy * 100).toFixed(1)}% over ${acc.correct + acc.wrong} resolved verdicts`}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-bg rounded p-2 text-center">
      <div className={cn('text-lg font-semibold tabular-nums', color)}>{value}</div>
      <div className="text-xs text-text-dim">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-dim">{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  );
}
