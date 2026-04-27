import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  KeyRound,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  TimerOff,
  WifiOff,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { formatError, type ErrorKind } from '@/lib/error-format';

interface ErrorStateProps {
  /** Either an Error/ApiError or already-formatted message. Pass the Error
   *  when possible — we re-format it for nicer copy. */
  error?: unknown;
  /** Override the auto-derived title. */
  title?: string;
  /** Override the auto-derived hint. */
  hint?: string;
  /** Override the auto-derived technical detail line. */
  detail?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Compact = inline (e.g. inside drawer). Default = block (inside cards). */
  variant?: 'block' | 'compact';
}

const kindIcon: Record<ErrorKind, ComponentType<{ size?: number; className?: string }>> = {
  auth: KeyRound,
  network: WifiOff,
  timeout: TimerOff,
  server: ServerCrash,
  notfound: AlertTriangle,
  validation: ShieldAlert,
  rate: TimerOff,
  client: ShieldAlert,
  unknown: AlertTriangle,
};

/**
 * Operator-grade error surface for query failures. Distinct from
 * `<EmptyState>` — that one means "no data yet"; this one means "the
 * backend errored and we know it". Place inside content panels (cards,
 * table containers) and provide `onRetry` when the calling query exposes
 * a `refetch()`.
 */
export function ErrorState({
  error,
  title,
  hint,
  detail,
  onRetry,
  retrying,
  variant = 'block',
}: ErrorStateProps) {
  const [showDetail, setShowDetail] = useState(false);
  const formatted = formatError(error);

  const finalTitle = title ?? formatted.title;
  const finalHint = hint ?? formatted.hint;
  const finalDetail = detail ?? formatted.detail;
  const Icon = kindIcon[formatted.kind];

  const compact = variant === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3',
        compact ? 'py-4 px-3' : 'py-10 px-4',
      )}
    >
      <Icon size={compact ? 22 : 28} className="text-red" />
      <div className="space-y-1 max-w-md">
        <div className="text-sm font-medium text-text wrap-break-word">{finalTitle}</div>
        {finalHint && <div className="text-xs text-text-dim wrap-break-word">{finalHint}</div>}
      </div>
      {(onRetry || finalDetail) && (
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-border text-text hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} />
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
          {finalDetail && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-[11px] text-text-dim hover:text-text"
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
      )}
      {showDetail && finalDetail && (
        <pre className="max-w-lg w-full max-h-40 overflow-auto rounded bg-bg/60 border border-border px-2 py-1.5 text-[11px] text-text-dim font-mono whitespace-pre-wrap break-all text-left">
          {finalDetail}
        </pre>
      )}
    </div>
  );
}
