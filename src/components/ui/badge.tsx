import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green/10 text-green border-green/30',
  warning: 'bg-yellow/10 text-yellow border-yellow/30',
  error: 'bg-red/10 text-red border-red/30',
  info: 'bg-accent/10 text-accent border-accent/30',
  neutral: 'bg-gray-800 text-gray-500 border-gray-700',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium border', variantClasses[variant], className)}>
      {children}
    </span>
  );
}

// ── Presets ──

const statusVariantMap: Record<string, BadgeVariant> = {
  active: 'success',
  completed: 'success',
  running: 'info',
  probation: 'warning',
  escalated: 'warning',
  uncertain: 'warning',
  // `partial` = task produced a usable answer but at least one sub-step
  // failed or was skipped. Render as warning, NOT red error.
  partial: 'warning',
  suspended: 'neutral',
  failed: 'error',
  demoted: 'error',
  retired: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariantMap[status] ?? 'neutral'}>{status}</Badge>;
}

export function EventBadge({ event }: { event: string }) {
  const variant: BadgeVariant = event.includes('error') || event.includes('fail')
    ? 'error'
    : event.includes('complete') || event.includes('verdict')
      ? 'success'
      : event.includes('escalate') || event.includes('timeout')
        ? 'warning'
        : 'info';
  return <Badge variant={variant} className="shrink-0">{event}</Badge>;
}
