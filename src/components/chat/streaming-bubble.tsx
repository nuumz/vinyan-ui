import { AlertTriangle, HelpCircle, RefreshCw } from 'lucide-react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { PhaseChip } from './phase-chip';
import { ToolCallCard } from './tool-call-card';
import { OracleVerdictRow } from './oracle-verdict-row';
import { Markdown } from './markdown';

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
  const hasActivity = turn.toolCalls.length > 0 || turn.oracleVerdicts.length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm space-y-2.5">
        {/* Header: phase chip + elapsed + escalation badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <PhaseChip phase={turn.currentPhase} active={isRunning} />
          <span className="text-xs text-text-dim tabular-nums">{formatElapsed(elapsed)}</span>
          {turn.escalations > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow/10 text-yellow border border-yellow/30">
              <AlertTriangle size={10} /> escalate ×{turn.escalations}
            </span>
          )}
        </div>

        {/* Activity: tool calls + oracle verdicts (collapsible) */}
        {hasActivity && (
          <details open className="group">
            <summary className="cursor-pointer text-xs text-text-dim hover:text-text list-none flex items-center gap-1">
              <span className="group-open:rotate-90 inline-block transition-transform">▸</span>
              Activity · {turn.toolCalls.length} tool{turn.toolCalls.length === 1 ? '' : 's'}
              {turn.oracleVerdicts.length > 0 && ` · ${turn.oracleVerdicts.length} verdict${turn.oracleVerdicts.length === 1 ? '' : 's'}`}
            </summary>
            <div className="mt-1.5 space-y-1">
              {turn.toolCalls.map((t) => (
                <ToolCallCard key={t.id} tool={t} />
              ))}
              {turn.oracleVerdicts.map((v, i) => (
                <OracleVerdictRow key={`${v.oracle}-${i}`} entry={v} />
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

        {/* Empty state while generating but no text yet */}
        {!turn.finalContent && isRunning && !hasActivity && (
          <div className="text-xs text-text-dim italic">Working on it…</div>
        )}
      </div>
    </div>
  );
}
