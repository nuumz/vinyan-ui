/**
 * Tool invocation card — Claude Code-style.
 *
 * Header (always visible):
 *   [chevron] [BADGE] primary-preview               duration  status-icon
 * Sub-line: inline result preview (first 1-3 lines, no expand needed)
 * Expanded: file chips + full args JSON + full result JSON / error
 */
import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import type { ToolCall } from '@/hooks/use-streaming-turn';
import { extractFilePaths } from '@/lib/parse-tool-args';
import { toolPrimaryPreview } from '@/lib/summarize-tools';
import { cn } from '@/lib/utils';
import { JsonView } from '../ui/json-view';
import { FileChip } from './file-chip';
import { ResultPreview } from './result-preview';
import { ToolBadge } from './tool-badge';

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

function clampLine(s: string, max = 110): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
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
  const primary = toolPrimaryPreview(tool.name, tool.args);
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
        <ToolBadge name={tool.name} />
        <span className="text-text font-mono truncate flex-1 min-w-0">
          {primary || <span className="text-text-dim italic">no args</span>}
        </span>
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

      {!open && <ResultPreview tool={tool} />}

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
                  {typeof tool.args === 'string'
                    ? clampLine(tool.args, 4000)
                    : JSON.stringify(tool.args, null, 2)}
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
