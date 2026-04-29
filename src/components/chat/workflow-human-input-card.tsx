import { useState } from 'react';
import { Loader2, MessageSquare, Send, Sparkles, Zap } from 'lucide-react';
import {
  useProvideWorkflowHumanInput,
  useSuggestWorkflowHumanInput,
} from '@/hooks/use-approvals';
import type { PendingHumanInput } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

interface WorkflowHumanInputCardProps {
  sessionId: string;
  pending: PendingHumanInput;
}

/**
 * Inline answer prompt for a workflow `human-input` step.
 *
 * Distinct from `WorkflowApprovalCard`: that gates the WHOLE plan; this
 * gates ONE step inside the plan (e.g. step1 = "Ask the user for the
 * topic"). The user types an answer and submits — the backend resolves
 * the executor's wait and downstream steps continue.
 *
 * Two answer paths:
 *   - "Type your answer" + Send — the original free-form path
 *   - "Suggest answers" — backend asks the LLM for 3 candidate answers,
 *     rendered as click-to-fill chips. Each chip has a quick "Send"
 *     arrow that picks-and-sends in one click ("let the agent decide
 *     for me"), or the user can click the chip body to load it into the
 *     textarea for editing first. Added per user request — when the
 *     human-input question itself is hard to answer off the cuff
 *     (e.g. "What topic should the agents debate?") starting from
 *     candidates is much faster than a blank textarea.
 *
 * The mutation only POSTs the answer; tear-down comes from the matching
 * `workflow:human_input_provided` SSE event the reducer listens for.
 */
export function WorkflowHumanInputCard({
  sessionId,
  pending,
}: WorkflowHumanInputCardProps) {
  const provide = useProvideWorkflowHumanInput();
  const suggest = useSuggestWorkflowHumanInput();
  const [value, setValue] = useState('');

  const sending = provide.isPending;
  const suggesting = suggest.isPending;
  const trimmed = value.trim();
  const canSubmit = !sending && !suggesting && trimmed.length > 0;
  const suggestions = suggest.data?.suggestions ?? [];
  const suggestError = suggest.isError && !suggesting;

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    provide.mutate({
      sessionId,
      taskId: pending.taskId,
      stepId: pending.stepId,
      value: trimmed,
    });
  };

  const onRequestSuggestions = () => {
    if (suggesting || sending) return;
    suggest.mutate({
      sessionId,
      taskId: pending.taskId,
      stepId: pending.stepId,
      question: pending.question,
      count: 3,
    });
  };

  const fillFromSuggestion = (text: string) => {
    setValue(text);
  };

  const sendSuggestionDirectly = (text: string) => {
    if (sending) return;
    setValue(text);
    provide.mutate({
      sessionId,
      taskId: pending.taskId,
      stepId: pending.stepId,
      value: text,
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-blue/5 border border-blue/30 rounded-md p-3 space-y-2.5"
    >
      <div className="flex items-start gap-2">
        <MessageSquare size={14} className="text-blue shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-blue font-medium">Your answer is needed</div>
          {pending.question && (
            <div className="text-xs text-text mt-1 wrap-break-word">{pending.question}</div>
          )}
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={sending}
        autoFocus
        rows={2}
        placeholder="Type your answer…"
        className={cn(
          'w-full text-sm bg-bg border border-border rounded px-2 py-1.5',
          'focus:outline-none focus:border-blue/60',
          sending && 'opacity-50 cursor-not-allowed',
        )}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter submits — Enter alone newlines so multi-line
          // answers (paragraphs, lists) stay editable.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />

      {(suggestions.length > 0 || suggestError) && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-text-dim font-medium flex items-center gap-1">
            <Sparkles size={10} /> Suggested answers
          </div>
          {suggestError ? (
            <div className="text-[11px] text-red/85 italic">
              Could not generate suggestions — type your own answer below.
            </div>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li
                  key={`${i}-${s.slice(0, 24)}`}
                  className="flex items-stretch gap-1 rounded border border-blue/25 bg-blue/[0.05] hover:border-blue/45 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => fillFromSuggestion(s)}
                    disabled={sending}
                    className={cn(
                      'flex-1 min-w-0 px-2 py-1.5 text-left text-[11.5px] text-text/90 hover:bg-blue/[0.08] rounded-l',
                      sending && 'opacity-50 cursor-not-allowed',
                    )}
                    title="Click to load into the textarea (you can edit before sending)"
                  >
                    {s}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendSuggestionDirectly(s)}
                    disabled={sending}
                    aria-label="Send this answer immediately"
                    title="Send this answer right away"
                    className={cn(
                      'shrink-0 px-2 inline-flex items-center justify-center text-blue/85 hover:text-blue hover:bg-blue/15 rounded-r border-l border-blue/20',
                      sending && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Zap size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
            'bg-blue/15 hover:bg-blue/25 border border-blue/40 text-blue',
            !canSubmit && 'opacity-50 cursor-not-allowed hover:bg-blue/15',
          )}
        >
          <Send size={11} /> Send answer
        </button>
        <button
          type="button"
          onClick={onRequestSuggestions}
          disabled={suggesting || sending}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
            'bg-bg/40 hover:bg-bg/70 border border-border/60 text-text/80 hover:text-text',
            (suggesting || sending) && 'opacity-50 cursor-not-allowed',
          )}
          title="Ask the agent for 3 candidate answers you can click to fill or send"
        >
          {suggesting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {suggestions.length > 0 ? 'Suggest more' : 'Suggest answers'}
        </button>
        <span className="text-[10px] text-text-dim">⌘/Ctrl+Enter to send</span>
      </div>
    </form>
  );
}
