/**
 * Escalation indicator. Shows each L<from>→L<to> step with its reason as a
 * tooltip. Copilot Chat equivalent: model change indicators.
 */
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EscalationEntry {
  fromLevel: number;
  toLevel: number;
  reason: string;
  at: number;
}

interface EscalationBadgeProps {
  events: EscalationEntry[];
  className?: string;
}

export function EscalationBadge({ events, className }: EscalationBadgeProps) {
  if (events.length === 0) return null;

  const last = events[events.length - 1]!;
  const title = events
    .map((e) => `L${e.fromLevel}→L${e.toLevel}: ${e.reason}`)
    .join('\n');

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] px-1.5 h-5 rounded bg-yellow/10 text-yellow border border-yellow/30 font-mono tabular-nums',
        className,
      )}
    >
      <AlertTriangle size={10} />
      <span>
        L{last.fromLevel}→L{last.toLevel}
      </span>
      {events.length > 1 && <span className="opacity-70">×{events.length}</span>}
    </span>
  );
}
