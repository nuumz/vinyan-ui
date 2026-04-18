/**
 * Tool invocation card — Copilot Chat-style.
 *
 * Row 1 (collapsed): status icon · tool name · arg preview · duration · chevron
 * Row 2 (expanded): file chips (if any) · args JSON · result JSON · error
 */
import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, Wrench, XCircle } from 'lucide-react';
import type { ToolCall } from '@/hooks/use-streaming-turn';
import { extractFilePaths } from '@/lib/parse-tool-args';
import { cn } from '@/lib/utils';
import { JsonView } from '../ui/json-view';
import { FileChip } from './file-chip';

function summarizeArgs(args: unknown): string {
  if (args == null) return '';
  if (typeof args === 'string') return args.length > 120 ? `${args.slice(0, 120)}…` : args;
  if (typeof args === 'object' && !Array.isArray(args)) {
    const rec = args as Record<string, unknown>;
    const preferredKey = ['query', 'pattern', 'path', 'file', 'filePath', 'command', 'url'].find(
      (k) => typeof rec[k] === 'string',
    );
    if (preferredKey) {
      const v = rec[preferredKey] as string;
      return `${preferredKey}: ${v.length > 100 ? `${v.slice(0, 100)}…` : v}`;
    }
  }
  try {
    const s = JSON.stringify(args);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(args);
  }
}

function statusBorderClass(status: ToolCall['status']): string {
  switch (status) {
    case 'success':
      return 'border-green/30';
    case 'error':
      return 'border-red/40';
    default:
      return 'border-border';
  }
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(tool.status === 'error');
  const StatusIcon =
    tool.status === 'success' ? CheckCircle2 : tool.status === 'error' ? XCircle : Loader2;
  const statusTone =
    tool.status === 'success'
      ? 'text-green'
      : tool.status === 'error'
        ? 'text-red'
        : 'text-text-dim';

  const filePaths = extractFilePaths(tool.args);
  const argsIsObject =
    tool.args != null && typeof tool.args === 'object' && !Array.isArray(tool.args);
  const resultIsObject =
    tool.result != null && typeof tool.result === 'object' && !Array.isArray(tool.result);

  return (
    <div
      className={cn(
        'border rounded-md bg-bg/40 transition-colors',
        statusBorderClass(tool.status),
      )}
    >
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
          <span className="text-text-dim shrink-0 tabular-nums text-[10px]">
            {tool.durationMs}ms
          </span>
        )}
        <StatusIcon
          size={12}
          className={cn(statusTone, 'shrink-0', tool.status === 'running' && 'animate-spin')}
        />
      </button>

      {open && (
        <div className="px-3 pb-2.5 pt-1.5 text-xs space-y-2 border-t border-border/50">
          {filePaths.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filePaths.map((p) => (
                <FileChip key={p} path={p} />
              ))}
            </div>
          )}

          {tool.args !== undefined && (
            <section>
              <div className="text-[10px] uppercase tracking-wide text-text-dim mb-1">args</div>
              {argsIsObject ? (
                <JsonView
                  data={tool.args}
                  collapsibleTopLevel={false}
                  className="max-h-48 overflow-auto"
                />
              ) : (
                <pre className="p-2 bg-bg rounded overflow-auto max-h-48 text-[11px] whitespace-pre-wrap font-mono">
                  {typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args, null, 2)}
                </pre>
              )}
            </section>
          )}

          {tool.result !== undefined && (
            <section>
              <div className="text-[10px] uppercase tracking-wide text-text-dim mb-1">
                {tool.status === 'error' ? 'error' : 'result'}
              </div>
              {resultIsObject ? (
                <JsonView
                  data={tool.result}
                  collapsibleTopLevel={false}
                  className="max-h-56 overflow-auto"
                />
              ) : (
                <pre
                  className={cn(
                    'p-2 rounded overflow-auto max-h-56 text-[11px] whitespace-pre-wrap font-mono',
                    tool.status === 'error' ? 'bg-red/5 text-red' : 'bg-bg',
                  )}
                >
                  {typeof tool.result === 'string'
                    ? tool.result
                    : JSON.stringify(tool.result, null, 2)}
                </pre>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
