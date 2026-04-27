import { ChevronRight, Wrench } from 'lucide-react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { CriticVerdictRow } from './critic-verdict-row';
import { OracleVerdictRow } from './oracle-verdict-row';
import { PhaseTimeline } from './phase-timeline';
import { ReasoningBlock } from './reasoning-block';
import { ToolCallCard } from './tool-call-card';
import { cn } from '@/lib/utils';

interface DiagnosticsDrawerProps {
  turn: StreamingTurn;
}

/**
 * Single collapsed details block holding everything a power user might want
 * to see but a chat reader does not: phase timeline, oracle / critic
 * verdicts, raw reasoning fragments, the "Other tool activity" pile.
 *
 * Closed by default. Auto-opens when something demands attention — a failed
 * oracle / critic verdict, or any contract violation (already shown as a
 * chip in the header but worth surfacing details for too). The summary line
 * shows counts so a user can see at a glance whether opening it is worth it.
 */
export function DiagnosticsDrawer({ turn }: DiagnosticsDrawerProps) {
  const phaseCount = turn.phaseTimings.length;
  const oracleCount = turn.oracleVerdicts.length;
  const criticCount = turn.criticVerdicts.length;
  const reasoningCount = turn.reasoning.length;
  // Tools not attributed to a plan step are surfaced in PlanSurface's
  // "Other tool activity" group already. Diagnostics shows the full
  // global list as a fallback / debugging convenience.
  const totalTools = turn.toolCalls.length;

  const failedOracles = turn.oracleVerdicts.filter((v) => v.verdict === 'fail').length;
  const rejectedCritics = turn.criticVerdicts.filter((v) => !v.accepted).length;
  const shouldAutoOpen = failedOracles > 0 || rejectedCritics > 0;

  const summaryParts: string[] = [];
  if (phaseCount > 0) summaryParts.push(`${phaseCount} phase${phaseCount === 1 ? '' : 's'}`);
  if (oracleCount > 0) summaryParts.push(`${oracleCount} oracle`);
  if (criticCount > 0) summaryParts.push(`${criticCount} critic`);
  if (reasoningCount > 0) summaryParts.push(`${reasoningCount} reasoning`);
  if (totalTools > 0) summaryParts.push(`${totalTools} tool${totalTools === 1 ? '' : 's'}`);
  const hasContent = summaryParts.length > 0 || !!turn.thinking;
  if (!hasContent) return null;

  return (
    <details
      open={shouldAutoOpen}
      className="group rounded-md border border-border/40 bg-bg/20"
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-2 px-3 py-1.5',
          'text-[11px] text-text-dim hover:text-text transition-colors select-none',
        )}
      >
        <ChevronRight size={11} className="shrink-0 transition-transform group-open:rotate-90" />
        <span className="font-medium uppercase tracking-wide">Diagnostics</span>
        {summaryParts.length > 0 && (
          <span className="truncate font-mono normal-case tracking-normal">
            · {summaryParts.join(' · ')}
          </span>
        )}
        {shouldAutoOpen && (
          <span className="ml-auto text-[10px] text-red font-mono">
            {failedOracles > 0 && `${failedOracles} fail`}
            {failedOracles > 0 && rejectedCritics > 0 && ' · '}
            {rejectedCritics > 0 && `${rejectedCritics} reject`}
          </span>
        )}
      </summary>
      <div className="space-y-3 border-t border-border/30 px-3 py-2.5">
        {phaseCount > 0 && (
          <section className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-wide text-text-dim font-medium">
              Pipeline phases
            </h4>
            <PhaseTimeline
              timings={turn.phaseTimings}
              currentPhase={turn.currentPhase}
              status={turn.status}
            />
          </section>
        )}
        {(turn.thinking || reasoningCount > 0) && (
          <section className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-wide text-text-dim font-medium">
              Reasoning
            </h4>
            <ReasoningBlock
              fragments={turn.reasoning}
              finalThinking={turn.thinking}
              isRunning={turn.status === 'running'}
            />
          </section>
        )}
        {(oracleCount > 0 || criticCount > 0) && (
          <section className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-wide text-text-dim font-medium">
              Verdicts
            </h4>
            <div className="space-y-1">
              {turn.oracleVerdicts.map((v, i) => (
                <OracleVerdictRow key={`oracle-${v.oracle}-${i}`} entry={v} />
              ))}
              {turn.criticVerdicts.map((v, i) => (
                <CriticVerdictRow key={`critic-${i}`} entry={v} />
              ))}
            </div>
          </section>
        )}
        {totalTools > 0 && (
          <section className="space-y-1">
            <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-dim font-medium">
              <Wrench size={10} /> All tool activity
            </h4>
            <div className="space-y-1">
              {turn.toolCalls.map((t) => (
                <ToolCallCard key={`diag-${t.id}`} tool={t} />
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
