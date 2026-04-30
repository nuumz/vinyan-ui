/**
 * Right-side stats row for the streaming bubble header: tokens consumed,
 * engine/model label, and routing level. Hidden entirely when no data.
 *
 * Copilot Chat surfaces this kind of metadata compactly so operators can
 * see what's actually running without opening a separate panel.
 */
import { Cpu, Coins, Layers } from 'lucide-react';

interface TokenBreakdownRow {
  /** Display label — agent name, "Planner", "Synthesizer", etc. */
  label: string;
  tokens: number;
}

interface StatsRowProps {
  tokensConsumed?: number;
  engineId?: string;
  routingLevel?: number;
  /** Optional per-agent breakdown shown in the tokens tooltip. Caller is
   * expected to sort by tokens desc; we cap the rendered list to top 5
   * to keep the tooltip readable on multi-agent turns with many delegates. */
  tokenBreakdown?: TokenBreakdownRow[];
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** Backend sentinels that historically leaked into engineId before the
 * core-loop preliminary task:start switched to model=null. Reject them at
 * render time so legacy persisted turns also display cleanly on replay. */
const ENGINE_ID_SENTINELS = new Set(['pending', 'unknown', '']);

function isRenderableEngineId(id: string | undefined): id is string {
  if (!id) return false;
  return !ENGINE_ID_SENTINELS.has(id.trim().toLowerCase());
}

const ROUTING_LEVEL_TOOLTIPS: Record<number, string> = {
  0: 'L0 — Reflex (hash-only, <100ms)',
  1: 'L1 — Heuristic (structural oracles, <2s)',
  2: 'L2 — Analytical (all oracles, <10s)',
  3: 'L3 — Deliberative (+shadow exec, <60s)',
};

function routingLevelTooltip(level: number): string {
  return ROUTING_LEVEL_TOOLTIPS[level] ?? `Routing level L${level}`;
}

/** Build the tokens chip tooltip. Parent `tokensConsumed` is the sum of
 * planning + synthesis + every delegate sub-task; the breakdown surfaces
 * where the budget actually went on multi-agent turns. */
function tokensTooltip(total: number, breakdown?: TokenBreakdownRow[]): string {
  const header = `${total.toLocaleString()} tokens`;
  if (!breakdown || breakdown.length === 0) return header;
  const top = breakdown.slice(0, 5);
  const lines = top.map((row) => `  ${row.label}: ${formatTokens(row.tokens)}`);
  const remaining = breakdown.length - top.length;
  if (remaining > 0) lines.push(`  +${remaining} more`);
  return `${header}\n${lines.join('\n')}`;
}

export function StatsRow({
  tokensConsumed,
  engineId,
  routingLevel,
  tokenBreakdown,
}: StatsRowProps) {
  const showEngine = isRenderableEngineId(engineId);
  const hasAny = tokensConsumed != null || showEngine || routingLevel != null;
  if (!hasAny) return null;

  return (
    <div className="inline-flex items-center gap-2 text-[10px] text-text-dim font-mono tabular-nums">
      {routingLevel != null && (
        <span className="inline-flex items-center gap-0.5" title={routingLevelTooltip(routingLevel)}>
          <Layers size={10} className="opacity-70" />L{routingLevel}
        </span>
      )}
      {showEngine && (
        <span
          className="inline-flex items-center gap-0.5 max-w-[14ch] truncate"
          title={`Engine: ${engineId}`}
        >
          <Cpu size={10} className="opacity-70" />
          {engineId}
        </span>
      )}
      {tokensConsumed != null && tokensConsumed > 0 && (
        <span
          className="inline-flex items-center gap-0.5"
          title={tokensTooltip(tokensConsumed, tokenBreakdown)}
        >
          <Coins size={10} className="opacity-70" />
          {formatTokens(tokensConsumed)}
        </span>
      )}
    </div>
  );
}
