import { useConnectionStore } from '@/store/connection-store';

/**
 * Returns `ms` when SSE is disconnected, `false` when connected.
 * Wrap every query's `refetchInterval` with this so that SSE invalidation is
 * the primary freshness signal and polling is a fallback only.
 */
export function useFallbackInterval(ms: number): number | false {
  const sseConnected = useConnectionStore((s) => s.sseConnected);
  return sseConnected ? false : ms;
}
