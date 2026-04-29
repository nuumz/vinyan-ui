import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

/**
 * A9/T4 — operator visibility for active degradation entries.
 *
 * Returns one of:
 *   - `healthy`         no active entries
 *   - `degraded`        fail-open entries present (capability reduced)
 *   - `partial-outage`  one or more fail-closed entries present
 *   - `unavailable`     tracker not wired (HTTP 503)
 */
export function useDegradationStatus() {
  return useQuery({
    queryKey: qk.degradationHealth,
    queryFn: () => api.getDegradationHealth(),
    refetchInterval: useFallbackInterval(15_000),
    // 503 (`unavailable`) is informational, not a hard error — surface it to the UI.
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 503) return false;
      return failureCount < 2;
    },
  });
}
