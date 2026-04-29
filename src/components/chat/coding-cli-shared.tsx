import { cn } from '@/lib/utils';
import type { CodingCliProviderId } from '@/lib/api-client';

export function providerLabel(id: CodingCliProviderId): string {
  return id === 'claude-code' ? 'Claude Code' : 'GitHub Copilot';
}

export function providerBadgeStyle(id: CodingCliProviderId): string {
  return id === 'claude-code'
    ? 'bg-purple/10 border-purple/30 text-purple'
    : 'bg-blue/10 border-blue/30 text-blue';
}

interface ProviderBadgeProps {
  providerId: CodingCliProviderId;
  className?: string;
  size?: 'sm' | 'xs';
}

export function ProviderBadge({ providerId, className, size = 'sm' }: ProviderBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border font-mono uppercase tracking-wider',
        providerBadgeStyle(providerId),
        size === 'xs'
          ? 'text-[9px] px-1 py-0.5'
          : 'text-[10px] px-1.5 py-0.5',
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {providerLabel(providerId)}
    </span>
  );
}

const STATE_PALETTE: Record<string, string> = {
  created: 'bg-text-dim/10 text-text-dim border-text-dim/30',
  starting: 'bg-blue/10 text-blue border-blue/30',
  ready: 'bg-blue/10 text-blue border-blue/30',
  running: 'bg-blue/10 text-blue border-blue/30',
  planning: 'bg-blue/10 text-blue border-blue/30',
  editing: 'bg-blue/10 text-blue border-blue/30',
  'running-command': 'bg-blue/10 text-blue border-blue/30',
  'waiting-input': 'bg-yellow/10 text-yellow border-yellow/30',
  'waiting-approval': 'bg-yellow/10 text-yellow border-yellow/30',
  verifying: 'bg-purple/10 text-purple border-purple/30',
  completed: 'bg-green/10 text-green border-green/30',
  failed: 'bg-red/10 text-red border-red/30',
  cancelled: 'bg-text-dim/10 text-text-dim border-text-dim/30',
  'timed-out': 'bg-red/10 text-red border-red/30',
  crashed: 'bg-red/10 text-red border-red/30',
  stalled: 'bg-yellow/10 text-yellow border-yellow/30',
  'unsupported-capability': 'bg-text-dim/10 text-text-dim border-text-dim/30',
};

export function StateChip({ state, className }: { state: string; className?: string }) {
  const palette = STATE_PALETTE[state] ?? 'bg-text-dim/10 text-text-dim border-text-dim/30';
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border',
        palette,
        className,
      )}
    >
      {state}
    </span>
  );
}
