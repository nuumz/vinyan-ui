import { useState } from 'react';
import { ChevronRight, CheckCircle2, XCircle, Loader2, Wrench } from 'lucide-react';
import type { ToolCall } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

function summarizeArgs(args: unknown): string {
  if (args == null) return '';
  if (typeof args === 'string') return args.slice(0, 120);
  try {
    const s = JSON.stringify(args);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(args);
  }
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const Status = tool.status === 'success' ? CheckCircle2 : tool.status === 'error' ? XCircle : Loader2;
  const statusTone =
    tool.status === 'success' ? 'text-green' : tool.status === 'error' ? 'text-red' : 'text-text-dim';

  return (
    <div className="border border-border rounded-md bg-bg/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-surface-2/50 transition-colors text-left"
      >
        <ChevronRight
          size={12}
          className={cn('text-text-dim transition-transform shrink-0', open && 'rotate-90')}
        />
        <Wrench size={11} className="text-purple shrink-0" />
        <span className="font-mono text-text shrink-0">{tool.name}</span>
        <span className="text-text-dim truncate flex-1">{summarizeArgs(tool.args)}</span>
        {tool.durationMs != null && (
          <span className="text-text-dim shrink-0 tabular-nums">{tool.durationMs}ms</span>
        )}
        <Status size={12} className={cn(statusTone, 'shrink-0', tool.status === 'running' && 'animate-spin')} />
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 text-xs space-y-2 border-t border-border/50">
          {tool.args !== undefined && (
            <details open>
              <summary className="text-text-dim cursor-pointer">args</summary>
              <pre className="mt-1 p-2 bg-bg rounded overflow-auto max-h-48 text-[11px]">
                {typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args, null, 2)}
              </pre>
            </details>
          )}
          {tool.result !== undefined && (
            <details>
              <summary className="text-text-dim cursor-pointer">result</summary>
              <pre className="mt-1 p-2 bg-bg rounded overflow-auto max-h-48 text-[11px]">
                {typeof tool.result === 'string'
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
