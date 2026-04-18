/**
 * Right-side stats row for the streaming bubble header: tokens consumed,
 * engine/model label, and routing level. Hidden entirely when no data.
 *
 * Copilot Chat surfaces this kind of metadata compactly so operators can
 * see what's actually running without opening a separate panel.
 */
import { Cpu, Coins, Layers } from 'lucide-react';

interface StatsRowProps {
  tokensConsumed?: number;
  engineId?: string;
  routingLevel?: number;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function StatsRow({ tokensConsumed, engineId, routingLevel }: StatsRowProps) {
  const hasAny = tokensConsumed != null || engineId || routingLevel != null;
  if (!hasAny) return null;

  return (
    <div className="inline-flex items-center gap-2 text-[10px] text-text-dim font-mono tabular-nums">
      {routingLevel != null && (
        <span className="inline-flex items-center gap-0.5" title={`Routing level L${routingLevel}`}>
          <Layers size={10} className="opacity-70" />L{routingLevel}
        </span>
      )}
      {engineId && (
        <span
          className="inline-flex items-center gap-0.5 max-w-[14ch] truncate"
          title={`Engine: ${engineId}`}
        >
          <Cpu size={10} className="opacity-70" />
          {engineId}
        </span>
      )}
      {tokensConsumed != null && tokensConsumed > 0 && (
        <span className="inline-flex items-center gap-0.5" title={`${tokensConsumed} tokens`}>
          <Coins size={10} className="opacity-70" />
          {formatTokens(tokensConsumed)}
        </span>
      )}
    </div>
  );
}
