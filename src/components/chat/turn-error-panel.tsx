import { useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatError } from '@/lib/error-format';

interface TurnErrorPanelProps {
  /** Error string surfaced from the streaming reducer (`turn.error`). */
  reason?: string;
  onRetry?: () => void;
}

/**
 * Error panel for the streaming chat bubble. Distinct from <ErrorState>
 * because it lives inside an already-rendered bubble — narrower, tighter
 * spacing, prominent retry CTA tinted to match the bubble's red accent.
 */
export function TurnErrorPanel({ reason, onRetry }: TurnErrorPanelProps) {
  const [showDetail, setShowDetail] = useState(false);
  const formatted = formatError(reason ?? new Error('Task failed'));
  const hasDetail = !!formatted.detail && formatted.detail !== formatted.title;

  return (
    <div className="bg-red/5 border border-red/30 rounded-md p-3 space-y-2">
      <div className="space-y-0.5">
        <div className="text-sm text-red font-medium wrap-break-word">{formatted.title}</div>
        {formatted.hint && (
          <div className="text-xs text-text-dim wrap-break-word">{formatted.hint}</div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {onRetry && formatted.retriable !== false && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded bg-red/10 hover:bg-red/20 border border-red/40 text-red transition-colors"
          >
            <RefreshCw size={11} /> Retry message
          </button>
        )}
        {hasDetail && (
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="inline-flex items-center gap-0.5 text-[11px] text-text-dim hover:text-text"
            aria-expanded={showDetail}
          >
            <ChevronDown
              size={11}
              className={cn('transition-transform', showDetail && 'rotate-180')}
            />
            {showDetail ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>
      {showDetail && hasDetail && (
        <pre className="max-h-32 overflow-auto rounded bg-bg/60 px-2 py-1.5 text-[11px] text-text-dim font-mono whitespace-pre-wrap break-all">
          {formatted.detail}
        </pre>
      )}
    </div>
  );
}
