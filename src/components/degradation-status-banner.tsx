import { AlertTriangle, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDegradationStatus } from '@/hooks/use-degradation-status';

/**
 * A9/T4 — operator visibility for active degraded subsystems.
 * Hidden when the system is healthy or the tracker is not wired.
 * Surfaces fail-closed entries (partial outage) prominently and
 * fail-open entries (degraded) as an advisory hint.
 */
export function DegradationStatusBanner() {
  const { data } = useDegradationStatus();
  if (!data || data.status === 'healthy' || data.status === 'unavailable') return null;
  const snapshot = data.snapshot;
  const total = snapshot?.total ?? 0;
  const failClosed = snapshot?.failClosedCount ?? 0;

  const partial = data.status === 'partial-outage';
  const Icon = partial ? AlertTriangle : Activity;
  const tone = partial
    ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : 'bg-yellow/10 border-yellow/20 text-yellow';

  const message = partial
    ? `Partial outage — ${failClosed} fail-closed subsystem${failClosed === 1 ? '' : 's'} active`
    : `Degraded — ${total} subsystem${total === 1 ? '' : 's'} running with reduced capability`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-2 text-xs border-b ${tone}`}
    >
      <Icon size={14} className={partial ? '' : 'animate-pulse'} />
      <span className="flex-1">{message}</span>
      <Link
        to="/doctor"
        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 transition-colors"
      >
        View details
      </Link>
    </div>
  );
}
