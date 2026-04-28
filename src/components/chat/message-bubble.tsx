import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  HelpCircle,
  Layers,
  Hash,
  ShieldCheck,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationEntry } from '@/lib/api-client';
import { Markdown } from './markdown';
import { HistoricalProcessCard } from './historical-process-card';

const INPUT_REQUIRED_TAG = '[INPUT-REQUIRED]';

function parseInputRequiredBlock(content: string): { preamble: string; questions: string[] } | null {
  const tagIdx = content.indexOf(INPUT_REQUIRED_TAG);
  if (tagIdx === -1) return null;
  const preamble = content.slice(0, tagIdx).trimEnd();
  const body = content.slice(tagIdx + INPUT_REQUIRED_TAG.length);
  const questions: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const q = trimmed.slice(2).trim();
      if (q) questions.push(q);
    } else if (trimmed.length > 0 && questions.length > 0) {
      break;
    }
  }
  return { preamble, questions };
}

/**
 * Backwards-compatible accessor for the `toolsUsed` field. Old backends
 * returned `string[]` (tool names); newer backends return
 * `{id, name, inputPreview}[]`. We normalize to display labels here so
 * every render path uses the same shape.
 */
function normalizeToolsUsed(
  toolsUsed: ConversationEntry['toolsUsed'],
): Array<{ key: string; label: string }> {
  if (!toolsUsed || toolsUsed.length === 0) return [];
  return toolsUsed.map((t, idx) =>
    typeof t === 'string'
      ? { key: `${idx}:${t}`, label: t }
      : { key: t.id || `${idx}:${t.name}`, label: t.name },
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m${sec}s`;
}

export function MessageBubble({ message }: { message: ConversationEntry }) {
  const isUser = message.role === 'user';
  const [showThinking, setShowThinking] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const clarification = !isUser ? parseInputRequiredBlock(message.content) : null;
  const tools = normalizeToolsUsed(message.toolsUsed);
  const trace = !isUser ? message.traceSummary : undefined;
  const hasProcess = !isUser && Boolean(message.taskId);

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm',
          isUser
            ? 'bg-accent/15 text-text border border-accent/20'
            : 'bg-surface border border-border text-text',
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap wrap-break-word">{message.content}</div>
        ) : clarification ? (
          <div className="space-y-2">
            {clarification.preamble && <Markdown content={clarification.preamble} />}
            {clarification.questions.length > 0 && (
              <div className="bg-yellow/5 border border-yellow/20 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 text-xs text-yellow font-medium mb-1.5">
                  <HelpCircle size={12} /> Clarification needed
                </div>
                <ul className="list-disc list-inside text-sm text-text-dim space-y-1">
                  {clarification.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <Markdown content={message.content} />
        )}

        {/*
          Trace summary chip row — model / routing level / duration / tokens.
          Shown only on assistant messages where the backend wired a
          TraceStore. Outcome leads as a colored status pill; remaining
          chips are quieter metadata with subtle leading icons.
        */}
        {trace && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border',
                trace.outcome === 'success'
                  ? 'bg-green/10 text-green border-green/25'
                  : trace.outcome === 'failure'
                    ? 'bg-red/10 text-red border-red/25'
                    : 'bg-yellow/10 text-yellow border-yellow/25',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  trace.outcome === 'success'
                    ? 'bg-green'
                    : trace.outcome === 'failure'
                      ? 'bg-red'
                      : 'bg-yellow',
                )}
              />
              {trace.outcome}
            </span>
            {trace.workerId && (
              // Surface the agent / worker that answered. Without this chip
              // the user cannot tell whether `developer`, `assistant`, or a
              // synthesized specialist responded — they'd have to dig into
              // the trace. Highest-priority chip after outcome.
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/25 font-medium"
                title="Agent"
              >
                <User size={10} />
                {trace.workerId}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
              title="Model"
            >
              <Cpu size={10} className="text-accent/80" />
              {trace.modelUsed}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
              title="Risk routing level"
            >
              <Layers size={10} />L{trace.routingLevel}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
              title="Duration"
            >
              <Clock size={10} />
              {formatDuration(trace.durationMs)}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
              title="Tokens consumed"
            >
              <Hash size={10} />
              {trace.tokensConsumed.toLocaleString()}
            </span>
            {trace.oracleVerdictCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
                title="Oracle verdicts"
              >
                <ShieldCheck size={10} />
                {trace.oracleVerdictCount}
              </span>
            )}
          </div>
        )}

        {message.thinking && (
          <div className="mt-2 border-t border-border/50 pt-2">
            <button
              type="button"
              className="text-xs text-text-dim hover:text-text transition-colors"
              onClick={() => setShowThinking(!showThinking)}
            >
              {showThinking ? 'Hide thinking' : 'Show thinking'}
            </button>
            {showThinking && (
              <pre className="mt-1 text-xs text-text-dim bg-bg/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                {message.thinking}
              </pre>
            )}
          </div>
        )}

        {tools.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tools.map((t) => (
              <span
                key={t.key}
                className="px-1.5 py-0.5 text-xs rounded bg-purple/10 text-purple border border-purple/20"
              >
                {t.label}
              </span>
            ))}
          </div>
        )}

        {/*
          Process replay is a secondary debug affordance. Keep the control
          in the footer with the timestamp (instead of adding another
          horizontal section) so the message body stays easy to scan.
        */}
        {hasProcess && showProcess && (
          <div className="mt-3">
            <HistoricalProcessCard taskId={message.taskId} />
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-text-dim">
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          {hasProcess && (
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
                'text-text-dim/80 hover:bg-bg/35 hover:text-text',
                showProcess && 'bg-bg/30 text-text',
              )}
              onClick={() => setShowProcess(!showProcess)}
              aria-expanded={showProcess}
            >
              <span className="font-medium">Process</span>
              {showProcess ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
