import { AlertTriangle, Hourglass, MessageSquare, ShieldAlert, Terminal } from 'lucide-react';
import type { TaskNeedsActionType } from '@/lib/api-client';
import { describeNeedsAction } from '@/lib/task-needs-action';
import { Badge } from '@/components/ui/badge';

const ICONS: Partial<Record<TaskNeedsActionType, React.ComponentType<{ size?: number; className?: string }>>> = {
  approval: ShieldAlert,
  'coding-cli-approval': Terminal,
  'workflow-human-input': MessageSquare,
  'partial-decision': AlertTriangle,
  'stale-running': Hourglass,
  failed: AlertTriangle,
  timeout: Hourglass,
};

interface NeedsActionBadgeProps {
  type: TaskNeedsActionType;
  /** Compact form drops the label and shows just the icon — for dense rows. */
  compact?: boolean;
}

/**
 * Small badge for the operations console rows + drawer header. Non-`none`
 * types render with an icon; `none` collapses to nothing so consumers can
 * `<NeedsActionBadge type={t} />` unconditionally.
 */
export function NeedsActionBadge({ type, compact = false }: NeedsActionBadgeProps) {
  if (type === 'none') return null;
  const meta = describeNeedsAction(type);
  const Icon = ICONS[type];
  return (
    <Badge variant={meta.tone} className="gap-1 whitespace-nowrap">
      {Icon ? <Icon size={11} className="shrink-0" /> : null}
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </Badge>
  );
}
