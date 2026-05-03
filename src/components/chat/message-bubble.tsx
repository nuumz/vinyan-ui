import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationEntry } from '@/lib/api-client';
import { toAgentMessage } from '@/types/session-timeline';
import { ActionCard, MetadataPillRow } from './action-card';
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

/**
 * Visual treatment for the orchestrator's chosen `approach`. Surfaces
 * routing strategy as a chip so users can see at a glance whether the
 * response came from a real workflow run or a single conversational turn.
 * Critical for catching hallucinated-delegation cases (session 44c83a53)
 * where coordinator promises delegation but routing chose
 * `conversational-shortcircuit` and no sub-agents ever ran.
 */
function approachChipMeta(approach: string): {
  label: string;
  Icon: typeof Zap;
  cls: string;
  title: string;
} {
  if (approach === 'conversational-shortcircuit' || approach === 'conversational') {
    return {
      label: 'Conversational',
      Icon: MessageCircle,
      cls: 'bg-yellow/10 text-yellow border-yellow/25',
      title: 'Single LLM turn — no sub-agents dispatched, no tools executed',
    };
  }
  if (approach === 'direct-tool') {
    return {
      label: 'Direct tool',
      Icon: Wrench,
      cls: 'bg-purple/10 text-purple border-purple/25',
      title: 'Routed to a single tool call, no workflow planning',
    };
  }
  if (approach === 'agentic-workflow' || approach.startsWith('agentic')) {
    return {
      label: 'Workflow',
      Icon: Workflow,
      cls: 'bg-blue/10 text-blue border-blue/25',
      title: 'Multi-step agentic workflow with delegation capability',
    };
  }
  return {
    label: approach,
    Icon: Zap,
    cls: 'bg-blue/10 text-blue border-blue/25',
    title: 'Routing approach',
  };
}

export function MessageBubble({ message }: { message: ConversationEntry }) {
  const isUser = message.role === 'user';
  const [showThinking, setShowThinking] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const clarification = !isUser ? parseInputRequiredBlock(message.content) : null;
  const tools = normalizeToolsUsed(message.toolsUsed);
  const trace = !isUser ? message.traceSummary : undefined;
  const agentMessage = !isUser ? toAgentMessage(message) : null;
  // Suppress the in-bubble "Process" toggle for agentic-workflow messages
  // because session-chat.tsx renders the persisted process card as its
  // own sibling bubble above this one. Toggling the same surface twice
  // would just be redundant.
  const hasProcess =
    !isUser && Boolean(message.taskId) && trace?.approach !== 'agentic-workflow';

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
              <ActionCard
                kind="clarification"
                bullets={clarification.questions}
                metadata={{
                  status: 'pending',
                  role: trace?.workerId ?? 'orchestrator',
                  tool: 'creative-clarification',
                  tier: trace?.routingLevel,
                  latencyMs: trace?.durationMs ?? 0,
                }}
              />
            )}
          </div>
        ) : (
          <Markdown content={message.content} />
        )}

        {/*
          Trace summary chip row — delegated to the shared MetadataPillRow
          so MessageBubble, ActionCard, and any future surface stay in
          lock-step. The approach chip is rendered alongside because it
          carries a kind-specific icon (Workflow / MessageCircle / Wrench)
          that doesn't fit the generic pill row's status/role/tool slots.
        */}
        {trace && agentMessage?.metadata && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <MetadataPillRow metadata={agentMessage.metadata} />
            {trace.approach &&
              (() => {
                const meta = approachChipMeta(trace.approach);
                const Icon = meta.Icon;
                return (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium',
                      meta.cls,
                    )}
                    title={meta.title}
                  >
                    <Icon size={10} />
                    {meta.label}
                  </span>
                );
              })()}
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
