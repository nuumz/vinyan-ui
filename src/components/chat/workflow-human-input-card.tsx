import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { useProvideWorkflowHumanInput } from '@/hooks/use-approvals';
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
 * The mutation only POSTs the answer; tear-down comes from the matching
 * `workflow:human_input_provided` SSE event the reducer listens for.
 */
export function WorkflowHumanInputCard({
  sessionId,
  pending,
}: WorkflowHumanInputCardProps) {
  const provide = useProvideWorkflowHumanInput();
  const [value, setValue] = useState('');

  const busy = provide.isPending;
  const trimmed = value.trim();
  const canSubmit = !busy && trimmed.length > 0;

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
        disabled={busy}
        autoFocus
        rows={2}
        placeholder="Type your answer…"
        className={cn(
          'w-full text-sm bg-bg border border-border rounded px-2 py-1.5',
          'focus:outline-none focus:border-blue/60',
          busy && 'opacity-50 cursor-not-allowed',
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
        <span className="text-[10px] text-text-dim">⌘/Ctrl+Enter to send</span>
      </div>
    </form>
  );
}
