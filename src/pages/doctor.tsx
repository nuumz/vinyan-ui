import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Zap } from 'lucide-react';
import { useDoctor } from '@/hooks/use-doctor';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { DoctorCheck, DoctorReport } from '@/lib/api-client';
import { useState } from 'react';

export default function Doctor() {
  const [deep, setDeep] = useState(false);
  const query = useDoctor(deep);
  const report = query.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Doctor"
        description="Workspace health check — config, database, oracles, LLM providers, sessions."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDeep(true);
                query.refetch();
              }}
              disabled={query.isFetching}
              title="Includes tsc type-check (slow)"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-yellow/10 text-yellow border border-yellow/30 hover:bg-yellow/20 disabled:opacity-50"
            >
              <Zap size={12} />
              Deep check
            </button>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors disabled:opacity-50"
              title="Re-run"
            >
              <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      {query.isLoading && <EmptyState message="Running checks…" />}

      {query.error && (
        <div className="bg-red/10 border border-red/30 rounded p-3 text-sm text-red">
          {query.error instanceof Error ? query.error.message : 'Failed to fetch doctor report'}
        </div>
      )}

      {report && <Summary report={report} />}

      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.checks.map((c) => (
            <CheckCard key={c.name} check={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ report }: { report: DoctorReport }) {
  const { status, summary } = report;
  const color =
    status === 'healthy' ? 'text-green' : status === 'degraded' ? 'text-yellow' : 'text-red';
  const bg =
    status === 'healthy'
      ? 'bg-green/5 border-green/30'
      : status === 'degraded'
        ? 'bg-yellow/5 border-yellow/30'
        : 'bg-red/5 border-red/30';
  return (
    <div className={cn('rounded-lg border p-4 flex items-center justify-between', bg)}>
      <div>
        <div className={cn('text-lg font-semibold capitalize', color)}>{status}</div>
        <div className="text-xs text-text-dim mt-0.5">
          {summary.passed}/{summary.total} checks passed
          {report.deep ? ' · deep' : ' · fast'}
        </div>
      </div>
      <div className="text-xs text-text-dim">{new Date(report.timestamp).toLocaleTimeString()}</div>
    </div>
  );
}

function CheckCard({ check }: { check: DoctorCheck }) {
  const Icon =
    check.status === 'ok' ? CheckCircle2 : check.status === 'warn' ? AlertTriangle : XCircle;
  const color =
    check.status === 'ok' ? 'text-green' : check.status === 'warn' ? 'text-yellow' : 'text-red';
  const variant = check.status === 'ok' ? 'success' : check.status === 'warn' ? 'warning' : 'error';

  return (
    <div className="bg-surface border border-border rounded-lg p-3 flex gap-3">
      <Icon size={18} className={cn('shrink-0 mt-0.5', color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">{check.name}</div>
          <Badge variant={variant} className="text-[10px]">
            {check.status}
          </Badge>
        </div>
        <div className="text-xs text-text-dim mt-1 break-words">{check.detail}</div>
      </div>
    </div>
  );
}
