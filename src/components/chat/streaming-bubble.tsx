import { AlertTriangle, HelpCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { CriticVerdictRow } from './critic-verdict-row';
import { EscalationBadge } from './escalation-badge';
import { Markdown } from './markdown';
import { OracleVerdictRow } from './oracle-verdict-row';
import { PhaseTimeline, WorkingStatusCard } from './phase-timeline';
import { ReasoningBlock } from './reasoning-block';
import { SessionSetupCard } from './session-setup-card';
import { StatsRow } from './stats-row';
import { ToolCallCard } from './tool-call-card';
import { summarizeToolCalls } from '@/lib/summarize-tools';

interface StreamingBubbleProps {
  turn: StreamingTurn;
  /** Wall-clock "now" in ms (updated by parent on a 1s tick). */
  nowMs: number;
  onRetry?: () => void;
}

function formatElapsed(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s - m * 60)}s`;
}

export function StreamingBubble({ turn, nowMs, onRetry }: StreamingBubbleProps) {
  const elapsed = (turn.finishedAt ?? nowMs) - turn.startedAt;
  const isRunning = turn.status === 'running';
  const activityCount =
    turn.toolCalls.length + turn.oracleVerdicts.length + turn.criticVerdicts.length;
  const hasActivity = activityCount > 0;
  const hasReasoning = turn.reasoning.length > 0 || !!turn.thinking;
  const isEmptyRunning = !turn.finalContent && isRunning && !hasActivity && !hasReasoning;

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm space-y-2.5">
        {/* Empty running: human-readable working status card */}
        {isEmptyRunning ? (
          <WorkingStatusCard
            timings={turn.phaseTimings}
            currentPhase={turn.currentPhase}
            elapsed={formatElapsed(elapsed)}
          />
        ) : (
          <>
            {/* Header: phase timeline + elapsed + stats + escalation + contract violations */}
            <div className="flex items-center gap-3 flex-wrap">
              <PhaseTimeline
                timings={turn.phaseTimings}
                currentPhase={turn.currentPhase}
                status={turn.status}
              />
              <span className="text-xs text-text-dim tabular-nums">{formatElapsed(elapsed)}</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <StatsRow
                  tokensConsumed={turn.tokensConsumed}
                  engineId={turn.engineId}
                  routingLevel={turn.routingLevel}
                />
                <EscalationBadge events={turn.escalations} />
                {turn.contractViolations && (
                  <span
                    title={`Contract policy: ${turn.contractViolations.policy}`}
                    className="inline-flex items-center gap-1 text-[10px] h-5 px-1.5 rounded bg-red/10 text-red border border-red/30 font-mono"
                  >
                    <ShieldAlert size={10} />
                    contract ×{turn.contractViolations.count}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Reasoning */}
        {hasReasoning && (
          <ReasoningBlock
            fragments={turn.reasoning}
            finalThinking={turn.thinking}
            isRunning={isRunning}
          />
        )}

        {/* Session setup card (Claude Code style) */}
        <SessionSetupCard turn={turn} />

        {/* Activity: tool calls + oracle + critic verdicts (collapsible) */}
        {hasActivity && (
          <details open className="group">
            <summary className="cursor-pointer text-xs text-text-dim hover:text-text list-none flex items-center gap-1 select-none">
              <span className="group-open:rotate-90 inline-block transition-transform">▸</span>
              {(() => {
                const toolPhrase = summarizeToolCalls(turn.toolCalls);
                const extras: string[] = [];
                if (turn.oracleVerdicts.length > 0) {
                  extras.push(
                    `${turn.oracleVerdicts.length} oracle verdict${turn.oracleVerdicts.length === 1 ? '' : 's'}`,
                  );
                }
                if (turn.criticVerdicts.length > 0) {
                  extras.push(
                    `${turn.criticVerdicts.length} critic verdict${turn.criticVerdicts.length === 1 ? '' : 's'}`,
                  );
                }
                const segments = [toolPhrase, ...extras].filter(Boolean) as string[];
                return segments.length > 0 ? segments.join(', ') : 'Activity';
              })()}
            </summary>
            <div className="mt-1.5 space-y-1">
              {turn.toolCalls.map((t) => (
                <ToolCallCard key={t.id} tool={t} />
              ))}
              {turn.oracleVerdicts.map((v, i) => (
                <OracleVerdictRow key={`oracle-${v.oracle}-${i}`} entry={v} />
              ))}
              {turn.criticVerdicts.map((v, i) => (
                <CriticVerdictRow key={`critic-${i}`} entry={v} />
              ))}
            </div>
          </details>
        )}

        {/* Clarification request */}
        {turn.status === 'input-required' && turn.clarifications.length > 0 && (
          <div className="bg-yellow/5 border border-yellow/20 rounded-md p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-yellow font-medium mb-1.5">
              <HelpCircle size={12} /> Clarification needed
            </div>
            <ul className="list-disc list-inside text-sm text-text-dim space-y-1">
              {turn.clarifications.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <div className="text-xs text-text-dim mt-1.5">Type your answer below to continue.</div>
          </div>
        )}

        {/* Error state */}
        {turn.status === 'error' && (
          <div className="bg-red/5 border border-red/20 rounded-md p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-red font-medium mb-1">
              <AlertTriangle size={12} /> {turn.error ?? 'Task failed'}
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-text mt-1"
              >
                <RefreshCw size={11} /> Retry
              </button>
            )}
          </div>
        )}

        {/* Streaming / final content */}
        {turn.finalContent && (
          <div className="text-text">
            <Markdown content={turn.finalContent} />
            {isRunning && (
              <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
