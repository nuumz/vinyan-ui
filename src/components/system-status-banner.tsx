import { AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { useSystemStatus, type SystemStatus } from '@/hooks/use-system-status';

/**
 * Renders a top-of-page banner when the backend is unreachable. Invisible
 * while healthy. Provides a manual reload and shows the auto-reload countdown
 * when the system has been dead long enough to warrant a self-restart.
 */
export function SystemStatusBanner() {
  const { status, downSinceMs, autoReloadInMs, reloadNow } = useSystemStatus();

  if (status === 'online') return null;

  const config = getConfig(status, downSinceMs);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-2 text-xs border-b ${config.className}`}
    >
      <config.Icon size={14} className={config.iconClass} />
      <span className="flex-1">{config.message}</span>
      {status === 'dead' && (
        <>
          {autoReloadInMs !== null && (
            <span className="text-text-dim tabular-nums">
              auto-reload in {formatCountdown(autoReloadInMs)}
            </span>
          )}
          <button
            type="button"
            className="px-2 py-0.5 rounded bg-white/10 text-text hover:bg-white/15 transition-colors"
            onClick={reloadNow}
          >
            Reload now
          </button>
        </>
      )}
    </div>
  );
}

function getConfig(status: SystemStatus, downSinceMs: number | null) {
  switch (status) {
    case 'offline':
      return {
        Icon: WifiOff,
        iconClass: 'text-yellow',
        className: 'bg-yellow/10 border-yellow/20 text-yellow',
        message: 'You are offline. Vinyan will reconnect automatically when the network returns.',
      };
    case 'degraded':
      return {
        Icon: Loader2,
        iconClass: 'text-yellow animate-spin',
        className: 'bg-yellow/10 border-yellow/20 text-yellow',
        message: `Reconnecting to Vinyan… (${formatDuration(downSinceMs)})`,
      };
    case 'dead':
      return {
        Icon: AlertTriangle,
        iconClass: 'text-red',
        className: 'bg-red/10 border-red/30 text-red',
        message: `Vinyan backend unreachable for ${formatDuration(downSinceMs)}. Retrying every 30s.`,
      };
    default:
      return {
        Icon: Loader2,
        iconClass: '',
        className: '',
        message: '',
      };
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, '0')}`;
}
